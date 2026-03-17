/**
 * Key Management Routes
 * 
 * Handles Redis key operations including scanning, inspection, deletion, renaming, and TTL management.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { ScanService } from '../../services/scan.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// Scan keys schema
const scanKeysSchema = z.object({
  connectionId: z.number().int().positive(),
  pattern: z.string().default('*'),
  cursor: z.string().default('0'),
  count: z.number().int().positive().default(100),
  db: z.number().int().min(0).max(15).default(0),
});

// Key info schema
const keyInfoSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Delete key schema
const deleteKeySchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Rename key schema
const renameKeySchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  newKey: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Set TTL schema
const setTTLSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  ttl: z.number().int(),
  db: z.number().int().min(0).max(15).default(0),
});

// Expire key schema (for POST /api/redis/keys/expire)
const expireKeySchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
  key: z.string().min(1),
  ttl: z.number().int().positive(),
});

// Persist key schema (for POST /api/redis/keys/persist)
const persistKeySchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
  key: z.string().min(1),
});

// Delete key by param schema (for DELETE /api/redis/keys/:key)
const deleteKeyParamSchema = z.object({
  connectionId: z.string().transform(Number),
  db: z.string().transform(Number).pipe(z.number().int().min(0).max(15)),
});

/**
 * POST /api/keys/scan
 * 
 * Scan keys with pattern matching using cursor-based iteration.
 * Returns enriched key data including type and TTL for each key.
 * 
 */
router.post(
  '/scan',
  authenticate,
  validate(scanKeysSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, pattern, cursor, count, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Scan keys using ScanService
      const result = await ScanService.scanKeys(client, pattern, count, cursor);

      // Enrich keys with type and TTL information
      const enrichedKeys = await Promise.all(
        result.keys.map(async (key) => {
          try {
            const [type, ttl] = await Promise.all([
              client.type(key),
              client.ttl(key),
            ]);
            return { key, type, ttl };
          } catch (error) {
            // If we can't get metadata for a key, return it with unknown type and no TTL
            console.error(`[Keys] Failed to get metadata for key ${key}:`, error);
            return { key, type: 'unknown', ttl: -1 };
          }
        })
      );

      res.json({
        success: true,
        data: {
          cursor: result.cursor,
          keys: enrichedKeys,
        },
      });
    } catch (error) {
      console.error('[Keys] Scan error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scan keys',
      });
    }
  }
);

/**
 * POST /api/keys/info
 * 
 * Get detailed information about a key including type, TTL, memory usage, and encoding.
 * 
 */
router.post(
  '/info',
  authenticate,
  validate(keyInfoSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute commands to get key information
      const [type, ttl, memory, encoding] = await Promise.all([
        client.type(key),
        client.ttl(key),
        client.call('MEMORY', 'USAGE', key).catch(() => null), // MEMORY USAGE may not be available
        client.call('OBJECT', 'ENCODING', key).catch(() => null), // OBJECT ENCODING may fail for some keys
      ]);

      res.json({
        success: true,
        data: {
          type,
          ttl,
          memory: memory !== null ? Number(memory) : undefined,
          encoding: encoding !== null ? String(encoding) : undefined,
        },
      });
    } catch (error) {
      console.error('[Keys] Info error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get key info',
      });
    }
  }
);

/**
 * POST /api/keys/delete
 * 
 * Delete a key from Redis and log the action to audit log.
 * 
 */
router.post(
  '/delete',
  authenticate,
  validate(deleteKeySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Delete the key
      const result = await client.del(key);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'DELETE', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, deleted: result }),
        Date.now()
      );

      res.json({
        success: true,
        data: { deleted: result },
      });
    } catch (error) {
      console.error('[Keys] Delete error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete key',
      });
    }
  }
);

/**
 * POST /api/keys/rename
 * 
 * Rename a key in Redis and log the action to audit log.
 * 
 */
router.post(
  '/rename',
  authenticate,
  validate(renameKeySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, newKey, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Rename the key
      await client.rename(key, newKey);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'RENAME', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, oldKey: key, newKey }),
        Date.now()
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Keys] Rename error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rename key',
      });
    }
  }
);

/**
 * POST /api/keys/ttl
 * 
 * Set or remove TTL (time-to-live) for a key.
 * Use ttl=-1 to remove expiration (PERSIST), or ttl>0 to set expiration in seconds.
 * 
 */
router.post(
  '/ttl',
  authenticate,
  validate(setTTLSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, ttl, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Set or remove TTL
      if (ttl === -1) {
        // Remove expiration using PERSIST
        await client.persist(key);
      } else if (ttl > 0) {
        // Set expiration using EXPIRE
        await client.expire(key, ttl);
      } else {
        res.status(400).json({
          success: false,
          error: 'TTL must be -1 (to remove expiration) or a positive number (seconds)',
        });
        return;
      }

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Keys] Set TTL error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set TTL',
      });
    }
  }
);

/**
 * POST /api/redis/keys/expire
 * 
 * Set TTL (time-to-live) for a key using EXPIRE command.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/expire',
  authenticate,
  validate(expireKeySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber, key, ttl } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute EXPIRE command
      const result = await client.expire(key, ttl);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'EXPIRE', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, ttl }),
        Date.now()
      );

      res.json({
        success: true,
        data: { result },
      });
    } catch (error) {
      console.error('[Keys] Expire error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set key expiration',
      });
    }
  }
);

/**
 * POST /api/redis/keys/persist
 * 
 * Remove TTL from a key using PERSIST command.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/persist',
  authenticate,
  validate(persistKeySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber, key } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute PERSIST command
      const result = await client.persist(key);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'PERSIST', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber }),
        Date.now()
      );

      res.json({
        success: true,
        data: { result },
      });
    } catch (error) {
      console.error('[Keys] Persist error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove key expiration',
      });
    }
  }
);

/**
 * DELETE /api/redis/keys/:key
 * 
 * Delete a key from Redis using DEL command.
 * Logs the action to audit_log.
 * 
 */
router.delete(
  '/:key',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { key } = req.params;
      
      // Validate query parameters
      const validation = deleteKeyParamSchema.safeParse(req.query);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
        });
        return;
      }

      const { connectionId, db: dbNumber } = validation.data;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute DEL command
      const result = await client.del(key);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'DELETE', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, deleted: result }),
        Date.now()
      );

      res.json({
        success: true,
        data: { deleted: result },
      });
    } catch (error) {
      console.error('[Keys] Delete error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete key',
      });
    }
  }
);

export default router;
