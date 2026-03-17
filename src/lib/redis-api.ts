// Frontend API client for Node.js backend
// Use relative URLs when VITE_API_URL is not set (for reverse proxy deployment)
// This enables same-domain requests through nginx reverse proxy
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Type definitions
interface ConfigParameter {
  name: string;
  value: string;
  category: 'memory' | 'network' | 'security' | 'persistence' | 'logging' | 'replication' | 'lua' | 'other';
  mutable: boolean;
  dangerous: boolean;
  enumValues?: string[];
  description?: string;
}

// Base fetch wrapper with authentication and error handling
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('jwt');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add Authorization header if token exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 - clear token and redirect to login
  if (response.status === 401) {
    localStorage.removeItem('jwt');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  // Handle non-2xx responses
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
  }

  const data = await response.json();
  
  // Handle API response format { success: true, data: ... }
  if (data.success === false) {
    throw new Error(data.error || 'API request failed');
  }
  
  return data.data !== undefined ? data.data : data;
}

// Auth methods
export const auth = {
  checkSetup: () => 
    apiFetch<{ needsSetup: boolean }>('/api/auth/setup'),
  
  setup: (username: string, password: string) =>
    apiFetch<{ token: string }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  
  login: (username: string, password: string) =>
    apiFetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  
  getCurrentUser: () =>
    apiFetch<{ id: number; username: string; role: string }>('/api/auth/me'),
};

// Connection methods
export const connections = {
  getConnections: () =>
    apiFetch<any[]>('/api/connections'),
  
  createConnection: (data: { name: string; url: string; color?: string }) =>
    apiFetch<any>('/api/connections', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  
  updateConnection: (id: number, data: { name?: string; url?: string; color?: string; isDefault?: boolean }) =>
    apiFetch<any>(`/api/connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  
  deleteConnection: (id: number) =>
    apiFetch<void>(`/api/connections/${id}`, {
      method: 'DELETE',
    }),
  
  testConnection: (id: number, db?: number) =>
    apiFetch<{ status: string; latencyMs?: number; error?: string }>('/api/connections/:id/test'.replace(':id', String(id)), {
      method: 'POST',
      body: JSON.stringify({ db }),
    }),
};

// Key management methods
export const keys = {
  scanKeys: (connectionId: number, pattern?: string, cursor?: string, count?: number, db?: number) =>
    apiFetch<{ cursor: string; keys: Array<{ key: string; type: string; ttl: number }> }>('/api/keys/scan', {
      method: 'POST',
      body: JSON.stringify({ connectionId, pattern, cursor, count, db }),
    }),
  
  getKeyInfo: (connectionId: number, key: string, db?: number) =>
    apiFetch<{ type: string; ttl: number; memory?: number; encoding?: string }>('/api/keys/info', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
  
  deleteKey: (connectionId: number, key: string, db?: number) =>
    apiFetch<void>('/api/keys/delete', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
  
  renameKey: (connectionId: number, key: string, newKey: string, db?: number) =>
    apiFetch<void>('/api/keys/rename', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, newKey, db }),
    }),
  
  setTTL: (connectionId: number, key: string, ttl: number, db?: number) =>
    apiFetch<void>('/api/keys/ttl', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, ttl, db }),
    }),

  expireKey: (connectionId: number, key: string, ttl: number, db?: number) =>
    apiFetch<{ result: number }>('/api/redis/keys/expire', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, ttl, db }),
    }),

  persistKey: (connectionId: number, key: string, db?: number) =>
    apiFetch<{ result: number }>('/api/redis/keys/persist', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
};

// String data type methods
export const stringOps = {
  getString: (connectionId: number, key: string, db?: number) =>
    apiFetch<string | null>('/api/string/get', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
  
  setString: (connectionId: number, key: string, value: string, ttl?: number, db?: number) =>
    apiFetch<void>('/api/string/set', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, value, ttl, db }),
    }),

  // New STRING CRUD operations
  putString: (connectionId: number, key: string, value: string, db?: number) =>
    apiFetch<void>('/api/redis/strings', {
      method: 'PUT',
      body: JSON.stringify({ connectionId, key, value, db }),
    }),

  appendString: (connectionId: number, key: string, value: string, db?: number) =>
    apiFetch<{ length: number }>('/api/redis/strings/append', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, value, db }),
    }),

  incrString: (connectionId: number, key: string, db?: number) =>
    apiFetch<{ value: number }>('/api/redis/strings/incr', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),

  decrString: (connectionId: number, key: string, db?: number) =>
    apiFetch<{ value: number }>('/api/redis/strings/decr', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
};

// Hash data type methods
export const hashOps = {
  getHash: (connectionId: number, key: string, db?: number) =>
    apiFetch<Record<string, string>>('/api/hash/getall', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
  
  setHashField: (connectionId: number, key: string, field: string, value: string, db?: number) =>
    apiFetch<{ created: boolean }>('/api/redis/hashes/set', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, field, value, db }),
    }),
  
  deleteHashField: (connectionId: number, key: string, field: string, db?: number) =>
    apiFetch<{ deleted: number }>('/api/redis/hashes/field', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, key, field, db }),
    }),
  
  renameHashField: (connectionId: number, key: string, oldField: string, newField: string, db?: number) =>
    apiFetch<{ renamed: boolean }>('/api/redis/hashes/rename-field', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, oldField, newField, db }),
    }),
};

// List data type methods
export const listOps = {
  getListRange: (connectionId: number, key: string, start: number, stop: number, db?: number) =>
    apiFetch<string[]>('/api/list/range', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, start, stop, db }),
    }),
  
  pushToList: (connectionId: number, key: string, value: string, direction: 'left' | 'right', db?: number) =>
    apiFetch<{ length: number }>('/api/redis/lists/push', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, value, direction, db }),
    }),
  
  setListElement: (connectionId: number, key: string, index: number, value: string, db?: number) =>
    apiFetch<void>('/api/redis/lists/set', {
      method: 'PUT',
      body: JSON.stringify({ connectionId, key, index, value, db }),
    }),
  
  deleteListItem: (connectionId: number, key: string, index: number, db?: number) =>
    apiFetch<void>('/api/redis/lists/item', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, key, index, db }),
    }),
  
  removeListElements: (connectionId: number, key: string, count: number, value: string, db?: number) =>
    apiFetch<void>('/api/list/remove', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, count, value, db }),
    }),
};

// Set data type methods
export const setOps = {
  getSetMembers: (connectionId: number, key: string, db?: number) =>
    apiFetch<string[]>('/api/set/members', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),
  
  addSetMembers: (connectionId: number, key: string, members: string[], db?: number) =>
    apiFetch<void>('/api/set/add', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, members, db }),
    }),
  
  removeSetMember: (connectionId: number, key: string, member: string, db?: number) =>
    apiFetch<void>('/api/set/remove', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, member, db }),
    }),

  // New SET CRUD operations
  addSetMember: (connectionId: number, key: string, member: string, db?: number) =>
    apiFetch<{ added: number }>('/api/redis/sets/add', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, member, db }),
    }),

  removeSetMemberCrud: (connectionId: number, key: string, member: string, db?: number) =>
    apiFetch<{ removed: number }>('/api/redis/sets/member', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, key, member, db }),
    }),
};

// Sorted set CRUD operations
export const zsetCrudOps = {
  addZSetMember: (connectionId: number, key: string, member: string, score: number, db?: number) =>
    apiFetch<{ added: number }>('/api/redis/zsets/add', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, member, score, db }),
    }),

  removeZSetMember: (connectionId: number, key: string, member: string, db?: number) =>
    apiFetch<{ removed: number }>('/api/redis/zsets/member', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, key, member, db }),
    }),
};

// Sorted set data type methods
export const zsetOps = {
  getZSetRange: (connectionId: number, key: string, start: number, stop: number, db?: number) =>
    apiFetch<Array<{ member: string; score: number }>>('/api/zset/range', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, start, stop, db }),
    }),
  
  addZSetMember: (connectionId: number, key: string, score: number, member: string, db?: number) =>
    apiFetch<void>('/api/zset/add', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, score, member, db }),
    }),
  
  removeZSetMember: (connectionId: number, key: string, member: string, db?: number) =>
    apiFetch<void>('/api/zset/remove', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, member, db }),
    }),
};

// Stream data type methods
export const streamOps = {
  getStreamRange: (connectionId: number, key: string, start?: string, end?: string, count?: number, db?: number) =>
    apiFetch<Array<{ id: string; fields: Record<string, string> }>>('/api/stream/range', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, start, end, count, db }),
    }),
  
  getStreamInfo: (connectionId: number, key: string, db?: number) =>
    apiFetch<Record<string, any>>('/api/stream/info', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, db }),
    }),

  // CRUD operations
  addStreamEntry: (connectionId: number, key: string, fields: Record<string, string>, db?: number) =>
    apiFetch<{ entryId: string }>('/api/redis/streams/add', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, fields, db }),
    }),

  deleteStreamEntry: (connectionId: number, key: string, entryId: string, db?: number) =>
    apiFetch<{ deleted: number }>('/api/redis/streams/entry', {
      method: 'DELETE',
      body: JSON.stringify({ connectionId, key, entryId, db }),
    }),

  trimStream: (connectionId: number, key: string, strategy: 'MAXLEN' | 'MINID', value: string, db?: number) =>
    apiFetch<{ deletedCount: number }>('/api/redis/streams/trim', {
      method: 'POST',
      body: JSON.stringify({ connectionId, key, strategy, value, db }),
    }),
};

// Server management methods
export const server = {
  getServerInfo: (connectionId: number, section?: string, db?: number) =>
    apiFetch<Record<string, Record<string, string>>>('/api/server/info', {
      method: 'POST',
      body: JSON.stringify({ connectionId, section, db }),
    }),
  
  getConfig: (connectionId: number, parameter: string, db?: number) =>
    apiFetch<Record<string, string>>('/api/server/config', {
      method: 'POST',
      body: JSON.stringify({ connectionId, parameter, db }),
    }),
  
  setConfig: (connectionId: number, parameter: string, value: string, db?: number) =>
    apiFetch<void>('/api/server/config/set', {
      method: 'POST',
      body: JSON.stringify({ connectionId, parameter, value, db }),
    }),
  
  getClients: (connectionId: number, db?: number) =>
    apiFetch<Array<Record<string, string>>>('/api/server/clients', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),

  killClient: (connectionId: number, clientId: string) =>
    apiFetch<{ killed: number }>('/api/redis/clients/kill', {
      method: 'POST',
      body: JSON.stringify({ connectionId, clientId }),
    }),

  killIdleClients: (connectionId: number, idleThreshold: number) =>
    apiFetch<{ killed: number }>('/api/redis/clients/kill-idle', {
      method: 'POST',
      body: JSON.stringify({ connectionId, idleThreshold }),
    }),
  
  bgsave: (connectionId: number, db?: number) =>
    apiFetch<void>('/api/server/bgsave', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
};

// CLI method
export const cli = {
  executeCommand: (connectionId: number, command: string, db?: number) =>
    apiFetch<any>('/api/cli', {
      method: 'POST',
      body: JSON.stringify({ connectionId, command, db }),
    }),
};

// Slow log methods
export const slowlog = {
  getSlowLog: (connectionId: number, count?: number, db?: number) =>
    apiFetch<any[]>('/api/slowlog/get', {
      method: 'POST',
      body: JSON.stringify({ connectionId, count, db }),
    }),
  
  resetSlowLog: (connectionId: number, db?: number) =>
    apiFetch<void>('/api/slowlog/reset', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
  
  getSlowLogConfig: (connectionId: number, db?: number) =>
    apiFetch<Record<string, string>>('/api/slowlog/config', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
};

// Memory analysis methods
export const memory = {
  getMemoryStats: (connectionId: number, db?: number) =>
    apiFetch<Record<string, any>>('/api/memory/stats', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
  
  getMemoryDoctor: (connectionId: number, db?: number) =>
    apiFetch<string>('/api/memory/doctor', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
  
  getTopKeys: (connectionId: number, count?: number, db?: number) =>
    apiFetch<Array<{ key: string; memory: number }>>('/api/memory/top-keys', {
      method: 'POST',
      body: JSON.stringify({ connectionId, count, db }),
    }),
};

// ACL management methods
export const acl = {
  getACLList: (connectionId: number, db?: number) =>
    apiFetch<string[]>('/api/acl/list', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
  
  setACLUser: (connectionId: number, username: string, rules: string, db?: number) =>
    apiFetch<void>('/api/acl/setuser', {
      method: 'POST',
      body: JSON.stringify({ connectionId, username, rules, db }),
    }),
  
  deleteACLUser: (connectionId: number, username: string, db?: number) =>
    apiFetch<void>('/api/acl/deluser', {
      method: 'POST',
      body: JSON.stringify({ connectionId, username, db }),
    }),
  
  resetACLLog: (connectionId: number, db?: number) =>
    apiFetch<void>('/api/acl/resetlog', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
};

// Database management methods
export const database = {
  getDatabaseInfo: (connectionId: number) =>
    apiFetch<Array<{ db: number; keys: number; expires: number }>>('/api/db/info', {
      method: 'POST',
      body: JSON.stringify({ connectionId }),
    }),
  
  flushDatabase: (connectionId: number, db: number) =>
    apiFetch<void>('/api/db/flush', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
};

// Export/Import methods
export const dataTransfer = {
  exportKeys: (connectionId: number, pattern?: string, db?: number) =>
    apiFetch<Array<{ key: string; type: string; ttl: number; value: any }>>('/api/export', {
      method: 'POST',
      body: JSON.stringify({ connectionId, pattern, db }),
    }),
  
  importKeys: (connectionId: number, data: Array<{ key: string; type: string; ttl: number; value: any }>, db?: number) =>
    apiFetch<{ imported: number; failed: number }>('/api/import', {
      method: 'POST',
      body: JSON.stringify({ connectionId, data, db }),
    }),
};

// Diagnostics methods
export const diagnostics = {
  getDiagnostics: (connectionId: number, db?: number) =>
    apiFetch<Array<{ category: string; status: string; message: string; recommendation?: string; command?: string }>>('/api/redis/diagnostics', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),

  runDiagnostics: (connectionId: number, db?: number) =>
    apiFetch<Array<{ category: string; status: string; message: string; recommendation?: string; command?: string }>>('/api/redis/diagnostics', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db }),
    }),
};

// Connected Clients methods
export const clients = {
  getClients: (connectionId: number) =>
    apiFetch<{ clients: Array<{ id: string; addr: string; user: string; name: string; db: number; cmd: string; idle: number; flags: string }> }>(`/api/redis/clients?connectionId=${connectionId}`, {
      method: 'GET',
    }),
  
  killClient: (connectionId: number, clientId: string) =>
    apiFetch<{ killed: number }>('/api/redis/clients/kill', {
      method: 'POST',
      body: JSON.stringify({ connectionId, clientId }),
    }),
  
  killIdleClients: (connectionId: number, idleThreshold: number) =>
    apiFetch<{ killed: number }>('/api/redis/clients/kill-idle', {
      method: 'POST',
      body: JSON.stringify({ connectionId, idleThreshold }),
    }),
};

// Config Editor methods
export const config = {
  getConfig: (connectionId: number) =>
    apiFetch<{ parameters: ConfigParameter[] }>(`/api/redis/config?connectionId=${connectionId}`, {
      method: 'GET',
    }),
  
  setConfig: (connectionId: number, parameter: string, value: string) =>
    apiFetch<{ parameter: string; value: string }>('/api/redis/config', {
      method: 'PATCH',
      body: JSON.stringify({ connectionId, parameter, value }),
    }),
};

// TTL Manager methods
export const ttl = {
  getDistribution: (connectionId: number, db?: number) =>
    apiFetch<{
      noTTL: number;
      lessThan1Min: number;
      oneToSixtyMin: number;
      oneToTwentyFourHours: number;
      moreThanTwentyFourHours: number;
    }>(`/api/redis/ttl/distribution?connectionId=${connectionId}&db=${db || 0}`, {
      method: 'GET',
    }),
  
  getExpiringSoon: (connectionId: number, db?: number) =>
    apiFetch<{ keys: Array<{ key: string; type: string; ttl: number; db: number }> }>(`/api/redis/ttl/expiring-soon?connectionId=${connectionId}&db=${db || 0}`, {
      method: 'GET',
    }),
  
  bulkApply: (connectionId: number, pattern: string, ttlSeconds: number, db?: number) =>
    apiFetch<{ affected: number }>('/api/redis/ttl/bulk-apply', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db: db || 0, pattern, ttl: ttlSeconds }),
    }),
  
  bulkRemove: (connectionId: number, pattern: string, db?: number) =>
    apiFetch<{ affected: number }>('/api/redis/ttl/bulk-remove', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db: db || 0, pattern }),
    }),

  // Aliases for task requirements
  getTTLDistribution: (connectionId: number, db?: number) =>
    apiFetch<{
      noTTL: number;
      lessThan1Min: number;
      oneToSixtyMin: number;
      oneToTwentyFourHours: number;
      moreThanTwentyFourHours: number;
    }>(`/api/redis/ttl/distribution?connectionId=${connectionId}&db=${db || 0}`, {
      method: 'GET',
    }),
  
  bulkApplyTTL: (connectionId: number, pattern: string, ttlSeconds: number, db?: number) =>
    apiFetch<{ affected: number }>('/api/redis/ttl/bulk-apply', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db: db || 0, pattern, ttl: ttlSeconds }),
    }),
  
  bulkRemoveTTL: (connectionId: number, pattern: string, db?: number) =>
    apiFetch<{ affected: number }>('/api/redis/ttl/bulk-remove', {
      method: 'POST',
      body: JSON.stringify({ connectionId, db: db || 0, pattern }),
    }),
};

// Keyspace Events methods
export const keyspace = {
  getConfig: (connectionId: number) =>
    apiFetch<{ config: string }>(`/api/redis/config/keyspace/config?connectionId=${connectionId}`, {
      method: 'GET',
    }),
  
  setConfig: (connectionId: number, preset: 'none' | 'expired' | 'all') =>
    apiFetch<{ config: string }>('/api/redis/config/keyspace/config', {
      method: 'POST',
      body: JSON.stringify({ connectionId, preset }),
    }),
};

// Global Search methods
export const search = {
  searchKeys: (
    connectionId: number,
    query: string,
    mode: 'names' | 'values' | 'both',
    typeFilters?: string[],
    dbFilter?: number,
    cursor?: string,
    limit?: number
  ) =>
    apiFetch<{
      results: Array<{
        key: string;
        type: string;
        db: number;
        matchType: 'name' | 'value';
        matchLocation?: string;
      }>;
      cursor: string | null;
      hasMore: boolean;
    }>('/api/redis/search', {
      method: 'POST',
      body: JSON.stringify({
        connectionId,
        query,
        mode,
        typeFilters,
        dbFilter,
        cursor,
        limit,
      }),
    }),
};

// Legacy redisApi object for backward compatibility
// This maintains the existing interface while using the new backend
export const redisApi = {
  // Server info
  info: (connectionId: string, db?: number) =>
    server.getServerInfo(Number(connectionId), undefined, db),

  // Key scanning
  scanKeys: (connectionId: string, opts: { pattern?: string; cursor?: string; db?: number; count?: number } = {}) =>
    keys.scanKeys(Number(connectionId), opts.pattern, opts.cursor, opts.count, opts.db),

  // Key metadata
  getKeyMeta: (connectionId: string, key: string, db?: number) =>
    keys.getKeyInfo(Number(connectionId), key, db),

  // Key value (type-aware) - returns the value based on type with metadata
  getKeyValue: async (connectionId: string, key: string, db?: number) => {
    const info = await keys.getKeyInfo(Number(connectionId), key, db);
    const connId = Number(connectionId);
    
    let value: unknown;
    let length = 0;
    
    switch (info.type) {
      case 'string':
        value = await stringOps.getString(connId, key, db);
        length = typeof value === 'string' ? value.length : 0;
        break;
      case 'hash':
        value = await hashOps.getHash(connId, key, db);
        length = Object.keys(value as Record<string, string>).length;
        break;
      case 'list':
        value = await listOps.getListRange(connId, key, 0, -1, db);
        length = Array.isArray(value) ? value.length : 0;
        break;
      case 'set':
        value = await setOps.getSetMembers(connId, key, db);
        length = Array.isArray(value) ? value.length : 0;
        break;
      case 'zset':
        value = await zsetOps.getZSetRange(connId, key, 0, -1, db);
        length = Array.isArray(value) ? value.length : 0;
        break;
      case 'stream':
        value = await streamOps.getStreamRange(connId, key, '-', '+', 100, db);
        length = Array.isArray(value) ? value.length : 0;
        break;
      default:
        throw new Error(`Unsupported key type: ${info.type}`);
    }
    
    return {
      type: info.type,
      value,
      length,
    };
  },

  // String operations
  setString: (connectionId: string, key: string, value: string, ttl?: number, db?: number) =>
    stringOps.setString(Number(connectionId), key, value, ttl, db),

  // Hash operations
  hashSet: (connectionId: string, key: string, field: string, value: string, db?: number) =>
    hashOps.setHashField(Number(connectionId), key, field, value, db),
  hashDel: (connectionId: string, key: string, field: string, db?: number) =>
    hashOps.deleteHashField(Number(connectionId), key, field, db),

  // List operations
  listPush: (connectionId: string, key: string, value: string, direction: 'left' | 'right' = 'right', db?: number) =>
    listOps.pushToList(Number(connectionId), key, value, direction, db),
  listSet: (connectionId: string, key: string, index: number, value: string, db?: number) =>
    listOps.setListElement(Number(connectionId), key, index, value, db),
  listDeleteItem: (connectionId: string, key: string, index: number, db?: number) =>
    listOps.deleteListItem(Number(connectionId), key, index, db),

  // Set operations
  setAdd: (connectionId: string, key: string, members: string[], db?: number) =>
    setOps.addSetMembers(Number(connectionId), key, members, db),
  setRem: (connectionId: string, key: string, member: string, db?: number) =>
    setOps.removeSetMember(Number(connectionId), key, member, db),

  // Sorted Set operations
  zsetAdd: (connectionId: string, key: string, score: number, member: string, db?: number) =>
    zsetOps.addZSetMember(Number(connectionId), key, score, member, db),
  zsetRem: (connectionId: string, key: string, member: string, db?: number) =>
    zsetOps.removeZSetMember(Number(connectionId), key, member, db),

  // Key management
  deleteKey: (connectionId: string, key: string, db?: number) =>
    keys.deleteKey(Number(connectionId), key, db),
  renameKey: (connectionId: string, key: string, newKey: string, db?: number) =>
    keys.renameKey(Number(connectionId), key, newKey, db),
  setTtl: (connectionId: string, key: string, ttl: number, db?: number) =>
    keys.setTTL(Number(connectionId), key, ttl, db),
  persistKey: (connectionId: string, key: string, db?: number) =>
    keys.setTTL(Number(connectionId), key, -1, db),

  // CLI
  cli: (connectionId: string, command: string, db?: number) =>
    cli.executeCommand(Number(connectionId), command, db),

  // Slow log
  getSlowLog: (connectionId: string, count = 100, db?: number) =>
    slowlog.getSlowLog(Number(connectionId), count, db),
  resetSlowLog: (connectionId: string) =>
    slowlog.resetSlowLog(Number(connectionId)),
  getSlowLogConfig: (connectionId: string) =>
    slowlog.getSlowLogConfig(Number(connectionId)),

  // Memory
  getMemoryStats: (connectionId: string, db?: number) =>
    memory.getMemoryStats(Number(connectionId), db),
  getMemoryDoctor: (connectionId: string) =>
    memory.getMemoryDoctor(Number(connectionId)),
  getTopKeys: (connectionId: string, db?: number) =>
    memory.getTopKeys(Number(connectionId), undefined, db),

  // ACL
  getAcl: (connectionId: string) =>
    acl.getACLList(Number(connectionId)),
  setAclUser: (connectionId: string, username: string, rules: string) =>
    acl.setACLUser(Number(connectionId), username, rules),
  deleteAclUser: (connectionId: string, username: string) =>
    acl.deleteACLUser(Number(connectionId), username),
  resetAclLog: (connectionId: string) =>
    acl.resetACLLog(Number(connectionId)),

  // Config
  getConfig: (connectionId: string, param = '*') =>
    server.getConfig(Number(connectionId), param),
  setConfig: (connectionId: string, param: string, value: string) =>
    server.setConfig(Number(connectionId), param, value),

  // DB info
  getDbInfo: (connectionId: string) =>
    database.getDatabaseInfo(Number(connectionId)),

  // Export / Import
  exportKeys: (connectionId: string, pattern = '*', db?: number) =>
    dataTransfer.exportKeys(Number(connectionId), pattern, db),
  importKeys: (connectionId: string, data: unknown[], db?: number) =>
    dataTransfer.importKeys(Number(connectionId), data as any, db),

  // Connection management
  testConnection: (id: string) =>
    connections.testConnection(Number(id)),
  addConnection: (name: string, url: string, color: string) =>
    connections.createConnection({ name, url, color }),
  updateConnection: (id: string, updates: { name?: string; url?: string; color?: string }) =>
    connections.updateConnection(Number(id), updates),
  deleteConnection: (id: string) =>
    connections.deleteConnection(Number(id)),
  
  // Note: seedConnections is not implemented in the new backend
  // This was a Supabase-specific function
  seedConnections: (_productionUrl?: string) => {
    throw new Error('seedConnections is not supported in the new backend');
  },
};
