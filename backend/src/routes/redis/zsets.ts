/**
 * Sorted Set Data Type Routes
 * 
 * Handles Redis sorted set operations including ZRANGE, ZADD, and ZREM commands.
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

// Get sorted set range schema
const getZSetRangeSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  start: z.number().int(),
  stop: z.number().int(),
  db: z.number().int().min(0).max(15).default(0),
});

// Add member to sorted set schema
const addZSetMemberSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  score: z.number(),
  member: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

// Remove member from sorted set schema
const removeZSetMemberSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  member: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/zset/range
 * 
 * Get a range of members from a Redis sorted set with scores.
 * 
 */
router.post(
  '/range',
  authenticate,
  validate(getZSetRangeSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, start, stop, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ZRANGE WITHSCORES command
      const result = await client.zrange(key, start, stop, 'WITHSCORES');

      // Convert flat array to {member, score} objects
      const members = [];
      for (let i = 0; i < result.length; i += 2) {
        members.push({
          member: result[i],
          score: parseFloat(result[i + 1]),
        });
      }

      res.json({
        success: true,
        data: members,
      });
    } catch (error) {
      console.error('[ZSet] Range error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get sorted set range',
      });
    }
  }
);

/**
 * POST /api/zset/add
 * 
 * Add a member to a Redis sorted set with a score.
 * 
 */
router.post(
  '/add',
  authenticate,
  validate(addZSetMemberSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, score, member, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ZADD command
      const result = await client.zadd(key, score, member);

      res.json({
        success: true,
        data: { added: result },
      });
    } catch (error) {
      console.error('[ZSet] Add member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add sorted set member',
      });
    }
  }
);

/**
 * POST /api/zset/remove
 * 
 * Remove a member from a Redis sorted set.
 * 
 */
router.post(
  '/remove',
  authenticate,
  validate(removeZSetMemberSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, member, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ZREM command
      const result = await client.zrem(key, member);

      res.json({
        success: true,
        data: { removed: result },
      });
    } catch (error) {
      console.error('[ZSet] Remove member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove sorted set member',
      });
    }
  }
);

/**
 * POST /api/redis/zsets/add
 * 
 * Add a member to a Redis sorted set with a score.
 * Logs the action to audit_log.
 * 
 */

// Add member to sorted set schema (for new spec endpoint)
const addZSetMemberSpecSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  member: z.string(),
  score: z.number(),
  db: z.number().int().min(0).max(15).default(0),
});

router.post(
  '/add',
  authenticate,
  validate(addZSetMemberSpecSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, member, score, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ZADD command
      const result = await client.zadd(key, score, member);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'ZADD', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, member, score }),
        Date.now()
      );

      res.json({
        success: true,
        data: { added: result },
      });
    } catch (error) {
      console.error('[ZSet] Add member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add sorted set member',
      });
    }
  }
);

/**
 * DELETE /api/redis/zsets/member
 * 
 * Remove a member from a Redis sorted set.
 * Logs the action to audit_log.
 * 
 */

// Remove member from sorted set schema (for new spec endpoint)
const deleteZSetMemberSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  member: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

router.delete(
  '/member',
  authenticate,
  validate(deleteZSetMemberSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, member, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ZREM command
      const result = await client.zrem(key, member);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'ZREM', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, member }),
        Date.now()
      );

      res.json({
        success: true,
        data: { removed: result },
      });
    } catch (error) {
      console.error('[ZSet] Remove member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove sorted set member',
      });
    }
  }
);

export default router;
