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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useApp } from "@/store/appContext";
import { ttl } from "@/lib/redis-api";
import { Clock, RefreshCw, Plus, Minus, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface TTLDistribution {
  noTTL: number;
  lessThan1Min: number;
  oneToSixtyMin: number;
  oneToTwentyFourHours: number;
  moreThanTwentyFourHours: number;
}

interface ExpiringKey {
  key: string;
  type: string;
  ttl: number; // seconds remaining
  db: number;
}

interface TTLState {
  distribution: TTLDistribution | null;
  expiringKeys: ExpiringKey[];
  loading: boolean;
  error: string | null;
  countdownInterval: NodeJS.Timeout | null;
}

interface BulkTTLDialog {
  type: 'apply' | 'remove' | null;
  open: boolean;
  pattern: string;
  ttlSeconds: string;
}

/**
 * Format TTL seconds as human-readable duration
 */
function formatTTL(seconds: number): string {
  if (seconds <= 0) return "Expired";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/**
 * Get color for TTL countdown based on remaining time
 */
function getTTLColor(seconds: number): string {
  if (seconds <= 10) return "text-red-400";
  if (seconds <= 30) return "text-yellow-400";
  return "text-green-400";
}

export default function TTLManager() {
  const { activeConnectionId, activeDb } = useApp();
  const [state, setState] = useState<TTLState>({
    distribution: null,
    expiringKeys: [],
    loading: true,
    error: null,
    countdownInterval: null,
  });
  const [bulkDialog, setBulkDialog] = useState<BulkTTLDialog>({
    type: null,
    open: false,
    pattern: "",
    ttlSeconds: "3600",
  });

  const fetchData = useCallback(async () => {
    if (!activeConnectionId) return;

    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      const [distributionData, expiringData] = await Promise.all([
        ttl.getDistribution(Number(activeConnectionId), activeDb),
        ttl.getExpiringSoon(Number(activeConnectionId), activeDb),
      ]);

      setState(prev => ({
        ...prev,
        distribution: distributionData,
        expiringKeys: expiringData.keys,
        loading: false,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch TTL data";
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      if (!state.distribution && state.expiringKeys.length === 0) {
        toast.error(errorMessage);
      }
    }
  }, [activeConnectionId, activeDb, state.distribution, state.expiringKeys.length]);

  // Fetch data on page load and connection/database change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset state when connection or database changes
  useEffect(() => {
    setState(prev => ({
      ...prev,
      distribution: null,
      expiringKeys: [],
      loading: true,
      error: null,
    }));
  }, [activeConnectionId, activeDb]);

  // Live countdown timer for expiring keys
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        expiringKeys: prev.expiringKeys
          .map(key => ({ ...key, ttl: Math.max(0, key.ttl - 1) }))
          .filter(key => key.ttl > 0), // Remove expired keys
      }));
    }, 1000);

    setState(prev => ({ ...prev, countdownInterval: interval }));

    return () => {
      clearInterval(interval);
      setState(prev => ({ ...prev, countdownInterval: null }));
    };
  }, []);

  // Prepare histogram data
  const histogramData = useMemo(() => {
    if (!state.distribution) return [];

    return [
      {
        name: "No TTL",
        count: state.distribution.noTTL,
        color: "#6b7280", // gray
      },
      {
        name: "<1 min",
        count: state.distribution.lessThan1Min,
        color: "#ef4444", // red
      },
      {
        name: "1-60 min",
        count: state.distribution.oneToSixtyMin,
        color: "#f59e0b", // orange
      },
      {
        name: "1-24 hrs",
        count: state.distribution.oneToTwentyFourHours,
        color: "#22d3ee", // cyan
      },
      {
        name: ">24 hrs",
        count: state.distribution.moreThanTwentyFourHours,
        color: "#22c55e", // green
      },
    ];
  }, [state.distribution]);

  const handleBulkOperation = async () => {
    if (!activeConnectionId || !bulkDialog.type) return;

    const pattern = bulkDialog.pattern.trim();
    if (!pattern) {
      toast.error("Please enter a key pattern");
      return;
    }

    try {
      let result;
      if (bulkDialog.type === 'apply') {
        const ttlSeconds = parseInt(bulkDialog.ttlSeconds, 10);
        if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
          toast.error("Please enter a valid TTL in seconds");
          return;
        }
        result = await ttl.bulkApply(Number(activeConnectionId), pattern, ttlSeconds, activeDb);
        toast.success(`Applied TTL to ${result.affected} keys`);
      } else {
        result = await ttl.bulkRemove(Number(activeConnectionId), pattern, activeDb);
        toast.success(`Removed TTL from ${result.affected} keys`);
      }

      setBulkDialog({ type: null, open: false, pattern: "", ttlSeconds: "3600" });
      fetchData(); // Refresh data
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to perform bulk operation";
      toast.error(errorMessage);
    }
  };

  if (state.loading && !state.distribution && state.expiringKeys.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-1" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (state.error && !state.distribution && state.expiringKeys.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              TTL Manager
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage key expiration times and visualize TTL distribution
            </p>
          </div>
        </div>
        <Card className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <p>{state.error}</p>
          </div>
          <Button onClick={fetchData} className="mt-4" variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <h1 className="text-xl font-bold">TTL Manager</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage key expiration times and visualize TTL distribution
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" disabled={state.loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${state.loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* TTL Distribution and Expiring Keys */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* TTL Distribution Histogram */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">TTL Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {histogramData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground">
                No data available
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histogramData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                    <XAxis 
                      dataKey="name" 
                      tick={{ fontSize: 11, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <YAxis 
                      tick={{ fontSize: 11, fill: "#888888" }}
                      axisLine={{ stroke: "#1f1f1f" }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#111111",
                        border: "1px solid #1f1f1f",
                        borderRadius: "6px",
                        fontSize: "11px",
                        color: "#ffffff",
                      }}
                      formatter={(value: number) => [value, "Keys"]}
                    />
                    <Bar 
                      dataKey="count" 
                      radius={[2, 2, 0, 0]}
                    >
                      {histogramData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expiring Soon */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Expiring Soon (&lt;60s)</CardTitle>
              <Badge variant="outline" className="text-xs">
                {state.expiringKeys.length} keys
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {state.expiringKeys.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                No keys expiring soon
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Key</TableHead>
                      <TableHead className="text-xs w-16">Type</TableHead>
                      <TableHead className="text-xs w-20">TTL</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.expiringKeys.map((key, index) => (
                      <TableRow key={`${key.key}-${index}`}>
                        <TableCell className="font-mono text-xs text-[#22d3ee] truncate max-w-32">
                          {key.key}
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-xs">
                            {key.type}
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-mono text-xs ${getTTLColor(key.ttl)}`}>
                          {formatTTL(key.ttl)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Operations */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Bulk TTL Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <AlertDialog 
              open={bulkDialog.open && bulkDialog.type === 'apply'} 
              onOpenChange={(open) => setBulkDialog(prev => ({ ...prev, open, type: open ? 'apply' : null }))}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-2" />
                  Apply TTL to Pattern
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Apply TTL to Pattern</AlertDialogTitle>
                  <AlertDialogDescription>
                    Apply a TTL (expiration time) to all keys matching the specified pattern.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <label className="text-sm font-medium">Key Pattern:</label>
                    <Input
                      value={bulkDialog.pattern}
                      onChange={(e) => setBulkDialog(prev => ({ ...prev, pattern: e.target.value }))}
                      placeholder="e.g., session:*, user:*, *"
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">TTL (seconds):</label>
                    <Input
                      type="number"
                      value={bulkDialog.ttlSeconds}
                      onChange={(e) => setBulkDialog(prev => ({ ...prev, ttlSeconds: e.target.value }))}
                      placeholder="3600"
                      className="mt-1"
                    />
                  </div>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkOperation}>
                    Apply TTL
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog 
              open={bulkDialog.open && bulkDialog.type === 'remove'} 
              onOpenChange={(open) => setBulkDialog(prev => ({ ...prev, open, type: open ? 'remove' : null }))}
            >
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Minus className="w-4 h-4 mr-2" />
                  Remove TTL from Pattern
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove TTL from Pattern</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove TTL (make keys persistent) for all keys matching the specified pattern.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <label className="text-sm font-medium">Key Pattern:</label>
                  <Input
                    value={bulkDialog.pattern}
                    onChange={(e) => setBulkDialog(prev => ({ ...prev, pattern: e.target.value }))}
                    placeholder="e.g., session:*, user:*, *"
                    className="mt-1 font-mono text-xs"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleBulkOperation}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Remove TTL
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}