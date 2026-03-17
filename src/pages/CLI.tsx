import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/appContext";
import { redisApi } from "@/lib/redis-api";

interface CLIEntry {
  id: number;
  command: string;
  result: unknown;
  isError: boolean;
  timestamp: string;
}

const commandSuggestions = [
  "GET", "SET", "DEL", "EXISTS", "EXPIRE", "TTL", "PERSIST", "TYPE", "RENAME", "SCAN", "DBSIZE", "SELECT",
  "LPUSH", "RPUSH", "LPOP", "RPOP", "LRANGE", "LLEN", "LINDEX", "LSET",
  "HSET", "HGET", "HGETALL", "HDEL", "HKEYS", "HVALS", "HLEN", "HINCRBY", "HSCAN",
  "SADD", "SREM", "SMEMBERS", "SCARD", "SUNION", "SINTER", "SDIFF", "SSCAN",
  "ZADD", "ZREM", "ZRANGE", "ZSCORE", "ZRANK", "ZCARD", "ZINCRBY", "ZPOPMIN", "ZPOPMAX", "ZSCAN",
  "XADD", "XRANGE", "XLEN", "XREAD", "XGROUP", "XACK", "XINFO",
  "INCR", "DECR", "INCRBY", "APPEND", "STRLEN",
  "PUBLISH", "PUBSUB", "INFO", "PING", "CONFIG",
  "SLOWLOG", "MEMORY", "ACL", "CLIENT", "BGSAVE",
];

function formatResult(result: unknown): string {
  if (result === null || result === undefined) return "(nil)";
  if (typeof result === 'string') return result;
  if (typeof result === 'number') return `(integer) ${result}`;
  if (Array.isArray(result)) {
    if (result.length === 0) return "(empty array)";
    return result.map((item, i) => `${i + 1}) ${formatResult(item)}`).join('\n');
  }
  return JSON.stringify(result, null, 2);
}

export default function CLI() {
  const { activeConnectionId, activeDb } = useApp();
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<CLIEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim() || !activeConnectionId) return;
    setExecuting(true);
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
    try {
      const result = await redisApi.cli(activeConnectionId, cmd.trim(), activeDb);
      setHistory(h => [...h, { id: h.length, command: cmd.trim(), result, isError: false, timestamp }]);
    } catch (err: unknown) {
      setHistory(h => [...h, { id: h.length, command: cmd.trim(), result: (err as Error).message, isError: true, timestamp }]);
    } finally {
      setInput("");
      setHistoryIndex(-1);
      setSuggestions([]);
      setExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") executeCommand(input);
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const cmds = history.map(h => h.command);
      const ni = historyIndex < cmds.length - 1 ? historyIndex + 1 : historyIndex;
      setHistoryIndex(ni);
      setInput(cmds[cmds.length - 1 - ni] || "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const cmds = history.map(h => h.command);
      const ni = historyIndex > 0 ? historyIndex - 1 : -1;
      setHistoryIndex(ni);
      setInput(ni >= 0 ? cmds[cmds.length - 1 - ni] : "");
    } else if (e.key === "Tab" && suggestions.length > 0) {
      e.preventDefault();
      setInput(suggestions[0] + " ");
      setSuggestions([]);
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    const word = val.trim().toUpperCase();
    setSuggestions(word.length > 0 ? commandSuggestions.filter(c => c.startsWith(word)).slice(0, 5) : []);
  };

  return (
    <div className="h-[calc(100vh-7.5rem)] flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          <h1 className="text-xl font-bold">CLI Terminal</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono">DB {activeDb}</Badge>
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setHistory([])}>
            <Trash2 className="w-3 h-3" /> Clear
          </Button>
        </div>
      </div>

      <Card className="flex-1 flex flex-col bg-[hsl(220,25%,8%)] border-[hsl(220,20%,18%)]">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-3 font-mono text-xs">
            {history.map((entry) => (
              <div key={entry.id}>
                <div className="flex items-start gap-2">
                  <span className="text-primary shrink-0">redis&gt;</span>
                  <span className="text-[hsl(0,0%,90%)]">{entry.command}</span>
                  <span className="ml-auto text-[10px] text-[hsl(220,10%,35%)]">{entry.timestamp}</span>
                </div>
                <pre className={cn("mt-0.5 pl-14 whitespace-pre-wrap", entry.isError ? "text-status-error" : "text-status-success")}>
                  {formatResult(entry.result)}
                </pre>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        <div className="border-t border-[hsl(220,20%,18%)] p-3">
          {suggestions.length > 0 && (
            <div className="flex gap-1 mb-2">
              {suggestions.map(s => (
                <Badge key={s} variant="secondary" className="text-[10px] cursor-pointer bg-[hsl(220,20%,16%)] text-[hsl(0,0%,80%)] hover:bg-[hsl(220,20%,20%)]"
                  onClick={() => { setInput(s + " "); setSuggestions([]); inputRef.current?.focus(); }}>
                  {s}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-primary font-mono text-sm">redis&gt;</span>
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter Redis command..."
              className="flex-1 h-8 bg-transparent border-none text-[hsl(0,0%,90%)] font-mono text-xs focus-visible:ring-0 placeholder:text-[hsl(220,10%,30%)]"
              autoFocus
              disabled={executing}
            />
            <Button size="sm" className="h-8" onClick={() => executeCommand(input)} disabled={executing}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
