import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Shield, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";

interface AclUser {
  username: string;
  enabled: boolean;
  rules: string;
}

export default function ACLManager() {
  const { activeConnectionId } = useApp();
  const [users, setUsers] = useState<AclUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AclUser | null>(null);
  const [whoami, setWhoami] = useState("");
  const [aclLog, setAclLog] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAcl = async () => {
    if (!activeConnectionId) return;
    setLoading(true);
    try {
      // Get ACL list - returns array of strings directly
      const aclList = await redisApi.getAcl(activeConnectionId);
      const list = Array.isArray(aclList) ? aclList : [];
      
      // Parse ACL LIST output: "user <username> <flags> <rules...>"
      const parsed = list.map((line: string) => {
        const parts = String(line).split(' ');
        return {
          username: parts[1] || 'unknown',
          enabled: parts.includes('on'),
          rules: parts.slice(2).join(' '),
        };
      });
      setUsers(parsed);
      
      // Try to get current user via CLI (optional, may fail)
      try {
        const whoamiResult = await redisApi.cli(activeConnectionId, 'ACL WHOAMI');
        setWhoami(String(whoamiResult || ''));
      } catch {
        setWhoami('');
      }
      
      // Try to get ACL log (optional, may fail)
      try {
        const logResult = await redisApi.cli(activeConnectionId, 'ACL LOG 10');
        setAclLog(Array.isArray(logResult) ? logResult : []);
      } catch {
        setAclLog([]);
      }
      
      if (parsed.length > 0 && !selectedUser) setSelectedUser(parsed[0]);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAcl(); }, [activeConnectionId]);

  const handleDeleteUser = async (username: string) => {
    if (!activeConnectionId || username === 'default') return;
    try {
      await redisApi.deleteAclUser(activeConnectionId, username);
      toast.success(`Deleted user ${username}`);
      setSelectedUser(null);
      fetchAcl();
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  if (loading) {
    return <div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5" />
          <h1 className="text-xl font-bold">ACL Manager</h1>
          {whoami && <Badge variant="outline" className="text-[10px]">Logged in as: {whoami}</Badge>}
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={fetchAcl}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-1">
          <CardHeader className="p-3 pb-2"><CardTitle className="text-sm">ACL Users</CardTitle></CardHeader>
          <Separator />
          <div className="p-2 space-y-0.5">
            {users.map(user => (
              <button
                key={user.username}
                onClick={() => setSelectedUser(user)}
                className={cn("flex items-center justify-between w-full px-2.5 py-2 rounded text-xs hover:bg-accent", selectedUser?.username === user.username && "bg-accent")}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("w-1.5 h-1.5 rounded-full", user.enabled ? "bg-status-success" : "bg-muted-foreground")} />
                  <span className="font-mono font-medium">{user.username}</span>
                </div>
                <Badge variant={user.enabled ? "secondary" : "outline"} className="text-[9px]">
                  {user.enabled ? "active" : "disabled"}
                </Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          {selectedUser ? (
            <>
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-mono">{selectedUser.username}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Switch checked={selectedUser.enabled} disabled />
                    {selectedUser.username !== 'default' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={() => handleDeleteUser(selectedUser.username)}>
                        <Trash2 className="w-3 h-3" /> Delete
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="p-3">
                <label className="text-xs text-muted-foreground mb-1 block">ACL Rules</label>
                <div className="bg-muted rounded p-3">
                  <code className="text-xs font-mono whitespace-pre-wrap break-all">{selectedUser.rules}</code>
                </div>
              </CardContent>
            </>
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Select a user</div>
          )}
        </Card>
      </div>

      {aclLog.length > 0 && (
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-status-warning" />
              ACL Violations Log
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">
              {JSON.stringify(aclLog, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
