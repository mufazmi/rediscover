import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bell, Play, Square, Pause, Trash2, AlertCircle, Settings, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { connect, getSocket, isConnected } from "@/lib/socket";
import { keyspace } from "@/lib/redis-api";
import { Socket } from "socket.io-client";

interface KeyspaceEvent {
  timestamp: number;
  type: string; // 'set', 'del', 'expire', 'expired', etc.
  key: string;
  db: number;
}

interface KeyspaceState {
  active: boolean;
  paused: boolean;
  events: KeyspaceEvent[];
  config: string; // Current notify-keyspace-events value
  filters: Set<string>; // Active event type filters
  loading: boolean;
  error: string | null;
  socketConnected: boolean;
  configLoading: boolean;
}

const MAX_EVENTS = 1000;

// Event type definitions with colors
const EVENT_TYPES = [
  { type: 'set', label: 'SET', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  { type: 'del', label: 'DEL', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { type: 'expire', label: 'EXPIRE', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { type: 'expired', label: 'EXPIRED', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { type: 'hset', label: 'HSET', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { type: 'lpush', label: 'LPUSH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { type: 'rpush', label: 'RPUSH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { type: 'sadd', label: 'SADD', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  { type: 'zadd', label: 'ZADD', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
  { type: 'rename_from', label: 'RENAME', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  { type: 'rename_to', label: 'RENAME', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
];

// Configuration presets
const CONFIG_PRESETS = [
  { key: 'none', label: 'None', value: '', description: 'Disable keyspace notifications' },
  { key: 'expired', label: 'Expired Only', value: 'Ex', description: 'Only expired key events' },
  { key: 'all', label: 'All Events', value: 'AKE', description: 'All keyspace and keyevent notifications' },
];

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
 * Get event type configuration
 */
function getEventTypeConfig(type: string) {
  const eventConfig = EVENT_TYPES.find(e => e.type === type);
  return eventConfig || { 
    type, 
    label: type.toUpperCase(), 
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' 
  };
}

export default function KeyspaceEvents() {
  const { activeConnectionId, activeDb } = useApp();
  const [state, setState] = useState<KeyspaceState>({
    active: false,
    paused: false,
    events: [],
    config: '',
    filters: new Set(EVENT_TYPES.map(e => e.type)), // All filters enabled by default
    loading: false,
    error: null,
    socketConnected: false,
    configLoading: false,
  });

  const socketRef = useRef<Socket | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
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

  // Load current keyspace config on mount and connection change
  useEffect(() => {
    if (activeConnectionId) {
      loadKeyspaceConfig();
    }
  }, [activeConnectionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current.length > 0) {
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
    };
  }, []);

  const loadKeyspaceConfig = async () => {
    if (!activeConnectionId) return;
    
    setState(prev => ({ ...prev, configLoading: true }));
    try {
      // Get current notify-keyspace-events config
      const response = await keyspace.getConfig(Number(activeConnectionId));
      setState(prev => ({ 
        ...prev, 
        config: response.config || '',
        configLoading: false 
      }));
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to load keyspace config',
        configLoading: false
      }));
    }
  };

  const setConfigPreset = async (presetKey: string) => {
    if (!activeConnectionId) return;
    
    const preset = CONFIG_PRESETS.find(p => p.key === presetKey);
    if (!preset) return;
    
    setState(prev => ({ ...prev, configLoading: true }));
    try {
      await keyspace.setConfig(Number(activeConnectionId), preset.key as 'none' | 'expired' | 'all');
      setState(prev => ({ 
        ...prev, 
        config: preset.value,
        configLoading: false 
      }));
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to set keyspace config',
        configLoading: false
      }));
    }
  };

  // Handle keyspace events
  useEffect(() => {
    if (!state.active || !socketRef.current || !state.socketConnected) {
      // Stop keyspace events
      if (cleanupRef.current.length > 0) {
        try {
          socketRef.current?.emit('stop-keyspace-events');
        } catch (err) {
          console.error('Error stopping keyspace events:', err);
        }
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
      
      return;
    }

    // Start keyspace events
    try {
      setState(prev => ({ ...prev, error: null, loading: true }));
      
      // Emit start-keyspace-events event
      socketRef.current.emit('start-keyspace-events', { 
        connectionId: Number(activeConnectionId)
      });

      // Listen for keyspace events
      const handleKeyspaceStarted = (data: { connectionId: number }) => {
        console.log('[Keyspace] Started:', data);
        setState(prev => ({ 
          ...prev, 
          loading: false
        }));
      };

      const handleKeyspaceEvent = (data: { event: KeyspaceEvent }) => {
        if (state.paused) return;

        const event = data.event;

        setState(prev => {
          const newEvents = [...prev.events, event].slice(-MAX_EVENTS);
          
          return {
            ...prev,
            events: newEvents,
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

      const handleKeyspaceStopped = (data: { reason: string }) => {
        console.log('[Keyspace] Stopped:', data);
        setState(prev => ({ 
          ...prev, 
          active: false, 
          loading: false
        }));
      };

      const handleKeyspaceError = (data: { error: string }) => {
        console.error('[Keyspace] Error:', data.error);
        setState(prev => ({ 
          ...prev, 
          error: data.error, 
          active: false, 
          loading: false
        }));
      };

      // Register event listeners
      socketRef.current.on('keyspace-started', handleKeyspaceStarted);
      socketRef.current.on('keyspace-event', handleKeyspaceEvent);
      socketRef.current.on('keyspace-stopped', handleKeyspaceStopped);
      socketRef.current.on('keyspace-error', handleKeyspaceError);

      cleanupRef.current = [
        () => socketRef.current?.off('keyspace-started', handleKeyspaceStarted),
        () => socketRef.current?.off('keyspace-event', handleKeyspaceEvent),
        () => socketRef.current?.off('keyspace-stopped', handleKeyspaceStopped),
        () => socketRef.current?.off('keyspace-error', handleKeyspaceError),
      ];
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err instanceof Error ? err.message : 'Failed to start keyspace events',
        active: false,
        loading: false
      }));
    }

    return () => {
      if (cleanupRef.current.length > 0) {
        try {
          socketRef.current?.emit('stop-keyspace-events');
        } catch (err) {
          console.error('Error stopping keyspace events:', err);
        }
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
    };
  }, [state.active, state.paused, activeConnectionId, state.socketConnected]);

  const toggleMonitoring = () => {
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
      events: []
    }));
  };

  const toggleFilter = (eventType: string) => {
    setState(prev => {
      const newFilters = new Set(prev.filters);
      if (newFilters.has(eventType)) {
        newFilters.delete(eventType);
      } else {
        newFilters.add(eventType);
      }
      return { ...prev, filters: newFilters };
    });
  };

  const filteredEvents = useMemo(() => {
    return state.events
      .filter(event => state.filters.has(event.type))
      .slice()
      .reverse(); // Show newest first
  }, [state.events, state.filters]);

  // Show skeleton loading state when initially loading
  if (state.configLoading && !state.config && state.events.length === 0) {
    return (
      <div className="h-[calc(100vh-7.5rem)] flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
        </div>
        <Skeleton className="h-24" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>
        <Skeleton className="h-20" />
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
              <Bell className="w-5 h-5" />
              Keyspace Events
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor Redis keyspace notifications in real-time
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

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5" />
          <h1 className="text-xl font-bold">Keyspace Events</h1>
          {state.active && (
            <Badge variant={state.loading ? "secondary" : "default"} className="text-xs">
              {state.loading ? "Starting..." : "Active"}
            </Badge>
          )}
          {!state.socketConnected && (
            <Badge variant="destructive" className="text-xs">Disconnected</Badge>
          )}
        </div>
      </div>

      {/* Configuration Panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            <CardTitle className="text-sm">Configuration</CardTitle>
            <Badge variant="outline" className="text-xs font-mono">
              notify-keyspace-events: {state.config || '(empty)'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Presets:</span>
            {CONFIG_PRESETS.map(preset => (
              <Button
                key={preset.key}
                variant={state.config === preset.value ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setConfigPreset(preset.key)}
                disabled={state.configLoading}
                title={preset.description}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Control Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={state.active ? "destructive" : "default"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={toggleMonitoring}
            disabled={!state.socketConnected || !activeConnectionId || state.loading}
          >
            {state.active ? (
              <>
                <Square className="w-3 h-3" />
                Stop Monitoring
              </>
            ) : (
              <>
                <Play className="w-3 h-3" />
                Start Monitoring
              </>
            )}
          </Button>
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

      {/* Event Type Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Event Type Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map(eventType => (
              <Button
                key={eventType.type}
                variant={state.filters.has(eventType.type) ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => toggleFilter(eventType.type)}
              >
                {eventType.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Event Stream */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">Event Stream</CardTitle>
              <Badge variant="outline" className="text-xs">
                {filteredEvents.length} events
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-0">
          <div className="grid grid-cols-[100px_80px_60px_1fr_40px] gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-[hsl(220,10%,40%)] border-b border-[hsl(220,20%,18%)]">
            <span>Timestamp</span>
            <span>Event Type</span>
            <span>Database</span>
            <span>Key Name</span>
            <span></span>
          </div>
          <ScrollArea className="flex-1" ref={scrollAreaRef}>
            <div className="px-4 py-1">
              {filteredEvents.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {state.active ? 'Waiting for keyspace events...' : 'Click "Start Monitoring" to begin monitoring keyspace events'}
                </div>
              )}
              {filteredEvents.map((event, i) => {
                const eventConfig = getEventTypeConfig(event.type);
                
                return (
                  <div key={`${event.timestamp}-${i}`} className="grid grid-cols-[100px_80px_60px_1fr_40px] gap-2 py-1 text-xs border-b border-[hsl(220,20%,14%)] items-center">
                    <span className="text-[hsl(220,10%,40%)] font-mono text-[10px]">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <Badge 
                      variant="outline" 
                      className={cn("text-[10px] h-5 px-1", eventConfig.color)}
                    >
                      {eventConfig.label}
                    </Badge>
                    <span className="text-[hsl(220,10%,50%)] text-center">
                      {event.db}
                    </span>
                    <span className="text-[#22d3ee] font-mono truncate">
                      {event.key}
                    </span>
                    <span></span>
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