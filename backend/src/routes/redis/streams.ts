/**
 * Stream Data Type Routes
 * 
 * Handles Redis stream operations including XRANGE, XINFO STREAM, XADD, XDEL, and XTRIM commands.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// Get stream range schema
const getStreamRangeSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  start: z.string().default('-'),
  end: z.string().default('+'),
  count: z.number().int().positive().optional(),
  db: z.number().int().min(0).max(15).default(0),
});

// Get stream info schema
const getStreamInfoSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Add stream entry schema
const addStreamEntrySchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  fields: z.record(z.string(), z.string()),
  db: z.number().int().min(0).max(15).default(0),
});

// Delete stream entry schema
const deleteStreamEntrySchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  entryId: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Trim stream schema
const trimStreamSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  strategy: z.enum(['MAXLEN', 'MINID']),
  value: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/stream/range
 * 
 * Get entries from a Redis stream.
 * 
 */
router.post(
  '/range',
  authenticate,
  validate(getStreamRangeSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, start, end, count, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute XRANGE command with start, end, and optional count
      let result;
      if (count !== undefined) {
        result = await client.xrange(key, start, end, 'COUNT', count);
      } else {
        result = await client.xrange(key, start, end);
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Stream] Range error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stream range',
      });
    }
  }
);

/**
 * POST /api/stream/info
 * 
 * Get information about a Redis stream.
 * 
 */
router.post(
  '/info',
  authenticate,
  validate(getStreamInfoSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute XINFO STREAM command
      const result = await client.xinfo('STREAM', key);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Stream] Info error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stream info',
      });
    }
  }
);

/**
 * POST /api/redis/streams/add
 * 
 * Add an entry to a Redis stream.
 * Uses auto-generated ID (*) and accepts field-value pairs.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/add',
  authenticate,
  validate(addStreamEntrySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, fields, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Convert fields object to flat array for XADD command
      // XADD key * field1 value1 field2 value2 ...
      const fieldValuePairs: string[] = [];
      for (const [field, value] of Object.entries(fields)) {
        fieldValuePairs.push(field, String(value));
      }

      // Execute XADD command with * for auto-generated ID
      const entryId = await client.xadd(key, '*', ...fieldValuePairs);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'XADD', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, fields, entryId }),
        Date.now()
      );

      res.json({
        success: true,
        data: { entryId },
      });
    } catch (error) {
      console.error('[Stream] Add error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add stream entry',
      });
    }
  }
);

/**
 * DELETE /api/redis/streams/entry
 * 
 * Delete an entry from a Redis stream.
 * Logs the action to audit_log.
 * 
 */
router.delete(
  '/entry',
  authenticate,
  validate(deleteStreamEntrySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, entryId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute XDEL command
      const result = await client.xdel(key, entryId);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'XDEL', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, entryId }),
        Date.now()
      );

      res.json({
        success: true,
        data: { deleted: result },
      });
    } catch (error) {
      console.error('[Stream] Delete entry error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete stream entry',
      });
    }
  }
);

/**
 * POST /api/redis/streams/trim
 * 
 * Trim a Redis stream using MAXLEN or MINID strategy.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/trim',
  authenticate,
  validate(trimStreamSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, strategy, value, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute XTRIM command with strategy and value
      const deletedCount = await client.xtrim(key, strategy, value);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'XTRIM', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, strategy, value, deletedCount }),
        Date.now()
      );

      res.json({
        success: true,
        data: { deletedCount },
      });
    } catch (error) {
      console.error('[Stream] Trim error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trim stream',
      });
    }
  }
);

export default router;
