import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { Activity, Play, Square, Pause, Trash2, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { connect, getSocket, isConnected } from "@/lib/socket";
import { Socket } from "socket.io-client";

interface CommandEvent {
  timestamp: number;
  db: number;
  client: string;
  command: string;
  args: string[];
}

interface CommandStats {
  topCommands: { command: string; count: number }[];
  topClients: { client: string; count: number }[];
  opsPerSecond: { time: string; ops: number }[];
  totalCommands: number;
}

interface ProfilerState {
  active: boolean;
  paused: boolean;
  events: CommandEvent[];
  stats: CommandStats;
  startTime: Date | null;
  timeoutWarning: boolean;
  loading: boolean;
  error: string | null;
  socketConnected: boolean;
}

const MAX_EVENTS = 1000;
const PROFILER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_TIME_MS = 4 * 60 * 1000; // 4 minutes

/**
 * Format timestamp as HH:MM:SS.mmm
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const milliseconds = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Get command type for color coding
 */
function getCommandType(command: string): "read" | "write" | "admin" {
  const readCommands = ["GET", "HGET", "HGETALL", "LRANGE", "SMEMBERS", "ZRANGE", "MGET", "KEYS", "SCAN", "EXISTS", "TYPE", "TTL"];
  const adminCommands = ["SUBSCRIBE", "PSUBSCRIBE", "MONITOR", "CONFIG", "SHUTDOWN", "FLUSHDB", "FLUSHALL", "CLIENT", "INFO"];
  
  if (readCommands.includes(command)) return "read";
  if (adminCommands.includes(command)) return "admin";
  return "write";
}

/**
 * Get color for command type
 */
function getCommandColor(type: "read" | "write" | "admin"): string {
  switch (type) {
    case "read": return "text-blue-400";
    case "write": return "text-yellow-400";
    case "admin": return "text-red-400";
  }
}

export default function CommandProfiler() {
  const { activeConnectionId, activeDb } = useApp();
  const [state, setState] = useState<ProfilerState>({
    active: false,
    paused: false,
    events: [],
    stats: {
      topCommands: [],
      topClients: [],
      opsPerSecond: [],
      totalCommands: 0,
    },
    startTime: null,
    timeoutWarning: false,
    loading: false,
    error: null,
    socketConnected: false,
  });

  const socketRef = useRef<Socket | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const opsCounterRef = useRef(0);
  const opsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Connect to Socket.io on mount
  useEffect(() => {
    try {
      const socket = connect();
      socketRef.current = socket;
      setState(prev => ({ ...prev, socketConnected: isConnected() }));
      
      socket.on('connect', () => {
        setState(prev => ({ ...prev, socketConnected: true, error: null }));
      });
      
      socket.on('disconnect', () => {
        setState(prev => ({ 
          ...prev, 
          socketConnected: false, 
          active: false,
          loading: false 
        }));
      });
      
      socket.on('connect_error', (err) => {
        setState(prev => ({ 
          ...prev, 
          error: `Connection error: ${err.message}`,
          socketConnected: false,
          active: false,
          loading: false
        }));
      });
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to connect to socket',
        socketConnected: false
      }));
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current.length > 0) {
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
      if (opsIntervalRef.current) {
        clearInterval(opsIntervalRef.current);
        opsIntervalRef.current = null;
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
    };
  }, []);

  // Calculate statistics from events
  const calculateStats = useCallback((events: CommandEvent[]): CommandStats => {
    const commandCounts = new Map<string, number>();
    const clientCounts = new Map<string, number>();
    
    events.forEach(event => {
      // Count commands
      const currentCount = commandCounts.get(event.command) || 0;
      commandCounts.set(event.command, currentCount + 1);
      
      // Count clients
      const currentClientCount = clientCounts.get(event.client) || 0;
      clientCounts.set(event.client, currentClientCount + 1);
    });

    // Get top 10 commands
    const topCommands = Array.from(commandCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([command, count]) => ({ command, count }));

    // Get top 10 clients
    const topClients = Array.from(clientCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([client, count]) => ({ client, count }));

    return {
      topCommands,
      topClients,
      opsPerSecond: state.stats.opsPerSecond, // Keep existing timeline
      totalCommands: events.length,
    };
  }, [state.stats.opsPerSecond]);

  // Handle profiler events
  useEffect(() => {
    if (!state.active || !socketRef.current || !state.socketConnected) {
      // Stop profiling
      if (cleanupRef.current.length > 0) {
        try {
          socketRef.current?.emit('stop-profiler');
        } catch (err) {
          console.error('Error stopping profiler:', err);
        }
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
      
      // Stop ops counter
      if (opsIntervalRef.current) {
        clearInterval(opsIntervalRef.current);
        opsIntervalRef.current = null;
      }

      // Clear warning timeout
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
      
      return;
    }

    // Start profiling
    try {
      setState(prev => ({ ...prev, error: null, loading: true }));
      
      // Emit start-profiler event
      socketRef.current.emit('start-profiler', { 
        connectionId: Number(activeConnectionId),
        db: activeDb 
      });

      // Listen for profiler events
      const handleProfilerStarted = (data: { connectionId: number; db: number; timeoutMs: number }) => {
        console.log('[Profiler] Started:', data);
        setState(prev => ({ 
          ...prev, 
          loading: false,
          startTime: new Date(),
          timeoutWarning: false
        }));

        // Set warning timeout for 4 minutes
        warningTimeoutRef.current = setTimeout(() => {
          setState(prev => ({ ...prev, timeoutWarning: true }));
        }, WARNING_TIME_MS);
      };

      const handleProfilerCommand = (data: { event: CommandEvent }) => {
        if (state.paused) return;

        const event = data.event;
        opsCounterRef.current++;

        setState(prev => {
          const newEvents = [...prev.events, event].slice(-MAX_EVENTS);
          const newStats = calculateStats(newEvents);
          
          return {
            ...prev,
            events: newEvents,
            stats: newStats,
          };
        });

        // Auto-scroll to bottom
        if (scrollAreaRef.current) {
          const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        }
      };

      const handleProfilerStopped = (data: { reason: string; message: string }) => {
        console.log('[Profiler] Stopped:', data);
        setState(prev => ({ 
          ...prev, 
          active: false, 
          loading: false,
          timeoutWarning: false
        }));
      };

      const handleProfilerError = (data: { message: string }) => {
        console.error('[Profiler] Error:', data.message);
        setState(prev => ({ 
          ...prev, 
          error: data.message, 
          active: false, 
          loading: false,
          timeoutWarning: false
        }));
      };

      // Register event listeners
      socketRef.current.on('profiler-started', handleProfilerStarted);
      socketRef.current.on('profiler-command', handleProfilerCommand);
      socketRef.current.on('profiler-stopped', handleProfilerStopped);
      socketRef.current.on('profiler-error', handleProfilerError);

      cleanupRef.current = [
        () => socketRef.current?.off('profiler-started', handleProfilerStarted),
        () => socketRef.current?.off('profiler-command', handleProfilerCommand),
        () => socketRef.current?.off('profiler-stopped', handleProfilerStopped),
        () => socketRef.current?.off('profiler-error', handleProfilerError),
      ];
      
      // Start ops counter (update every second)
      opsIntervalRef.current = setInterval(() => {
        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
        
        setState(prev => ({
          ...prev,
          stats: {
            ...prev.stats,
            opsPerSecond: [
              ...prev.stats.opsPerSecond.slice(-29), // Keep last 30 data points
              { time: timeStr, ops: opsCounterRef.current }
            ]
          }
        }));
        
        opsCounterRef.current = 0;
      }, 1000);
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to start profiler',
        active: false,
        loading: false
      }));
    }

    return () => {
      if (cleanupRef.current.length > 0) {
        try {
          socketRef.current?.emit('stop-profiler');
        } catch (err) {
          console.error('Error stopping profiler:', err);
        }
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
      
      if (opsIntervalRef.current) {
        clearInterval(opsIntervalRef.current);
        opsIntervalRef.current = null;
      }

      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
    };
  }, [state.active, state.paused, activeConnectionId, activeDb, state.socketConnected, calculateStats]);

  const toggleProfiler = () => {
    if (!activeConnectionId) {
      setState(prev => ({ ...prev, error: 'No active connection selected' }));
      return;
    }
    
    if (!state.socketConnected) {
      setState(prev => ({ ...prev, error: 'Socket not connected' }));
      return;
    }
    
    setState(prev => ({ ...prev, active: !prev.active }));
  };

  const togglePause = () => {
    setState(prev => ({ ...prev, paused: !prev.paused }));
  };

  const clearEvents = () => {
    setState(prev => ({ 
      ...prev, 
      events: [],
      stats: {
        topCommands: [],
        topClients: [],
        opsPerSecond: prev.stats.opsPerSecond, // Keep timeline
        totalCommands: 0,
      }
    }));
  };

  const filteredEvents = useMemo(() => {
    return state.events.slice().reverse(); // Show newest first
  }, [state.events]);

  // Show skeleton loading state when initially loading
  if (state.loading && !state.socketConnected && state.events.length === 0) {
    return (
      <div className="h-[calc(100vh-7.5rem)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="h-16" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="flex-1" />
      </div>
    );
  }

  // Show error state when socket connection fails and no data available
  if (state.error && !state.socketConnected && state.events.length === 0) {
    return (
      <div className="h-[calc(100vh-7.5rem)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Command Profiler
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time command analysis using Redis MONITOR
            </p>
          </div>
        </div>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p>{state.error}</p>
          </div>
          <Button 
            onClick={() => window.location.reload()} 
            className="mt-4" 
            variant="outline"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry Connection
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Alert */}
      {state.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {/* Performance Warning */}
      <Alert className="border-yellow-500/50 bg-yellow-500/10">
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        <AlertDescription className="text-yellow-200">
          <strong>Performance Impact:</strong> Command profiling uses Redis MONITOR which can impact performance on high-traffic instances.
        </AlertDescription>
      </Alert>

      {/* Timeout Warning */}
      {state.timeoutWarning && (
        <Alert className="border-orange-500/50 bg-orange-500/10">
          <AlertTriangle className="h-4 w-4 text-orange-500" />
          <AlertDescription className="text-orange-200">
            <strong>Timeout Warning:</strong> Profiling will automatically stop in 1 minute (5-minute limit).
          </AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          <h1 className="text-xl font-bold">Command Profiler</h1>
          {state.active && (
            <Badge variant={state.loading ? "secondary" : "default"} className="text-xs">
              {state.loading ? "Starting..." : "Active"}
            </Badge>
          )}
          {!state.socketConnected && (
            <Badge variant="destructive" className="text-xs">Disconnected</Badge>
          )}
        </div>
        
        {/* Control Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant={state.active ? "destructive" : "default"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={toggleProfiler}
            disabled={!state.socketConnected || !activeConnectionId || state.loading}
          >
            {state.active ? (
              <>
                <Square className="w-3 h-3" />
                Stop Profiling
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Start Profiling
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Top Commands */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Top Commands</CardTitle>
          </CardHeader>
          <CardContent>
            {state.stats.topCommands.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
                No data available
              </div>
            ) : (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={state.stats.topCommands} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                    <XAxis 
                      dataKey="command" 
                      tick={{ fontSize: 10, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111111",
                        border: "1px solid #1f1f1f",
                        borderRadius: "6px",
                        fontSize: "10px",
                        color: "#ffffff",
                      }}
                      formatter={(value: number) => [value, "Count"]}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="#22d3ee"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Top Clients</CardTitle>
          </CardHeader>
          <CardContent>
            {state.stats.topClients.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
                No data available
              </div>
            ) : (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={state.stats.topClients} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                    <XAxis 
                      dataKey="client" 
                      tick={{ fontSize: 10, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111111",
                        border: "1px solid #1f1f1f",
                        borderRadius: "6px",
                        fontSize: "10px",
                        color: "#ffffff",
                      }}
                      formatter={(value: number) => [value, "Commands"]}
                    />
                    <Bar 
                      dataKey="count" 
                      fill="#f59e0b"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commands Per Second */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Commands Per Second</CardTitle>
          </CardHeader>
          <CardContent>
            {state.stats.opsPerSecond.length === 0 ? (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-xs">
                No data available
              </div>
            ) : (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={state.stats.opsPerSecond} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                    <XAxis 
                      dataKey="time" 
                      tick={{ fontSize: 10, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <YAxis 
                      tick={{ fontSize: 10, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111111",
                        border: "1px solid #1f1f1f",
                        borderRadius: "6px",
                        fontSize: "10px",
                        color: "#ffffff",
                      }}
                      formatter={(value: number) => [value, "Ops/sec"]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="ops" 
                      stroke="#22c55e" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live Command Stream */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Live Command Stream</CardTitle>
              <Badge variant="outline" className="text-xs">
                {state.stats.totalCommands} commands
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={togglePause}
                disabled={!state.active}
              >
                <Pause className="w-3 h-3" />
                {state.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={clearEvents}
              >
                <Trash2 className="w-3 h-3" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <div className="grid grid-cols-[100px_160px_40px_80px_1fr] gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-[hsl(220,10%,40%)] border-b border-[hsl(220,20%,18%)]">
            <span>Timestamp</span>
            <span>Client</span>
            <span>DB</span>
            <span>Command</span>
            <span>Arguments</span>
          </div>
          <ScrollArea className="flex-1" ref={scrollAreaRef}>
            <div className="px-4 py-1">
              {filteredEvents.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {state.active ? 'Waiting for commands...' : 'Click "Start Profiling" to begin monitoring'}
                </div>
              )}
              {filteredEvents.map((event, i) => {
                const commandType = getCommandType(event.command);
                const commandColor = getCommandColor(commandType);
                
                return (
                  <div key={`${event.timestamp}-${i}`} className="grid grid-cols-[100px_160px_40px_80px_1fr] gap-2 py-0.5 text-xs font-mono text-[#22d3ee] border-b border-[hsl(220,20%,14%)]">
                    <span className="text-[hsl(220,10%,40%)]">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className="text-[hsl(220,10%,60%)] truncate">
                      {event.client}
                    </span>
                    <span className="text-[hsl(220,10%,50%)]">
                      {event.db}
                    </span>
                    <span className={cn("font-medium", commandColor)}>
                      {event.command}
                    </span>
                    <span className="text-[hsl(0,0%,75%)] truncate">
                      {event.args.join(' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}