import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/store/appContext";
import { clients } from "@/lib/redis-api";
import { Users, RefreshCw, Trash2, Clock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";

interface RedisClient {
  id: string;
  addr: string;
  user: string;
  name: string;
  db: number;
  cmd: string;
  idle: number; // seconds
  flags: string;
}

interface ClientsState {
  clients: RedisClient[];
  loading: boolean;
  error: string | null;
  filters: {
    address: string;
    name: string;
    command: string;
    user: string;
  };
}

/**
 * Format idle time as human-readable duration
 */
function formatIdleTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  } else {
    return `${Math.floor(seconds / 3600)}h`;
  }
}
/**
 * Debounce hook for filter inputs
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function ConnectedClients() {
  const { activeConnectionId } = useApp();
  const [state, setState] = useState<ClientsState>({
    clients: [],
    loading: true,
    error: null,
    filters: {
      address: "",
      name: "",
      command: "",
      user: "",
    },
  });
  const [killIdleThreshold, setKillIdleThreshold] = useState<string>("300");
  const [killIdleDialogOpen, setKillIdleDialogOpen] = useState(false);

  const fetchClients = useCallback(async () => {
    if (!activeConnectionId) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const data = await clients.getClients(Number(activeConnectionId));
      setState(prev => ({
        ...prev,
        clients: data.clients,
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch clients";
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      if (state.clients.length === 0) {
        toast.error(errorMessage);
      }
    }
  }, [activeConnectionId, state.clients.length]);

  // Auto-refresh every 5 seconds
  useEffect(() => {
    fetchClients();
    const interval = setInterval(fetchClients, 5000);
    return () => clearInterval(interval);
  }, [fetchClients]);

  // Reset state when connection changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      clients: [],
      loading: true,
      error: null,
    }));
  }, [activeConnectionId]);

  // Debounce filter values with 300ms delay
  const debouncedFilters = {
    address: useDebounce(state.filters.address, 300),
    name: useDebounce(state.filters.name, 300),
    command: useDebounce(state.filters.command, 300),
    user: useDebounce(state.filters.user, 300),
  };

  // Filter clients based on debounced search inputs
  const filteredClients = useMemo(() => {
    return state.clients.filter(client => {
      const { address, name, command, user } = debouncedFilters;
      return (
        (!address || client.addr.toLowerCase().includes(address.toLowerCase())) &&
        (!name || client.name.toLowerCase().includes(name.toLowerCase())) &&
        (!command || client.cmd.toLowerCase().includes(command.toLowerCase())) &&
        (!user || client.user.toLowerCase().includes(user.toLowerCase()))
      );
    });
  }, [state.clients, debouncedFilters]);

  const handleFilterChange = (field: keyof typeof state.filters, value: string) => {
    setState(prev => ({
      ...prev,
      filters: {
        ...prev.filters,
        [field]: value,
      },
    }));
  };

  const handleKillClient = async (clientId: string) => {
    if (!activeConnectionId) return;

    try {
      await clients.killClient(Number(activeConnectionId), clientId);
      toast.success("Client killed successfully");
      fetchClients(); // Refresh the list
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to kill client";
      toast.error(errorMessage);
    }
  };

  const handleKillIdleClients = async () => {
    if (!activeConnectionId) return;

    const threshold = parseInt(killIdleThreshold, 10);
    if (isNaN(threshold) || threshold <= 0) {
      toast.error("Please enter a valid idle threshold in seconds");
      return;
    }

    try {
      const result = await clients.killIdleClients(Number(activeConnectionId), threshold);
      toast.success(`Killed ${result.killed} idle clients`);
      setKillIdleDialogOpen(false);
      fetchClients(); // Refresh the list
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to kill idle clients";
      toast.error(errorMessage);
    }
  };

  if (state.loading && state.clients.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (state.error && state.clients.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <p>{state.error}</p>
        </div>
        <Button onClick={fetchClients} className="mt-4" variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Connected Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage active Redis client connections
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          Auto-refresh: 5s
        </Badge>
      </div>

      {/* Filter Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Input
          placeholder="Filter by address..."
          value={state.filters.address}
          onChange={(e) => handleFilterChange("address", e.target.value)}
          className="text-sm"
        />
        <Input
          placeholder="Filter by name..."
          value={state.filters.name}
          onChange={(e) => handleFilterChange("name", e.target.value)}
          className="text-sm"
        />
        <Input
          placeholder="Filter by command..."
          value={state.filters.command}
          onChange={(e) => handleFilterChange("command", e.target.value)}
          className="text-sm"
        />
        <Input
          placeholder="Filter by user..."
          value={state.filters.user}
          onChange={(e) => handleFilterChange("user", e.target.value)}
          className="text-sm"
        />
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={fetchClients} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <AlertDialog open={killIdleDialogOpen} onOpenChange={setKillIdleDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Clock className="w-4 h-4 mr-2" />
                Kill Idle Clients
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Kill Idle Clients</AlertDialogTitle>
                <AlertDialogDescription>
                  This will kill all clients that have been idle for more than the specified threshold.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <label className="text-sm font-medium">Idle threshold (seconds):</label>
                <Input
                  type="number"
                  value={killIdleThreshold}
                  onChange={(e) => setKillIdleThreshold(e.target.value)}
                  placeholder="300"
                  className="mt-1"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleKillIdleClients}>
                  Kill Idle Clients
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredClients.length} of {state.clients.length} clients
        </div>
      </div>

      {/* Clients Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Active Connections</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filteredClients.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              {state.clients.length === 0 ? "No clients connected" : "No clients match the current filters"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">ID</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-16">DB</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead className="w-20">Idle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-mono text-xs">{client.id}</TableCell>
                    <TableCell className="font-mono text-xs text-[#22d3ee]">
                      {client.addr}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{client.user}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {client.name || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{client.db}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {client.cmd || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatIdleTime(client.idle)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{client.flags}</TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Kill Client</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to kill client {client.id} ({client.addr})?
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleKillClient(client.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Kill Client
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}