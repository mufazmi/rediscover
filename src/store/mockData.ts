export type KeyType = "string" | "list" | "hash" | "set" | "zset" | "stream" | "geo" | "hyperloglog" | "bitmap";

export interface RedisKey {
  key: string;
  type: KeyType;
  ttl: number;
  size: number;
  encoding: string;
}

export interface RedisConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  status: "connected" | "disconnected" | "error";
  latency: number;
  version: string;
  db: number;
}

export interface ServerStats {
  usedMemory: string;
  usedMemoryPeak: string;
  memFragmentation: number;
  connectedClients: number;
  blockedClients: number;
  totalCommandsProcessed: number;
  opsPerSec: number;
  keyspaceHits: number;
  keyspaceMisses: number;
  hitRate: number;
  uptimeSeconds: number;
  redisVersion: string;
  os: string;
  tcpPort: number;
  totalKeys: number;
  cpuSys: number;
  cpuUser: number;
  rdbLastSaveTime: number;
  aofEnabled: boolean;
  role: string;
  connectedSlaves: number;
}

export interface SlowLogEntry {
  id: number;
  timestamp: number;
  duration: number;
  command: string;
  args: string[];
}

export interface MonitorEntry {
  timestamp: string;
  client: string;
  db: number;
  command: string;
  args: string;
  type: "read" | "write" | "admin";
}

export interface PubSubMessage {
  id: string;
  channel: string;
  message: string;
  timestamp: number;
}

export interface ACLUser {
  username: string;
  enabled: boolean;
  flags: string[];
  passwords: number;
  commands: string;
  keys: string;
  channels: string;
}

export const mockConnections: RedisConnection[] = [
  { id: "1", name: "Production Redis", host: "redis-prod.example.com", port: 6379, status: "connected", latency: 2, version: "7.2.4", db: 0 },
  { id: "2", name: "Staging Redis", host: "redis-staging.internal", port: 6379, status: "connected", latency: 5, version: "7.0.12", db: 0 },
  { id: "3", name: "Local Development", host: "localhost", port: 6379, status: "disconnected", latency: 0, version: "7.2.4", db: 0 },
];

export const mockKeys: RedisKey[] = [
  { key: "user:1001:profile", type: "hash", ttl: -1, size: 256, encoding: "ziplist" },
  { key: "user:1001:session", type: "string", ttl: 3600, size: 128, encoding: "embstr" },
  { key: "user:1001:followers", type: "set", ttl: -1, size: 1024, encoding: "hashtable" },
  { key: "user:1002:profile", type: "hash", ttl: -1, size: 312, encoding: "ziplist" },
  { key: "user:1002:session", type: "string", ttl: 1800, size: 128, encoding: "embstr" },
  { key: "cache:homepage", type: "string", ttl: 300, size: 45678, encoding: "raw" },
  { key: "cache:api:products", type: "string", ttl: 60, size: 12345, encoding: "raw" },
  { key: "cache:api:categories", type: "string", ttl: 600, size: 2345, encoding: "raw" },
  { key: "queue:emails", type: "list", ttl: -1, size: 4567, encoding: "quicklist" },
  { key: "queue:notifications", type: "list", ttl: -1, size: 2345, encoding: "quicklist" },
  { key: "leaderboard:weekly", type: "zset", ttl: 604800, size: 8901, encoding: "skiplist" },
  { key: "leaderboard:monthly", type: "zset", ttl: 2592000, size: 12345, encoding: "skiplist" },
  { key: "events:stream", type: "stream", ttl: -1, size: 56789, encoding: "stream" },
  { key: "config:features", type: "hash", ttl: -1, size: 456, encoding: "ziplist" },
  { key: "geo:stores", type: "geo", ttl: -1, size: 789, encoding: "ziplist" },
  { key: "stats:visitors", type: "hyperloglog", ttl: 86400, size: 12304, encoding: "raw" },
  { key: "flags:active_users", type: "bitmap", ttl: -1, size: 1024, encoding: "raw" },
  { key: "rate:limit:192.168.1.1", type: "string", ttl: 45, size: 8, encoding: "int" },
  { key: "session:abc123def456", type: "string", ttl: 7200, size: 512, encoding: "raw" },
  { key: "lock:payment:order-789", type: "string", ttl: 30, size: 16, encoding: "embstr" },
];

export const mockServerStats: ServerStats = {
  usedMemory: "48.23 MB",
  usedMemoryPeak: "62.17 MB",
  memFragmentation: 1.12,
  connectedClients: 34,
  blockedClients: 2,
  totalCommandsProcessed: 15482903,
  opsPerSec: 1247,
  keyspaceHits: 12384567,
  keyspaceMisses: 234567,
  hitRate: 98.14,
  uptimeSeconds: 2592000,
  redisVersion: "7.2.4",
  os: "Linux 5.15.0-91-generic x86_64",
  tcpPort: 6379,
  totalKeys: 20,
  cpuSys: 1234.56,
  cpuUser: 2345.67,
  rdbLastSaveTime: Date.now() / 1000 - 3600,
  aofEnabled: true,
  role: "master",
  connectedSlaves: 2,
};

export const mockSlowLog: SlowLogEntry[] = [
  { id: 1, timestamp: Date.now() - 60000, duration: 15234, command: "KEYS", args: ["*user*"] },
  { id: 2, timestamp: Date.now() - 120000, duration: 8945, command: "SMEMBERS", args: ["large:set:key"] },
  { id: 3, timestamp: Date.now() - 300000, duration: 5432, command: "SORT", args: ["mylist", "BY", "weight_*"] },
  { id: 4, timestamp: Date.now() - 600000, duration: 3210, command: "ZRANGEBYSCORE", args: ["leaderboard", "-inf", "+inf"] },
  { id: 5, timestamp: Date.now() - 900000, duration: 2100, command: "LRANGE", args: ["queue:emails", "0", "-1"] },
  { id: 6, timestamp: Date.now() - 1200000, duration: 1890, command: "HGETALL", args: ["big:hash:key"] },
  { id: 7, timestamp: Date.now() - 1500000, duration: 1456, command: "SUNION", args: ["set:a", "set:b", "set:c"] },
  { id: 8, timestamp: Date.now() - 1800000, duration: 1234, command: "EVAL", args: ["return redis.call('get',KEYS[1])", "1", "mykey"] },
];

export const mockMonitorEntries: MonitorEntry[] = [
  { timestamp: "14:23:01.234", client: "192.168.1.10:45234", db: 0, command: "GET", args: "user:1001:session", type: "read" },
  { timestamp: "14:23:01.235", client: "192.168.1.10:45234", db: 0, command: "SET", args: 'cache:api:products "..."', type: "write" },
  { timestamp: "14:23:01.240", client: "192.168.1.15:52341", db: 0, command: "HGETALL", args: "user:1002:profile", type: "read" },
  { timestamp: "14:23:01.245", client: "192.168.1.20:38912", db: 0, command: "LPUSH", args: "queue:emails ...", type: "write" },
  { timestamp: "14:23:01.250", client: "10.0.0.5:61234", db: 0, command: "CONFIG", args: "GET maxmemory", type: "admin" },
  { timestamp: "14:23:01.255", client: "192.168.1.10:45234", db: 0, command: "ZADD", args: "leaderboard:weekly 1500 player42", type: "write" },
  { timestamp: "14:23:01.260", client: "192.168.1.15:52341", db: 0, command: "SUBSCRIBE", args: "notifications", type: "admin" },
  { timestamp: "14:23:01.265", client: "192.168.1.10:45234", db: 0, command: "GET", args: "cache:homepage", type: "read" },
];

export const mockACLUsers: ACLUser[] = [
  { username: "default", enabled: true, flags: ["on"], passwords: 1, commands: "+@all", keys: "~*", channels: "&*" },
  { username: "readonly", enabled: true, flags: ["on"], passwords: 1, commands: "+@read -@dangerous", keys: "~*", channels: "&*" },
  { username: "app-service", enabled: true, flags: ["on"], passwords: 1, commands: "+@read +@write +@set +@list -@admin", keys: "~app:*", channels: "&app:*" },
  { username: "monitoring", enabled: true, flags: ["on"], passwords: 1, commands: "+info +ping +slowlog", keys: "", channels: "" },
  { username: "disabled-user", enabled: false, flags: ["off"], passwords: 0, commands: "-@all", keys: "", channels: "" },
];

export const mockDbSizes: Record<number, number> = {
  0: 20, 1: 5, 2: 0, 3: 12, 4: 0, 5: 0, 6: 0, 7: 3,
  8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 13: 0, 14: 0, 15: 1,
};

export const mockStatsHistory = Array.from({ length: 30 }, (_, i) => ({
  time: `${Math.floor(i / 2)}:${(i % 2) * 30 || "00"}`,
  ops: 800 + Math.floor(Math.random() * 900),
  memory: 42 + Math.random() * 8,
  clients: 28 + Math.floor(Math.random() * 12),
  hitRate: 95 + Math.random() * 4.5,
}));

export const mockPubSubMessages: PubSubMessage[] = [
  { id: "1", channel: "notifications", message: '{"type":"new_order","orderId":"ORD-1234","amount":59.99}', timestamp: Date.now() - 5000 },
  { id: "2", channel: "notifications", message: '{"type":"user_signup","userId":"USR-5678","email":"new@user.com"}', timestamp: Date.now() - 10000 },
  { id: "3", channel: "chat:room:1", message: '{"from":"alice","text":"Hello everyone!"}', timestamp: Date.now() - 15000 },
  { id: "4", channel: "system:alerts", message: '{"level":"warning","msg":"High memory usage detected"}', timestamp: Date.now() - 20000 },
  { id: "5", channel: "chat:room:1", message: '{"from":"bob","text":"Hey Alice!"}', timestamp: Date.now() - 25000 },
];

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function getTTLColor(ttl: number): string {
  if (ttl === -1) return "text-muted-foreground";
  if (ttl < 60) return "text-status-error";
  if (ttl < 3600) return "text-status-warning";
  return "text-status-success";
}

export function getTTLLabel(ttl: number): string {
  if (ttl === -1) return "No TTL";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
  if (ttl < 86400) return `${Math.floor(ttl / 3600)}h`;
  return `${Math.floor(ttl / 86400)}d`;
}

export const keyTypeColors: Record<KeyType, string> = {
  string: "bg-redis-string",
  list: "bg-redis-list",
  hash: "bg-redis-hash",
  set: "bg-redis-set",
  zset: "bg-redis-zset",
  stream: "bg-redis-stream",
  geo: "bg-redis-geo",
  hyperloglog: "bg-redis-hll",
  bitmap: "bg-redis-bitmap",
};

export const keyTypeTextColors: Record<KeyType, string> = {
  string: "text-redis-string",
  list: "text-redis-list",
  hash: "text-redis-hash",
  set: "text-redis-set",
  zset: "text-redis-zset",
  stream: "text-redis-stream",
  geo: "text-redis-geo",
  hyperloglog: "text-redis-hll",
  bitmap: "text-redis-bitmap",
};
