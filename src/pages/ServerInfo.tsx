import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Server, Search, Copy, RefreshCw } from "lucide-react";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";

export default function ServerInfo() {
  const { activeConnectionId } = useApp();
  const [info, setInfo] = useState<Record<string, Record<string, string>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const fetchInfo = async () => {
    if (!activeConnectionId) return;
    setLoading(true);
    try {
      const data = await redisApi.info(activeConnectionId);
      setInfo(data);
      setExpandedSections(new Set(Object.keys(data)));
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInfo(); }, [activeConnectionId]);

  const toggleSection = (section: string) => {
    const next = new Set(expandedSections);
    next.has(section) ? next.delete(section) : next.add(section);
    setExpandedSections(next);
  };

  const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5" />
          <h1 className="text-xl font-bold">Server Info</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-7 text-xs pl-7 w-48" />
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={fetchInfo}>
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => {
            navigator.clipboard.writeText(JSON.stringify(info, null, 2));
            toast.success('Copied to clipboard');
          }}>
            <Copy className="w-3 h-3" /> Copy All
          </Button>
        </div>
      </div>

      {info && Object.entries(info).map(([section, fields]) => {
        if (!fields || typeof fields !== 'object') return null;
        const filteredFields = Object.entries(fields).filter(([k, v]) =>
          !searchTerm || k.toLowerCase().includes(searchTerm.toLowerCase()) || String(v).toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (searchTerm && filteredFields.length === 0) return null;

        return (
          <Card key={section}>
            <CardHeader className="p-3 pb-2 cursor-pointer" onClick={() => toggleSection(section)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm capitalize"># {section}</CardTitle>
                <Badge variant="secondary" className="text-[10px]">{filteredFields.length} fields</Badge>
              </div>
            </CardHeader>
            {expandedSections.has(section) && (
              <>
                <Separator />
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <tbody>
                      {filteredFields.map(([key, value]) => (
                        <tr key={key} className="border-b border-border/50 hover:bg-accent/50">
                          <td className="p-2.5 pl-4 font-mono text-muted-foreground w-1/3">{key}</td>
                          <td className="p-2.5 font-mono">{escapeHtml(String(value))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
