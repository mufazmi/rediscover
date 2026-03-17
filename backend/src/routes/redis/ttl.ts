/**
 * TTL Manager Routes
 * 
 * Handles Redis key TTL (Time To Live) management including distribution analysis,
 * expiring keys monitoring, and bulk TTL operations.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * TTL distribution buckets
 */
interface TTLDistribution {
  noTTL: number;              // TTL = -1
  lessThan1Min: number;       // 0 < TTL <= 60
  oneToSixtyMin: number;      // 60 < TTL <= 3600
  oneToTwentyFourHours: number; // 3600 < TTL <= 86400
  moreThanTwentyFourHours: number; // TTL > 86400
}

/**
 * Expiring key information
 */
interface ExpiringKey {
  key: string;
  type: string;
  ttl: number; // seconds
  db: number;
}

/**
 * Validation schemas
 */
const ttlDistributionSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

const expiringSoonSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

const bulkApplySchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
  pattern: z.string().min(1),
  ttl: z.number().int().positive(),
});

const bulkRemoveSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
  pattern: z.string().min(1),
});

/**
 * GET /api/redis/ttl/distribution
 * 
 * Returns TTL distribution across five buckets by scanning all keys
 * and categorizing them based on their TTL values.
 * 
 */
router.get(
  '/distribution',
  authenticate,
  validate(ttlDistributionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.query as any;
      const connId = parseInt(connectionId, 10);
      const dbNum = parseInt(dbNumber, 10);

      // Get Redis client
      const client = await RedisService.getClient(connId);

      // Select database
      if (dbNum !== 0) {
        await client.select(dbNum);
      }

      // Initialize distribution buckets
      const distribution: TTLDistribution = {
        noTTL: 0,
        lessThan1Min: 0,
        oneToSixtyMin: 0,
        oneToTwentyFourHours: 0,
        moreThanTwentyFourHours: 0,
      };

      // Use SCAN to iterate through all keys
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'COUNT', 100);
        const [nextCursor, keys] = result;
        cursor = nextCursor;

        // Get TTL for each key
        for (const key of keys) {
          try {
            const ttl = await client.ttl(key);

            // Categorize based on TTL value
            if (ttl === -1) {
              // No TTL set
              distribution.noTTL++;
            } else if (ttl >= 0 && ttl <= 60) {
              // Less than 1 minute
              distribution.lessThan1Min++;
            } else if (ttl > 60 && ttl <= 3600) {
              // 1 to 60 minutes
              distribution.oneToSixtyMin++;
            } else if (ttl > 3600 && ttl <= 86400) {
              // 1 to 24 hours
              distribution.oneToTwentyFourHours++;
            } else if (ttl > 86400) {
              // More than 24 hours
              distribution.moreThanTwentyFourHours++;
            }
          } catch (error) {
            // Key might have been deleted, continue
            console.warn(`[TTL] Failed to get TTL for key ${key}:`, error);
          }
        }
      } while (cursor !== '0');

      res.json({
        success: true,
        data: distribution,
      });
    } catch (error) {
      console.error('[TTL] Distribution error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get TTL distribution',
      });
    }
  }
);

/**
 * GET /api/redis/ttl/expiring-soon
 * 
 * Returns keys with TTL less than 60 seconds including key name, type, TTL, and database.
 * 
 */
router.get(
  '/expiring-soon',
  authenticate,
  validate(expiringSoonSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.query as any;
      const connId = parseInt(connectionId, 10);
      const dbNum = parseInt(dbNumber, 10);

      // Get Redis client
      const client = await RedisService.getClient(connId);

      // Select database
      if (dbNum !== 0) {
        await client.select(dbNum);
      }

      const expiringKeys: ExpiringKey[] = [];

      // Use SCAN to iterate through all keys
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'COUNT', 100);
        const [nextCursor, keys] = result;
        cursor = nextCursor;

        // Check TTL for each key
        for (const key of keys) {
          try {
            const ttl = await client.ttl(key);

            // Only include keys with TTL < 60 seconds
            if (ttl >= 0 && ttl < 60) {
              const type = await client.type(key);
              
              expiringKeys.push({
                key,
                type,
                ttl,
                db: dbNum,
              });
            }
          } catch (error) {
            // Key might have been deleted, continue
            console.warn(`[TTL] Failed to get TTL for key ${key}:`, error);
          }
        }
      } while (cursor !== '0');

      res.json({
        success: true,
        data: {
          keys: expiringKeys,
        },
      });
    } catch (error) {
      console.error('[TTL] Expiring soon error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get expiring keys',
      });
    }
  }
);

/**
 * POST /api/redis/ttl/bulk-apply
 * 
 * Applies TTL to all keys matching the specified pattern.
 * Uses SCAN with MATCH pattern and executes EXPIRE for each matching key.
 * Logs the operation to audit_log.
 * 
 */
router.post(
  '/bulk-apply',
  authenticate,
  requireRole('admin'),
  validate(bulkApplySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber, pattern, ttl } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      let affectedCount = 0;

      // Use SCAN with MATCH pattern to find matching keys
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        const [nextCursor, keys] = result;
        cursor = nextCursor;

        // Apply EXPIRE to each matching key
        for (const key of keys) {
          try {
            await client.expire(key, ttl);
            affectedCount++;
          } catch (error) {
            // Key might have been deleted, continue
            console.warn(`[TTL] Failed to set TTL for key ${key}:`, error);
          }
        }
      } while (cursor !== '0');

      // Log bulk operation to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'TTL_BULK_APPLY', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ pattern, ttl, affectedCount }),
        new Date().toISOString()
      );

      res.json({
        success: true,
        data: {
          affected: affectedCount,
        },
      });
    } catch (error) {
      console.error('[TTL] Bulk apply error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply TTL to keys',
      });
    }
  }
);

/**
 * POST /api/redis/ttl/bulk-remove
 * 
 * Removes TTL from all keys matching the specified pattern.
 * Uses SCAN with MATCH pattern and executes PERSIST for each matching key.
 * Logs the operation to audit_log.
 * 
 */
router.post(
  '/bulk-remove',
  authenticate,
  requireRole('admin'),
  validate(bulkRemoveSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber, pattern } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      let affectedCount = 0;

      // Use SCAN with MATCH pattern to find matching keys
      let cursor = '0';
      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        const [nextCursor, keys] = result;
        cursor = nextCursor;

        // Execute PERSIST on each matching key
        for (const key of keys) {
          try {
            const result = await client.persist(key);
            // PERSIST returns 1 if TTL was removed, 0 if key had no TTL
            if (result === 1) {
              affectedCount++;
            }
          } catch (error) {
            // Key might have been deleted, continue
            console.warn(`[TTL] Failed to remove TTL for key ${key}:`, error);
          }
        }
      } while (cursor !== '0');

      // Log bulk operation to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'TTL_BULK_REMOVE', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ pattern, affectedCount }),
        new Date().toISOString()
      );

      res.json({
        success: true,
        data: {
          affected: affectedCount,
        },
      });
    } catch (error) {
      console.error('[TTL] Bulk remove error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove TTL from keys',
      });
    }
  }
);

export default router;
