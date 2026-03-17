import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ArrowUpDown, Trash2, Filter, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";

interface SlowEntry {
  id: number;
  timestamp: number;
  durationUs: number;
  command: string;
}

export default function SlowLog() {
  const { activeConnectionId } = useApp();
  const [entries, setEntries] = useState<SlowEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [durationFilter, setDurationFilter] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  const fetchSlowLog = async () => {
    if (!activeConnectionId) return;
    setLoading(true);
    try {
      const raw = await redisApi.getSlowLog(activeConnectionId, 100);
      if (Array.isArray(raw)) {
        setEntries(raw.map((entry: unknown[]) => ({
          id: Number(entry[0]),
          timestamp: Number(entry[1]),
          durationUs: Number(entry[2]),
          command: Array.isArray(entry[3]) ? entry[3].join(' ') : String(entry[3] || ''),
        })));
      }
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSlowLog(); }, [activeConnectionId]);

  const handleReset = async () => {
    if (!activeConnectionId) return;
    try {
      await redisApi.resetSlowLog(activeConnectionId);
      setEntries([]);
      toast.success('Slow log reset');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const sorted = [...entries]
    .filter(e => !durationFilter || e.durationUs >= Number(durationFilter))
    .sort((a, b) => sortAsc ? a.durationUs - b.durationUs : b.durationUs - a.durationUs);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          <h1 className="text-xl font-bold">Slow Log</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Min μs..." value={durationFilter} onChange={(e) => setDurationFilter(e.target.value)} className="h-7 text-xs pl-7 w-28" />
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={fetchSlowLog}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleReset}>
            <Trash2 className="w-3 h-3" /> Reset
          </Button>
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No slow log entries</p>
            <p className="text-sm">Commands are logged when they exceed the configured threshold</p>
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium text-muted-foreground">ID</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Timestamp</th>
                  <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer" onClick={() => setSortAsc(!sortAsc)}>
                    <div className="flex items-center gap-1">Duration (μs) <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Command</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/50 hover:bg-accent/50">
                    <td className="p-3 font-mono text-muted-foreground">{entry.id}</td>
                    <td className="p-3 font-mono text-muted-foreground">{new Date(entry.timestamp * 1000).toLocaleString()}</td>
                    <td className="p-3 font-mono">
                      <span className={cn(
                        entry.durationUs > 100000 ? "text-status-error" : entry.durationUs > 10000 ? "text-status-warning" : "text-foreground"
                      )}>{entry.durationUs.toLocaleString()}</span>
                    </td>
                    <td className="p-3 font-mono truncate max-w-md">{entry.command}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
