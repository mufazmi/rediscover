/**
 * Database Routes
 * 
 * Handles Redis database operations including getting database information and flushing databases.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// Database info schema
const dbInfoSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

// Database flush schema
const dbFlushSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * Parse Redis INFO keyspace response into database statistics
 * 
 * INFO keyspace response format:
 * # Keyspace
 * db0:keys=100,expires=10,avg_ttl=3600000
 * db1:keys=50,expires=5,avg_ttl=7200000
 */
function parseKeyspaceInfo(infoString: string): Record<string, Record<string, string>> {
  const databases: Record<string, Record<string, string>> = {};
  
  const lines = infoString.split('\r\n');
  
  for (const line of lines) {
    // Skip empty lines and section headers
    if (!line.trim() || line.startsWith('#')) {
      continue;
    }
    
    // Parse database line (e.g., "db0:keys=100,expires=10,avg_ttl=3600000")
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const dbName = line.substring(0, colonIndex).trim();
      const statsString = line.substring(colonIndex + 1).trim();
      
      // Parse stats (comma-separated key=value pairs)
      const stats: Record<string, string> = {};
      const statPairs = statsString.split(',');
      
      for (const pair of statPairs) {
        const equalIndex = pair.indexOf('=');
        if (equalIndex > 0) {
          const key = pair.substring(0, equalIndex).trim();
          const value = pair.substring(equalIndex + 1).trim();
          stats[key] = value;
        }
      }
      
      databases[dbName] = stats;
    }
  }
  
  return databases;
}

/**
 * POST /api/db/info
 * 
 * Get database information using INFO keyspace command.
 */
router.post(
  '/info',
  authenticate,
  validate(dbInfoSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute INFO keyspace command
      const keyspaceInfo = await client.info('keyspace');

      // Parse database statistics
      const databases = parseKeyspaceInfo(keyspaceInfo);

      res.json({
        success: true,
        data: databases,
      });
    } catch (error) {
      console.error('[Database] Info error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get database info',
      });
    }
  }
);

/**
 * POST /api/db/flush
 * 
 * Flush database using FLUSHDB command.
 * Requires admin role and logs action to audit log.
 */
router.post(
  '/flush',
  authenticate,
  requireRole('admin'),
  validate(dbFlushSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute FLUSHDB command
      await client.flushdb();

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'FLUSHDB', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ db: dbNumber }),
        Date.now()
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Database] Flush error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to flush database',
      });
    }
  }
);

export default router;
