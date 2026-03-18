/**
 * Diagnostics Routes
 * 
 * Handles Redis health check analysis across seven categories:
 * memory, persistence, performance, connections, replication, security, and keyspace.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Health check status types
 */
type HealthStatus = 'healthy' | 'warning' | 'critical';

/**
 * Health check category types
 */
type HealthCategory = 'memory' | 'persistence' | 'performance' | 'connections' | 'replication' | 'security' | 'keyspace';

/**
 * Health check interface
 */
interface HealthCheck {
  category: HealthCategory;
  status: HealthStatus;
  message: string;
  recommendation?: string;
  command?: string;
}

/**
 * Validation schema for diagnostics request
 */
const diagnosticsSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * Parse Redis INFO response into sections
 */
function parseInfoResponse(infoString: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = 'default';
  
  const lines = infoString.split('\r\n');
  
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    
    if (line.startsWith('#')) {
      currentSection = line.substring(1).trim().toLowerCase();
      sections[currentSection] = {};
      continue;
    }
    
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      if (!sections[currentSection]) {
        sections[currentSection] = {};
      }
      
      sections[currentSection][key] = value;
    }
  }
  
  return sections;
}

/**
 * Analyze memory health
 */
function analyzeMemory(info: Record<string, Record<string, string>>): HealthCheck {
  const memory = info.memory || {};
  const usedMemory = parseInt(memory.used_memory || '0', 10);
  const maxMemory = parseInt(memory.maxmemory || '0', 10);
  
  // If maxmemory is 0, it means no limit is set
  if (maxMemory === 0) {
    return {
      category: 'memory',
      status: 'warning',
      message: 'No memory limit configured',
      recommendation: 'Set maxmemory to prevent out-of-memory issues',
      command: 'CONFIG SET maxmemory <bytes>',
    };
  }
  
  const usagePercent = (usedMemory / maxMemory) * 100;
  
  if (usagePercent > 80) {
    return {
      category: 'memory',
      status: 'critical',
      message: `Memory usage at ${usagePercent.toFixed(1)}% of limit`,
      recommendation: 'Increase maxmemory or enable eviction policy',
      command: 'CONFIG SET maxmemory <bytes>',
    };
  }
  
  if (usagePercent > 60) {
    return {
      category: 'memory',
      status: 'warning',
      message: `Memory usage at ${usagePercent.toFixed(1)}% of limit`,
      recommendation: 'Monitor memory usage closely',
    };
  }
  
  return {
    category: 'memory',
    status: 'healthy',
    message: `Memory usage at ${usagePercent.toFixed(1)}% of limit`,
  };
}

/**
 * Analyze persistence health
 */
function analyzePersistence(info: Record<string, Record<string, string>>): HealthCheck {
  const persistence = info.persistence || {};
  const aofEnabled = persistence.aof_enabled === '1';
  const rdbLastSaveTime = parseInt(persistence.rdb_last_save_time || '0', 10);
  const rdbChangesSinceLastSave = parseInt(persistence.rdb_changes_since_last_save || '0', 10);
  
  // Check if both are disabled
  if (!aofEnabled && rdbLastSaveTime === 0) {
    return {
      category: 'persistence',
      status: 'critical',
      message: 'No persistence configured (RDB and AOF disabled)',
      recommendation: 'Enable AOF or configure RDB snapshots to prevent data loss',
      command: 'CONFIG SET appendonly yes',
    };
  }
  
  // Check if only RDB is enabled but hasn't saved recently
  if (!aofEnabled && rdbChangesSinceLastSave > 10000) {
    return {
      category: 'persistence',
      status: 'warning',
      message: `${rdbChangesSinceLastSave} changes since last RDB save`,
      recommendation: 'Consider enabling AOF for better durability',
      command: 'CONFIG SET appendonly yes',
    };
  }
  
  // Check AOF rewrite status
  if (aofEnabled) {
    const aofRewriteInProgress = persistence.aof_rewrite_in_progress === '1';
    if (aofRewriteInProgress) {
      return {
        category: 'persistence',
        status: 'healthy',
        message: 'AOF enabled, rewrite in progress',
      };
    }
    
    return {
      category: 'persistence',
      status: 'healthy',
      message: 'AOF enabled',
    };
  }
  
  return {
    category: 'persistence',
    status: 'healthy',
    message: 'RDB snapshots configured',
  };
}

/**
 * Analyze performance health
 */
function analyzePerformance(info: Record<string, Record<string, string>>): HealthCheck {
  const stats = info.stats || {};
  const opsPerSec = parseInt(stats.instantaneous_ops_per_sec || '0', 10);
  const keyspaceHits = parseInt(stats.keyspace_hits || '0', 10);
  const keyspaceMisses = parseInt(stats.keyspace_misses || '0', 10);
  
  // Calculate hit rate
  const totalOps = keyspaceHits + keyspaceMisses;
  const hitRate = totalOps > 0 ? (keyspaceHits / totalOps) * 100 : 100;
  
  // Check hit rate
  if (hitRate < 80 && totalOps > 100) {
    return {
      category: 'performance',
      status: 'warning',
      message: `Cache hit rate at ${hitRate.toFixed(1)}% (${opsPerSec} ops/sec)`,
      recommendation: 'Low hit rate indicates inefficient caching. Review key access patterns',
    };
  }
  
  // Check ops per second (consider > 10000 as high)
  if (opsPerSec > 10000) {
    return {
      category: 'performance',
      status: 'warning',
      message: `High operations rate: ${opsPerSec} ops/sec`,
      recommendation: 'Monitor server load and consider scaling',
    };
  }
  
  return {
    category: 'performance',
    status: 'healthy',
    message: `${opsPerSec} ops/sec, ${hitRate.toFixed(1)}% hit rate`,
  };
}

/**
 * Analyze connections health
 */
function analyzeConnections(info: Record<string, Record<string, string>>): HealthCheck {
  const clients = info.clients || {};
  const server = info.server || {};
  const connectedClients = parseInt(clients.connected_clients || '0', 10);
  const maxClients = parseInt(server.maxclients || '10000', 10);
  
  const usagePercent = (connectedClients / maxClients) * 100;
  
  if (usagePercent > 80) {
    return {
      category: 'connections',
      status: 'critical',
      message: `${connectedClients} of ${maxClients} connections used (${usagePercent.toFixed(1)}%)`,
      recommendation: 'Increase maxclients or investigate connection leaks',
      command: 'CONFIG SET maxclients <number>',
    };
  }
  
  if (usagePercent > 60) {
    return {
      category: 'connections',
      status: 'warning',
      message: `${connectedClients} of ${maxClients} connections used (${usagePercent.toFixed(1)}%)`,
      recommendation: 'Monitor connection count closely',
    };
  }
  
  return {
    category: 'connections',
    status: 'healthy',
    message: `${connectedClients} of ${maxClients} connections used`,
  };
}

/**
 * Analyze replication health
 */
function analyzeReplication(info: Record<string, Record<string, string>>): HealthCheck {
  const replication = info.replication || {};
  const role = replication.role || 'master';
  
  // If this is a master, check replica status
  if (role === 'master') {
    const connectedSlaves = parseInt(replication.connected_slaves || '0', 10);
    
    if (connectedSlaves === 0) {
      return {
        category: 'replication',
        status: 'healthy',
        message: 'Master with no replicas',
      };
    }
    
    // Check each replica's lag
    for (let i = 0; i < connectedSlaves; i++) {
      const slaveInfo = replication[`slave${i}`];
      if (slaveInfo) {
        const lagMatch = slaveInfo.match(/lag=(\d+)/);
        if (lagMatch) {
          const lag = parseInt(lagMatch[1], 10);
          if (lag > 1000) {
            return {
              category: 'replication',
              status: 'critical',
              message: `Replica ${i} has ${lag}ms replication lag`,
              recommendation: 'Check network connectivity and replica performance',
            };
          }
        }
      }
    }
    
    return {
      category: 'replication',
      status: 'healthy',
      message: `Master with ${connectedSlaves} replica(s)`,
    };
  }
  
  // If this is a replica, check master link status
  if (role === 'slave') {
    const masterLinkStatus = replication.master_link_status || 'down';
    const masterLastIoSecondsAgo = parseInt(replication.master_last_io_seconds_ago || '0', 10);
    
    if (masterLinkStatus === 'down') {
      return {
        category: 'replication',
        status: 'critical',
        message: 'Replica disconnected from master',
        recommendation: 'Check master availability and network connectivity',
      };
    }
    
    if (masterLastIoSecondsAgo > 10) {
      return {
        category: 'replication',
        status: 'warning',
        message: `No data from master for ${masterLastIoSecondsAgo} seconds`,
        recommendation: 'Check network connectivity to master',
      };
    }
    
    return {
      category: 'replication',
      status: 'healthy',
      message: 'Replica connected to master',
    };
  }
  
  return {
    category: 'replication',
    status: 'healthy',
    message: 'Standalone instance',
  };
}

/**
 * Analyze security health
 */
async function analyzeSecurity(client: any): Promise<HealthCheck> {
  try {
    // Get security-related config
    const configResult = await client.config('GET', 'requirepass', 'protected-mode') as string[];
    
    // Convert array to object
    const config: Record<string, string> = {};
    for (let i = 0; i < configResult.length; i += 2) {
      config[configResult[i]] = configResult[i + 1];
    }
    
    const requirepass = config.requirepass || '';
    const protectedMode = config['protected-mode'] || 'yes';
    
    // Check if password is not set
    if (!requirepass || requirepass === '') {
      if (protectedMode === 'no') {
        return {
          category: 'security',
          status: 'critical',
          message: 'No password set and protected mode disabled',
          recommendation: 'Set requirepass or enable protected-mode',
          command: 'CONFIG SET requirepass <password>',
        };
      }
      
      return {
        category: 'security',
        status: 'warning',
        message: 'No password configured',
        recommendation: 'Set requirepass for authentication',
        command: 'CONFIG SET requirepass <password>',
      };
    }
    
    // Check if protected mode is disabled
    if (protectedMode === 'no') {
      return {
        category: 'security',
        status: 'warning',
        message: 'Protected mode disabled',
        recommendation: 'Enable protected-mode for additional security',
        command: 'CONFIG SET protected-mode yes',
      };
    }
    
    return {
      category: 'security',
      status: 'healthy',
      message: 'Password authentication enabled',
    };
  } catch (error) {
    return {
      category: 'security',
      status: 'warning',
      message: 'Unable to check security configuration',
    };
  }
}

/**
 * Analyze keyspace health
 */
async function analyzeKeyspace(info: Record<string, Record<string, string>>): Promise<HealthCheck> {
  try {
    const keyspace = info.keyspace || {};
    const stats = info.stats || {};
    
    // Get total keys across all databases
    let totalKeys = 0;
    let totalExpires = 0;
    
    for (const [dbKey, dbInfo] of Object.entries(keyspace)) {
      if (dbKey.startsWith('db')) {
        const keysMatch = dbInfo.match(/keys=(\d+)/);
        const expiresMatch = dbInfo.match(/expires=(\d+)/);
        
        if (keysMatch) {
          totalKeys += parseInt(keysMatch[1], 10);
        }
        if (expiresMatch) {
          totalExpires += parseInt(expiresMatch[1], 10);
        }
      }
    }
    
    // Check expired keys stats
    const expiredKeys = parseInt(stats.expired_keys || '0', 10);
    const evictedKeys = parseInt(stats.evicted_keys || '0', 10);
    
    // Calculate percentage of keys with TTL
    const keysWithTTLPercent = totalKeys > 0 ? (totalExpires / totalKeys) * 100 : 0;
    
    // If less than 20% of keys have TTL, warn
    if (totalKeys > 100 && keysWithTTLPercent < 20) {
      return {
        category: 'keyspace',
        status: 'warning',
        message: `Only ${keysWithTTLPercent.toFixed(1)}% of keys have TTL set`,
        recommendation: 'Consider setting TTL on keys to prevent memory bloat',
        command: 'EXPIRE <key> <seconds>',
      };
    }
    
    // Check for high eviction rate
    if (evictedKeys > 1000) {
      return {
        category: 'keyspace',
        status: 'warning',
        message: `${evictedKeys} keys evicted, ${expiredKeys} keys expired`,
        recommendation: 'High eviction rate indicates memory pressure',
      };
    }
    
    return {
      category: 'keyspace',
      status: 'healthy',
      message: `${totalKeys} keys, ${keysWithTTLPercent.toFixed(1)}% with TTL`,
    };
  } catch (error) {
    return {
      category: 'keyspace',
      status: 'healthy',
      message: 'Keyspace analysis unavailable',
    };
  }
}

/**
 * POST /api/redis/diagnostics
 * 
 * Analyzes Redis instance health across seven categories and returns
 * structured health check results with recommendations.
 */
router.post(
  '/',
  authenticate,
  validate(diagnosticsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute INFO command to get all server information
      const infoResult = await client.info();
      const parsedInfo = parseInfoResponse(infoResult);

      // Run all health checks
      const checks: HealthCheck[] = [
        analyzeMemory(parsedInfo),
        analyzePersistence(parsedInfo),
        analyzePerformance(parsedInfo),
        analyzeConnections(parsedInfo),
        analyzeReplication(parsedInfo),
        await analyzeSecurity(client),
        await analyzeKeyspace(parsedInfo),
      ];

      res.json({
        success: true,
        data: {
          checks,
          timestamp: Date.now(),
        },
      });
    } catch (error) {
      console.error('[Diagnostics] Analysis error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze Redis health',
      });
    }
  }
);

export default router;
