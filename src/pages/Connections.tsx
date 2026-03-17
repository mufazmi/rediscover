import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Database, Plus, Trash2, CheckCircle2, XCircle, Wifi, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

export default function Connections() {
  const { connections, refreshConnections } = useApp();
  const [testing, setTesting] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newColor, setNewColor] = useState("slate");
  const [creating, setCreating] = useState(false);

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const result = await redisApi.testConnection(id);
      if (result.status === 'connected') {
        toast.success(`Connected in ${result.latencyMs}ms`);
      } else {
        toast.error(`Connection failed: ${result.error || 'unknown error'}`);
      }
      await refreshConnections();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setTesting(null);
    }
  };

  const handleCreate = async () => {
    if (!newName || !newUrl) { toast.error('Name and URL are required'); return; }
    setCreating(true);
    try {
      await redisApi.addConnection(newName, newUrl, newColor);
      toast.success('Connection added');
      await refreshConnections();
      setDialogOpen(false);
      setNewName(""); setNewUrl(""); setNewColor("slate");
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await redisApi.deleteConnection(id);
      toast.success('Connection deleted');
      await refreshConnections();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          <h1 className="text-xl font-bold">Connections</h1>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-8 text-xs gap-1"><Plus className="w-3 h-3" /> Add Connection</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Redis Connection</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Production Redis" className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Redis URL</label>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="redis://user:password@host:port" className="h-8 text-xs font-mono" type="password" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Color</label>
                <div className="flex gap-2">
                  {['red', 'blue', 'green', 'yellow', 'purple', 'slate'].map(c => (
                    <button key={c} onClick={() => setNewColor(c)} className={cn("w-6 h-6 rounded-full border-2", newColor === c ? "border-primary" : "border-transparent")}
                      style={{ backgroundColor: c === 'slate' ? '#64748b' : c }} />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button size="sm" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Add Connection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {connections.map(conn => (
          <Card key={conn.id} className={cn("relative overflow-hidden", conn.status === "online" && "border-status-success/30")}>
            <div className={cn(
              "absolute top-0 left-0 w-full h-0.5",
              conn.status === "online" ? "bg-status-success" : conn.status === "offline" ? "bg-status-error" : conn.status === "slow" ? "bg-status-warning" : "bg-muted"
            )} />
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{conn.name}</CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(conn.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-2">
              <div className="flex items-center gap-2">
                <Badge
                  variant={conn.status === "online" ? "default" : "secondary"}
                  className={cn("text-[10px] gap-1", conn.status === "online" && "bg-status-success")}
                >
                  {conn.status === "online" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {conn.status || 'unknown'}
                </Badge>
                {conn.latency_ms != null && (
                  <Badge variant="outline" className="text-[10px] font-mono">{conn.latency_ms}ms</Badge>
                )}
              </div>
              <Button variant="outline" size="sm" className="h-6 text-[10px] w-full gap-1" onClick={() => handleTest(conn.id)} disabled={testing === conn.id}>
                {testing === conn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
                Test Connection
              </Button>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed flex items-center justify-center min-h-[160px] cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => setDialogOpen(true)}>
          <div className="text-center">
            <Plus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Add Connection</p>
            <p className="text-[10px] text-muted-foreground">Redis, Cluster, or Sentinel</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
