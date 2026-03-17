/**
 * List Data Type Routes
 * 
 * Handles Redis list operations including LRANGE, LPUSH, RPUSH, LSET, and LREM commands.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// Get list range schema
const getListRangeSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  start: z.number().int(),
  stop: z.number().int(),
  db: z.number().int().min(0).max(15).default(0),
});

// Push to list schema
const pushToListSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  value: z.string(),
  direction: z.enum(['left', 'right']),
  db: z.number().int().min(0).max(15).default(0),
});

// Set list element schema
const setListElementSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  index: z.number().int(),
  value: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

// Remove list elements schema
const removeListElementsSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  count: z.number().int(),
  value: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

// Delete list item by index schema
const deleteListItemSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  index: z.number().int(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/list/range
 * 
 * Get a range of elements from a Redis list.
 * 
 */
router.post(
  '/range',
  authenticate,
  validate(getListRangeSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, start, stop, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute LRANGE command
      const result = await client.lrange(key, start, stop);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[List] Range error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get list range',
      });
    }
  }
);

/**
 * POST /api/redis/lists/push
 * 
 * Push a value to a Redis list (left or right).
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/push',
  authenticate,
  validate(pushToListSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, value, direction, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute LPUSH or RPUSH based on direction
      let result: number;
      if (direction === 'left') {
        result = await client.lpush(key, value);
      } else {
        result = await client.rpush(key, value);
      }

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        connectionId,
        direction === 'left' ? 'LPUSH' : 'RPUSH',
        key,
        JSON.stringify({ db: dbNumber, value, direction }),
        Date.now()
      );

      res.json({
        success: true,
        data: { length: result },
      });
    } catch (error) {
      console.error('[List] Push error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to push to list',
      });
    }
  }
);

/**
 * PUT /api/redis/lists/set
 * 
 * Set the value of an element in a Redis list by index.
 * Logs the action to audit_log.
 * 
 */
router.put(
  '/set',
  authenticate,
  validate(setListElementSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, index, value, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute LSET command
      await client.lset(key, index, value);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'LSET', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, index, value }),
        Date.now()
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[List] Set error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set list element',
      });
    }
  }
);

/**
 * DELETE /api/redis/lists/item
 * 
 * Delete an element from a Redis list by index.
 * Uses tombstone approach: LSET with unique UUID, then LREM to remove.
 * Logs the action to audit_log.
 * 
 */
router.delete(
  '/item',
  authenticate,
  validate(deleteListItemSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, index, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Generate unique tombstone value (UUID)
      const tombstone = `__TOMBSTONE__${uuidv4()}__`;

      // Execute LSET with tombstone
      await client.lset(key, index, tombstone);

      // Execute LREM to remove the tombstone
      await client.lrem(key, 1, tombstone);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'LREM', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, index }),
        Date.now()
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[List] Delete item error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete list item',
      });
    }
  }
);

/**
 * POST /api/list/remove
 * 
 * Remove elements from a Redis list.
 * 
 */
router.post(
  '/remove',
  authenticate,
  validate(removeListElementsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, count, value, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute LREM command
      const result = await client.lrem(key, count, value);

      res.json({
        success: true,
        data: { removed: result },
      });
    } catch (error) {
      console.error('[List] Remove error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove list elements',
      });
    }
  }
);

export default router;
