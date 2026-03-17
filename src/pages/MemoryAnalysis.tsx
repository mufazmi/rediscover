import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { HardDrive, AlertTriangle, RefreshCw } from "lucide-react";
import { formatBytes } from "@/store/mockData";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

const tooltipStyle = { backgroundColor: "hsl(220,25%,11%)", border: "1px solid hsl(220,20%,18%)", borderRadius: "6px", fontSize: "11px", color: "hsl(0,0%,90%)" };

export default function MemoryAnalysis() {
  const { activeConnectionId } = useApp();
  const [info, setInfo] = useState<Record<string, Record<string, string>> | null>(null);
  const [topKeys, setTopKeys] = useState<{ key: string; bytes: number; type: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!activeConnectionId) return;
    setLoading(true);
    try {
      const [infoData, topKeysData] = await Promise.all([
        redisApi.info(activeConnectionId),
        redisApi.getTopKeys(activeConnectionId).catch(() => []),
      ]);
      setInfo(infoData);
      setTopKeys(topKeysData || []);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeConnectionId]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }

  const mem = info?.memory || {};
  const usedMB = parseInt(mem.used_memory || '0') / 1048576;
  const peakMB = parseInt(mem.used_memory_peak || '0') / 1048576;
  const maxMem = parseInt(mem.maxmemory || '0');
  const maxMemMB = maxMem > 0 ? maxMem / 1048576 : 0;
  const usagePercent = maxMemMB > 0 ? (usedMB / maxMemMB) * 100 : 0;
  const fragRatio = parseFloat(mem.mem_fragmentation_ratio || '0');

  // Type distribution from top keys
  const typeCounts: Record<string, number> = {};
  for (const k of topKeys) {
    typeCounts[k.type] = (typeCounts[k.type] || 0) + 1;
  }
  const typeColors: Record<string, string> = { string: "hsl(217,91%,60%)", hash: "hsl(142,71%,45%)", list: "hsl(271,81%,56%)", set: "hsl(25,95%,53%)", zset: "hsl(45,93%,47%)", stream: "hsl(330,81%,60%)" };
  const typeDistribution = Object.entries(typeCounts).map(([name, value]) => ({ name, value, color: typeColors[name] || "hsl(200,80%,50%)" }));

  const topKeysChart = topKeys.slice(0, 10).map(k => ({
    name: k.key.length > 25 ? "..." + k.key.slice(-22) : k.key,
    size: k.bytes,
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5" />
          <h1 className="text-xl font-bold">Memory Analysis</h1>
        </div>
        <div className="flex items-center gap-2">
          {fragRatio > 1.5 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertTriangle className="w-3 h-3" /> High Fragmentation
            </Badge>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={fetchData}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Used Memory</p>
            <p className="text-lg font-bold font-mono">{usedMB.toFixed(2)} MB</p>
            {maxMemMB > 0 && (
              <>
                <Progress value={usagePercent} className="mt-2 h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">{usagePercent.toFixed(1)}% of {maxMemMB.toFixed(0)} MB</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Peak Memory</p>
            <p className="text-lg font-bold font-mono">{peakMB.toFixed(2)} MB</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">Fragmentation Ratio</p>
            <p className="text-lg font-bold font-mono">{fragRatio.toFixed(2)}</p>
            <p className={cn("text-[10px]", fragRatio > 1.5 ? "text-status-error" : "text-status-success")}>
              {fragRatio > 1.5 ? "High" : "Normal"} (&lt; 1.5)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground mb-1">RSS Memory</p>
            <p className="text-lg font-bold font-mono">{mem.used_memory_rss_human || '?'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">Keys by Data Type</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            {typeDistribution.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={typeDistribution} cx="50%" cy="50%" outerRadius={80} paddingAngle={2} dataKey="value">
                      {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2">
                  {typeDistribution.map(d => (
                    <div key={d.name} className="flex items-center gap-1 text-[10px]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                      {d.name}: {d.value}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No data available</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">Top Keys by Memory</CardTitle></CardHeader>
          <CardContent className="p-3 pt-0">
            {topKeysChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={topKeysChart} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" strokeOpacity={0.2} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 9 }} stroke="hsl(220,10%,46%)" />
                  <Tooltip formatter={(value: number) => formatBytes(value)} contentStyle={tooltipStyle} />
                  <Bar dataKey="size" fill="hsl(4,74%,49%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No keys found</p>
                  <p className="text-sm">Keys will appear here when they consume significant memory</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

