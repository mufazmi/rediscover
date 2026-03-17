import { useState, useMemo, useEffect, useCallback } from "react";
import { keyTypeColors, getTTLLabel, getTTLColor, formatBytes, type KeyType } from "@/store/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Trash2, RefreshCw, FolderTree, List, Filter, ChevronRight, ChevronDown, Copy, Clock, Loader2, Edit, Timer, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";
import { toast } from "sonner";
import StringOperations from "@/components/key-browser/StringOperations";
import ListOperations from "@/components/key-browser/ListOperations";
import HashOperations from "@/components/key-browser/HashOperations";
import SetOperations from "@/components/key-browser/SetOperations";
import ZSetOperations from "@/components/key-browser/ZSetOperations";
import StreamOperations from "@/components/key-browser/StreamOperations";
import TTLPanel from "@/components/key-browser/TTLPanel";
import DeleteKeyPanel from "@/components/key-browser/DeleteKeyPanel";

interface KeyData {
  key: string;
  type: string;
  ttl: number;
}

interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  keys: KeyData[];
}

function buildTree(keys: KeyData[], separator: string): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: new Map(), keys: [] };
  for (const keyData of keys) {
    const parts = keyData.key.split(separator);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node.children.has(part)) {
        node.children.set(part, { name: part, fullPath: parts.slice(0, i + 1).join(separator), children: new Map(), keys: [] });
      }
      node = node.children.get(part)!;
    }
    node.keys.push(keyData);
  }
  return root;
}

function TreeView({ node, level, selectedKey, onSelect }: { node: TreeNode; level: number; selectedKey: string | null; onSelect: (k: KeyData) => void }) {
  const [expanded, setExpanded] = useState(level < 2);
  const countKeys = (n: TreeNode): number => n.keys.length + Array.from(n.children.values()).reduce((s, c) => s + countKeys(c), 0);
  const total = countKeys(node);

  return (
    <div>
      {node.name && (
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 py-0.5 px-1 w-full hover:bg-accent rounded text-xs" style={{ paddingLeft: `${level * 12}px` }}>
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <FolderTree className="w-3 h-3 text-muted-foreground" />
          <span className="font-medium">{node.name}</span>
          <Badge variant="secondary" className="text-[9px] h-3.5 ml-auto">{total}</Badge>
        </button>
      )}
      {(expanded || !node.name) && (
        <>
          {Array.from(node.children.values()).map((child) => (
            <TreeView key={child.fullPath} node={child} level={level + 1} selectedKey={selectedKey} onSelect={onSelect} />
          ))}
          {node.keys.map((kd) => (
            <button
              key={kd.key}
              onClick={() => onSelect(kd)}
              className={cn("flex items-center gap-1.5 py-1 px-2 w-full text-xs rounded hover:bg-accent", selectedKey === kd.key && "bg-accent")}
              style={{ paddingLeft: `${(level + 1) * 12 + 4}px` }}
            >
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", keyTypeColors[kd.type as KeyType] || "bg-muted-foreground")} />
              <span className="font-mono truncate">{kd.key.split(":").pop()}</span>
              <span className={cn("ml-auto text-[10px] shrink-0", getTTLColor(kd.ttl))}>{getTTLLabel(kd.ttl)}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

export default function KeyBrowser() {
  const { activeConnectionId, activeDb } = useApp();
  const [keys, setKeys] = useState<KeyData[]>([]);
  const [cursor, setCursor] = useState('0');
  const [hasMore, setHasMore] = useState(false);
  const [searchPattern, setSearchPattern] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"tree" | "flat">("tree");
  const [selectedKey, setSelectedKey] = useState<KeyData | null>(null);
  const [keyValue, setKeyValue] = useState<{ type: string; value: unknown; length: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [valueLoading, setValueLoading] = useState(false);
  
  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  
  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  
  // TTL dialog state
  const [ttlDialogOpen, setTtlDialogOpen] = useState(false);
  const [newTtl, setNewTtl] = useState("");

  const loadKeys = useCallback(async (reset = true) => {
    if (!activeConnectionId) return;
    setLoading(true);
    try {
      const pattern = searchPattern || '*';
      const result = await redisApi.scanKeys(activeConnectionId, {
        pattern,
        cursor: reset ? '0' : cursor,
        db: activeDb,
        count: 200,
      });
      // The API now returns enriched keys with type and TTL
      const newKeys = result.keys as KeyData[];
      setKeys(prev => reset ? newKeys : [...prev, ...newKeys]);
      setCursor(result.cursor);
      setHasMore(result.cursor !== '0');
    } catch (e: unknown) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeConnectionId, activeDb, searchPattern, cursor]);

  useEffect(() => {
    loadKeys(true);
    setSelectedKey(null);
    setKeyValue(null);
  }, [activeConnectionId, activeDb]);

  const loadKeyValue = useCallback(async (kd: KeyData) => {
    if (!activeConnectionId) return;
    setSelectedKey(kd);
    setValueLoading(true);
    try {
      const data = await redisApi.getKeyValue(activeConnectionId, kd.key, activeDb);
      setKeyValue(data);
    } catch (e: unknown) {
      toast.error((e as Error).message);
      setKeyValue(null);
    } finally {
      setValueLoading(false);
    }
  }, [activeConnectionId, activeDb]);

  const handleDeleteKey = () => {
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteKey = async () => {
    if (!activeConnectionId || !selectedKey) return;
    try {
      await redisApi.deleteKey(activeConnectionId, selectedKey.key, activeDb);
      toast.success(`Deleted ${selectedKey.key}`);
      setSelectedKey(null);
      setKeyValue(null);
      setDeleteConfirmOpen(false);
      loadKeys(true);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const handleRenameKey = async () => {
    if (!activeConnectionId || !selectedKey || !newKeyName.trim()) return;
    try {
      await redisApi.renameKey(activeConnectionId, selectedKey.key, newKeyName.trim(), activeDb);
      toast.success(`Renamed ${selectedKey.key} to ${newKeyName.trim()}`);
      setRenameDialogOpen(false);
      setNewKeyName("");
      setSelectedKey(null);
      setKeyValue(null);
      loadKeys(true);
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const handleSetTTL = async () => {
    if (!activeConnectionId || !selectedKey) return;
    const ttlValue = parseInt(newTtl, 10);
    if (isNaN(ttlValue)) {
      toast.error("Please enter a valid number");
      return;
    }
    try {
      await redisApi.setTtl(activeConnectionId, selectedKey.key, ttlValue, activeDb);
      toast.success(`Set TTL to ${ttlValue} seconds for ${selectedKey.key}`);
      setTtlDialogOpen(false);
      setNewTtl("");
      // Reload the key to get updated TTL
      const updatedKeys = keys.map(k => 
        k.key === selectedKey.key ? { ...k, ttl: ttlValue } : k
      );
      setKeys(updatedKeys);
      setSelectedKey({ ...selectedKey, ttl: ttlValue });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const handlePersistKey = async () => {
    if (!activeConnectionId || !selectedKey) return;
    try {
      await redisApi.persistKey(activeConnectionId, selectedKey.key, activeDb);
      toast.success(`Removed TTL from ${selectedKey.key}`);
      // Update the key to show no TTL
      const updatedKeys = keys.map(k => 
        k.key === selectedKey.key ? { ...k, ttl: -1 } : k
      );
      setKeys(updatedKeys);
      setSelectedKey({ ...selectedKey, ttl: -1 });
    } catch (e: unknown) {
      toast.error((e as Error).message);
    }
  };

  const filteredKeys = useMemo(() => {
    if (typeFilter === "all") return keys;
    return keys.filter(k => k.type === typeFilter);
  }, [keys, typeFilter]);

  const tree = useMemo(() => buildTree(filteredKeys, ":"), [filteredKeys]);

  const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return (
    <div className="flex gap-3 h-[calc(100vh-7.5rem)]">
      <Card className="w-80 shrink-0 flex flex-col">
        <CardHeader className="p-3 pb-2 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pattern (e.g. user:*)"
                value={searchPattern}
                onChange={(e) => setSearchPattern(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadKeys(true)}
                className="h-8 text-xs pl-7"
              />
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => loadKeys(true)} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-7 text-[10px] flex-1"><Filter className="w-3 h-3 mr-1" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="list">List</SelectItem>
                <SelectItem value="hash">Hash</SelectItem>
                <SelectItem value="set">Set</SelectItem>
                <SelectItem value="zset">Sorted Set</SelectItem>
                <SelectItem value="stream">Stream</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button variant={viewMode === "tree" ? "secondary" : "ghost"} size="icon" className="h-7 w-7 rounded-r-none" onClick={() => setViewMode("tree")}><FolderTree className="w-3 h-3" /></Button>
              <Button variant={viewMode === "flat" ? "secondary" : "ghost"} size="icon" className="h-7 w-7 rounded-l-none" onClick={() => setViewMode("flat")}><List className="w-3 h-3" /></Button>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{filteredKeys.length} keys{hasMore ? ' (more available)' : ''}</span>
          </div>
        </CardHeader>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="p-1">
            {loading && keys.length === 0 ? (
              Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-6 mb-1" />)
            ) : keys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No keys found</p>
                <p className="text-sm">Try adjusting your search pattern or type filter</p>
              </div>
            ) : viewMode === "tree" ? (
              <TreeView node={tree} level={0} selectedKey={selectedKey?.key || null} onSelect={loadKeyValue} />
            ) : (
              filteredKeys.map((kd) => (
                <button
                  key={kd.key}
                  onClick={() => loadKeyValue(kd)}
                  className={cn("flex items-center gap-2 py-1.5 px-2 w-full text-xs rounded hover:bg-accent", selectedKey?.key === kd.key && "bg-accent")}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", keyTypeColors[kd.type as KeyType] || "bg-muted-foreground")} />
                  <span className="font-mono truncate">{kd.key}</span>
                  <span className={cn("ml-auto text-[10px] shrink-0", getTTLColor(kd.ttl))}>{getTTLLabel(kd.ttl)}</span>
                </button>
              ))
            )}
            {hasMore && !loading && (
              <Button variant="ghost" size="sm" className="w-full text-xs mt-1" onClick={() => loadKeys(false)}>Load more...</Button>
            )}
          </div>
        </ScrollArea>
      </Card>

      <Card className="flex-1 flex flex-col">
        {selectedKey ? (
          keyValue?.type === "list" && Array.isArray(keyValue.value) ? (
            // For LIST keys, show the complete ListOperations component
            <div className="p-3">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </div>
              {valueLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <>
                  <ListOperations
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentValue={keyValue.value as string[]}
                    onValueChange={(newValue) => {
                      setKeyValue(prev => prev ? { ...prev, value: newValue, length: newValue.length } : null);
                      // Update the selected key's length in the keys list
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k } 
                            : k
                        )
                      );
                    }}
                  />
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </>
              )}
            </div>
          ) : keyValue?.type === "hash" && typeof keyValue.value === "object" && keyValue.value !== null ? (
            // For HASH keys, show the complete HashOperations component
            <div className="p-3">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </div>
              {valueLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <>
                  <HashOperations
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentValue={keyValue.value as Record<string, string>}
                    onValueChange={(newValue) => {
                      setKeyValue(prev => prev ? { ...prev, value: newValue, length: Object.keys(newValue).length } : null);
                      // Update the selected key's length in the keys list
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k } 
                            : k
                        )
                      );
                    }}
                  />
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </>
              )}
            </div>
          ) : keyValue?.type === "set" && Array.isArray(keyValue.value) ? (
            // For SET keys, show the complete SetOperations component
            <div className="p-3">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </div>
              {valueLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <>
                  <SetOperations
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentValue={keyValue.value as string[]}
                    onValueChange={(newValue) => {
                      setKeyValue(prev => prev ? { ...prev, value: newValue, length: newValue.length } : null);
                      // Update the selected key's length in the keys list
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k } 
                            : k
                        )
                      );
                    }}
                  />
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </>
              )}
            </div>
          ) : keyValue?.type === "zset" && Array.isArray(keyValue.value) ? (
            // For ZSET keys, show the complete ZSetOperations component
            <div className="p-3">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </div>
              {valueLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <>
                  <ZSetOperations
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentValue={keyValue.value as Array<{ member: string; score: number }>}
                    onValueChange={(newValue) => {
                      setKeyValue(prev => prev ? { ...prev, value: newValue, length: newValue.length } : null);
                      // Update the selected key's length in the keys list
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k } 
                            : k
                        )
                      );
                    }}
                  />
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </>
              )}
            </div>
          ) : keyValue?.type === "string" && typeof keyValue.value === "string" ? (
            // For STRING keys, show the complete StringOperations component
            <div className="p-3">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </div>
              {valueLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <>
                  <StringOperations
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentValue={keyValue.value as string}
                    onValueChange={(newValue) => {
                      setKeyValue(prev => prev ? { ...prev, value: newValue, length: newValue.length } : null);
                      // Update the selected key's length in the keys list
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k } 
                            : k
                        )
                      );
                    }}
                  />
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </>
              )}
            </div>
          ) : keyValue?.type === "stream" && Array.isArray(keyValue.value) ? (
            // For STREAM keys, show the complete StreamOperations component
            <div className="p-3">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </div>
              {valueLoading ? (
                <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
              ) : (
                <>
                  <StreamOperations
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentValue={keyValue.value as Array<{ id: string; fields: Record<string, string> }>}
                    onValueChange={(newValue) => {
                      setKeyValue(prev => prev ? { ...prev, value: newValue, length: newValue.length } : null);
                      // Update the selected key's length in the keys list
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k } 
                            : k
                        )
                      );
                    }}
                  />
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </>
              )}
            </div>
          ) : (
            // For all other key types, show the default structure
            <>
              <CardHeader className="p-3 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", keyTypeColors[selectedKey.type as KeyType] || "")} variant="secondary">{selectedKey.type.toUpperCase()}</Badge>
                    <span className="font-mono text-sm font-medium">{escapeHtml(selectedKey.key)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { navigator.clipboard.writeText(selectedKey.key); toast.success('Copied'); }}>
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewKeyName(selectedKey.key); setRenameDialogOpen(true); }}>
                      <Edit className="w-3 h-3" /> Rename
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => { setNewTtl(selectedKey.ttl > 0 ? String(selectedKey.ttl) : ""); setTtlDialogOpen(true); }}>
                      <Timer className="w-3 h-3" /> TTL
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive" onClick={handleDeleteKey}>
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  </div>
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                  <span>TTL: <span className={getTTLColor(selectedKey.ttl)}>{getTTLLabel(selectedKey.ttl)}</span></span>
                  {keyValue && <span>Length: {keyValue.length}</span>}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="flex-1 p-3 overflow-auto">
                {valueLoading ? (
                  <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
                ) : keyValue?.type === "zset" && Array.isArray(keyValue.value) ? (
                <div className="space-y-1">
                  <div className="grid grid-cols-[auto_auto_1fr_auto] gap-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wider pb-1 border-b">
                    <span>Rank</span><span>Score</span><span>Member</span><span>Actions</span>
                  </div>
                  {(keyValue.value as { member: string; score: number }[]).map((item, i) => (
                    <div key={i} className="grid grid-cols-[auto_auto_1fr_auto] gap-3 items-center text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground w-6">#{i + 1}</span>
                      <span className="font-mono text-status-warning w-16">{item.score}</span>
                      <span className="font-mono">{escapeHtml(item.member)}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={async () => {
                        if (!activeConnectionId) return;
                        await redisApi.zsetRem(activeConnectionId, selectedKey.key, item.member, activeDb);
                        loadKeyValue(selectedKey);
                      }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  ))}
                </div>
                ) : (
                  <div className="rounded-md bg-muted p-3">
                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                      {keyValue?.value != null ? (typeof keyValue.value === 'object' ? JSON.stringify(keyValue.value, null, 2) : escapeHtml(String(keyValue.value))) : '"(empty)"'}
                    </pre>
                  </div>
                )}
                
                {/* TTL Panel for default key types */}
                <div className="mt-4">
                  <TTLPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    currentTTL={selectedKey.ttl}
                    onTTLChange={(newTTL) => {
                      setSelectedKey(prev => prev ? { ...prev, ttl: newTTL } : null);
                      setKeys(prevKeys => 
                        prevKeys.map(k => 
                          k.key === selectedKey.key 
                            ? { ...k, ttl: newTTL } 
                            : k
                        )
                      );
                    }}
                  />
                  <DeleteKeyPanel
                    connectionId={Number(activeConnectionId!)}
                    db={activeDb}
                    keyName={selectedKey.key}
                    keyType={selectedKey.type}
                    onKeyDeleted={() => {
                      setSelectedKey(null);
                      setKeyValue(null);
                      loadKeys(true);
                    }}
                  />
                </div>
              </CardContent>
            </>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a key to view its contents
          </div>
        )}
      </Card>

      {/* Rename Key Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Key</DialogTitle>
            <DialogDescription>
              Enter a new name for the key: {selectedKey?.key}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newKeyName">New Key Name</Label>
              <Input
                id="newKeyName"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Enter new key name"
                onKeyDown={(e) => e.key === 'Enter' && handleRenameKey()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameKey} disabled={!newKeyName.trim()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set TTL Dialog */}
      <Dialog open={ttlDialogOpen} onOpenChange={setTtlDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set TTL</DialogTitle>
            <DialogDescription>
              Set time-to-live (in seconds) for key: {selectedKey?.key}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newTtl">TTL (seconds)</Label>
              <Input
                id="newTtl"
                type="number"
                value={newTtl}
                onChange={(e) => setNewTtl(e.target.value)}
                placeholder="Enter TTL in seconds"
                onKeyDown={(e) => e.key === 'Enter' && handleSetTTL()}
              />
              <p className="text-xs text-muted-foreground">
                Enter -1 to remove TTL (persist key), or use the Persist button below
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTtlDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => { setTtlDialogOpen(false); handlePersistKey(); }}>
              Persist (Remove TTL)
            </Button>
            <Button onClick={handleSetTTL} disabled={!newTtl.trim()}>
              Set TTL
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this key? This action cannot be undone.
              <br />
              <br />
              <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                {selectedKey?.key}
              </span>
              <br />
              <span className="text-xs text-muted-foreground">
                Type: {selectedKey?.type?.toUpperCase()}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteKey}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
