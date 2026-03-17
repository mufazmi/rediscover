import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Radio, Pause, Play, Trash2, Filter, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { connect, startMonitor, stopMonitor, onMonitorData, onMonitorError, isConnected } from "@/lib/socket";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MonitorEntry {
  timestamp: string;
  client: string;
  db: string;
  command: string;
  args: string;
  type: "read" | "write" | "admin";
}

export default function Monitor() {
  const { activeConnectionId, activeDb } = useApp();
  const [isRunning, setIsRunning] = useState(false);
  const [entries, setEntries] = useState<MonitorEntry[]>([]);
  const [cmdFilter, setCmdFilter] = useState("");
  const [opsCounter, setOpsCounter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const cleanupRef = useRef<(() => void)[]>([]);
  const opsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const opsCountRef = useRef(0);

  // Connect to Socket.io on mount
  useEffect(() => {
    try {
      const socket = connect();
      setSocketConnected(isConnected());
      
      socket.on('connect', () => {
        setSocketConnected(true);
        setError(null);
      });
      
      socket.on('disconnect', () => {
        setSocketConnected(false);
        setIsRunning(false);
      });
      
      socket.on('connect_error', (err) => {
        setError(`Connection error: ${err.message}`);
        setSocketConnected(false);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to socket');
    }
  }, []);

  // Handle monitor start/stop
  useEffect(() => {
    if (!isRunning || !activeConnectionId || !socketConnected) {
      // Stop monitoring
      if (cleanupRef.current.length > 0) {
        try {
          stopMonitor();
        } catch (err) {
          console.error('Error stopping monitor:', err);
        }
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
      
      // Stop ops counter
      if (opsIntervalRef.current) {
        clearInterval(opsIntervalRef.current);
        opsIntervalRef.current = null;
      }
      
      return;
    }

    // Start monitoring
    try {
      setError(null);
      startMonitor(Number(activeConnectionId), activeDb);

      // Listen for monitor data
      const cleanupData = onMonitorData((data) => {
        const now = new Date(data.timestamp);
        
        // Parse command from the monitor output
        // Format: "timestamp [db source] command args"
        const commandParts = data.command.split(' ');
        const command = commandParts[0]?.toUpperCase() || '';
        const args = commandParts.slice(1).join(' ');
        
        // Determine command type
        const readCommands = ['GET', 'HGET', 'HGETALL', 'LRANGE', 'SMEMBERS', 'ZRANGE', 'MGET', 'KEYS', 'SCAN'];
        const adminCommands = ['SUBSCRIBE', 'PSUBSCRIBE', 'MONITOR', 'CONFIG', 'SHUTDOWN', 'FLUSHDB', 'FLUSHALL'];
        const type = readCommands.includes(command) ? 'read' : adminCommands.includes(command) ? 'admin' : 'write';
        
        const entry: MonitorEntry = {
          timestamp: `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`,
          client: data.source,
          db: data.database,
          command,
          args,
          type,
        };
        
        setEntries(prev => [...prev.slice(-200), entry]);
        opsCountRef.current++;
      });

      // Listen for monitor errors
      const cleanupError = onMonitorError((data) => {
        setError(data.message);
        setIsRunning(false);
      });

      cleanupRef.current = [cleanupData, cleanupError];
      
      // Start ops counter (update every second)
      opsIntervalRef.current = setInterval(() => {
        setOpsCounter(opsCountRef.current);
        opsCountRef.current = 0;
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start monitor');
      setIsRunning(false);
    }

    return () => {
      if (cleanupRef.current.length > 0) {
        try {
          stopMonitor();
        } catch (err) {
          console.error('Error stopping monitor:', err);
        }
        cleanupRef.current.forEach(cleanup => cleanup());
        cleanupRef.current = [];
      }
      
      if (opsIntervalRef.current) {
        clearInterval(opsIntervalRef.current);
        opsIntervalRef.current = null;
      }
    };
  }, [isRunning, activeConnectionId, activeDb, socketConnected]);

  const toggleMonitor = () => {
    if (!activeConnectionId) {
      setError('No active connection selected');
      return;
    }
    
    if (!socketConnected) {
      setError('Socket not connected');
      return;
    }
    
    setIsRunning(!isRunning);
  };

  const filtered = cmdFilter ? entries.filter(e => e.command.toLowerCase().includes(cmdFilter.toLowerCase())) : entries;

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5" />
          <h1 className="text-xl font-bold">Real-Time Monitor</h1>
          {isRunning && socketConnected && <span className="w-2 h-2 rounded-full bg-status-success animate-pulse-dot" />}
          {!socketConnected && <Badge variant="destructive" className="text-xs">Disconnected</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">{opsCounter} ops/s</Badge>
          <div className="relative">
            <Filter className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter command..."
              value={cmdFilter}
              onChange={(e) => setCmdFilter(e.target.value)}
              className="h-7 text-xs pl-7 w-40"
            />
          </div>
          <Button
            variant={isRunning ? "destructive" : "default"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={toggleMonitor}
            disabled={!socketConnected || !activeConnectionId}
          >
            {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isRunning ? "Pause" : "Resume"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setEntries([])}>
            <Trash2 className="w-3 h-3" /> Clear
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col bg-[hsl(220,25%,8%)] border-[hsl(220,20%,18%)]">
        <div className="grid grid-cols-[100px_160px_40px_80px_1fr] gap-2 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-[hsl(220,10%,40%)] border-b border-[hsl(220,20%,18%)]">
          <span>Timestamp</span>
          <span>Client</span>
          <span>DB</span>
          <span>Command</span>
          <span>Arguments</span>
        </div>
        <ScrollArea className="flex-1">
          <div className="px-4 py-1">
            {filtered.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                {isRunning ? 'Waiting for commands...' : 'Click Resume to start monitoring'}
              </div>
            )}
            {filtered.map((entry, i) => (
              <div key={i} className="grid grid-cols-[100px_160px_40px_80px_1fr] gap-2 py-0.5 text-xs font-mono border-b border-[hsl(220,20%,14%)]">
                <span className="text-[hsl(220,10%,40%)]">{entry.timestamp}</span>
                <span className="text-[hsl(220,10%,60%)]">{entry.client}</span>
                <span className="text-[hsl(220,10%,50%)]">{entry.db}</span>
                <span className={cn(
                  "font-medium",
                  entry.type === "read" ? "text-status-info" : entry.type === "write" ? "text-status-warning" : "text-status-error"
                )}>
                  {entry.command}
                </span>
                <span className="text-[hsl(0,0%,75%)] truncate">{entry.args}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
