import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { formatUptime } from "@/store/mockData";
import {
  Activity, Cpu, Database, HardDrive, Users, Zap, Clock, BarChart3, AlertCircle
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import { toast } from "sonner";

const pieColors = ["hsl(4,74%,49%)", "hsl(217,91%,60%)", "hsl(142,71%,45%)", "hsl(25,95%,53%)", "hsl(271,81%,56%)"];
const tooltipStyle = {
  backgroundColor: "hsl(220,25%,11%)",
  border: "1px solid hsl(220,20%,18%)",
  borderRadius: "6px",
  fontSize: "11px",
  color: "hsl(0,0%,90%)"
};

export default function Dashboard() {
  const { activeConnectionId, connections } = useApp();
  const [info, setInfo] = useState<Record<string, Record<string, string>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ time: string; ops: number; memory: number; hitRate: number }[]>([]);

  const activeConnection = connections.find(c => c.id === activeConnectionId);

  const fetchInfo = useCallback(async () => {
    if (!activeConnectionId) return;
    try {
      const data = await redisApi.info(activeConnectionId);
      setInfo(data);
      setError(null);
      // Append to history
      const now = new Date();
      const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const ops = parseInt(data.stats?.instantaneous_ops_per_sec || '0');
      const memBytes = parseInt(data.memory?.used_memory || '0');
      const memory = memBytes / 1048576;
      const hits = parseInt(data.stats?.keyspace_hits || '0');
      const misses = parseInt(data.stats?.keyspace_misses || '0');
      const hitRate = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;
      setHistory(h => [...h.slice(-30), { time, ops, memory: parseFloat(memory.toFixed(2)), hitRate: parseFloat(hitRate.toFixed(2)) }]);
    } catch (e: unknown) {
      setError((e as Error).message);
      if (!info) toast.error('Failed to fetch server info');
    } finally {
      setLoading(false);
    }
  }, [activeConnectionId]);

  useEffect(() => {
    setLoading(true);
    setHistory([]);
    fetchInfo();
    const interval = setInterval(fetchInfo, 5000);
    return () => clearInterval(interval);
  }, [fetchInfo]);

  if (loading && !info) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      </Card>
    );
  }

  const s = info || {};
  const mem = s.memory || {};
  const stats = s.stats || {};
  const server = s.server || {};
  const clients = s.clients || {};
  const replication = s.replication || {};

  const hits = parseInt(stats.keyspace_hits || '0');
  const misses = parseInt(stats.keyspace_misses || '0');
  const hitRate = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : '0';
  const uptime = parseInt(server.uptime_in_seconds || '0');

  // Count total keys from keyspace
  let totalKeys = 0;
  const dbPieData: { name: string; value: number }[] = [];
  const keyspace = s.keyspace || {};
  for (const [dbKey, val] of Object.entries(keyspace)) {
    const match = val.match(/keys=(\d+)/);
    if (match) {
      const count = parseInt(match[1]);
      totalKeys += count;
      dbPieData.push({ name: dbKey.toUpperCase(), value: count });
    }
  }

  const statCards = [
    { label: "Ops/sec", value: stats.instantaneous_ops_per_sec || '0', icon: Zap },
    { label: "Memory", value: mem.used_memory_human || '0', icon: HardDrive },
    { label: "Clients", value: clients.connected_clients || '0', icon: Users },
    { label: "Hit Rate", value: `${hitRate}%`, icon: Activity },
    { label: "Total Keys", value: totalKeys.toLocaleString(), icon: Database },
    { label: "Uptime", value: formatUptime(uptime), icon: Clock },
    { label: "CPU (sys)", value: `${parseFloat(stats.used_cpu_sys || server.used_cpu_sys || '0').toFixed(1)}s`, icon: Cpu },
    { label: "Fragmentation", value: parseFloat(mem.mem_fragmentation_ratio || '0').toFixed(2), icon: BarChart3 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">
            {activeConnection?.name} — Redis {server.redis_version || '?'} — {replication.role || '?'}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">Auto-refresh: 5s</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {statCards.map((sc) => (
          <Card key={sc.label}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{sc.label}</span>
                <sc.icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="text-lg font-bold font-mono">{sc.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm">Operations per Second</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" strokeOpacity={0.2} />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="ops" stroke="hsl(4,74%,49%)" fill="hsl(4,74%,49%)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm">Keys by Database</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {dbPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={dbPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                      {dbPieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 mt-2">
                  {dbPieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1 text-[10px]">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[i % pieColors.length] }} />
                      {d.name}: {d.value}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">No keys</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Memory Usage (MB)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" strokeOpacity={0.2} />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="memory" stroke="hsl(217,91%,60%)" fill="hsl(217,91%,60%)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2 pt-3 px-4"><CardTitle className="text-sm">Cache Hit Rate (%)</CardTitle></CardHeader>
          <CardContent className="px-4 pb-3">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,88%)" strokeOpacity={0.2} />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(220,10%,46%)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="hitRate" stroke="hsl(142,71%,45%)" fill="hsl(142,71%,45%)" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
            <div><span className="text-muted-foreground">Version:</span> <span className="font-mono">{server.redis_version || '?'}</span></div>
            <div><span className="text-muted-foreground">OS:</span> <span className="font-mono text-[10px]">{(server.os || '?').split(" ")[0]}</span></div>
            <div><span className="text-muted-foreground">Port:</span> <span className="font-mono">{server.tcp_port || '?'}</span></div>
            <div><span className="text-muted-foreground">Mode:</span> <span className="font-mono">{server.redis_mode || '?'}</span></div>
            <div><span className="text-muted-foreground">Commands:</span> <span className="font-mono">{(parseInt(stats.total_commands_processed || '0') / 1e6).toFixed(1)}M</span></div>
            <div><span className="text-muted-foreground">Blocked:</span> <span className="font-mono">{clients.blocked_clients || '0'}</span></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
