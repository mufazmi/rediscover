/**
 * Set Data Type Routes
 * 
 * Handles Redis set operations including SMEMBERS, SADD, and SREM commands.
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

// Get set members schema
const getSetMembersSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Add members to set schema
const addSetMembersSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  members: z.array(z.string()).min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Remove member from set schema
const removeSetMemberSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  member: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/set/members
 * 
 * Get all members of a Redis set.
 * 
 */
router.post(
  '/members',
  authenticate,
  validate(getSetMembersSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SMEMBERS command
      const result = await client.smembers(key);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Set] Get members error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get set members',
      });
    }
  }
);

/**
 * POST /api/set/add
 * 
 * Add members to a Redis set.
 * 
 */
router.post(
  '/add',
  authenticate,
  validate(addSetMembersSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, members, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SADD command with members array
      const result = await client.sadd(key, ...members);

      res.json({
        success: true,
        data: { added: result },
      });
    } catch (error) {
      console.error('[Set] Add members error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add set members',
      });
    }
  }
);

/**
 * POST /api/set/remove
 * 
 * Remove a member from a Redis set.
 * 
 */
router.post(
  '/remove',
  authenticate,
  validate(removeSetMemberSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, member, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SREM command
      const result = await client.srem(key, member);

      res.json({
        success: true,
        data: { removed: result },
      });
    } catch (error) {
      console.error('[Set] Remove member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove set member',
      });
    }
  }
);

/**
 * POST /api/redis/sets/add
 * 
 * Add a member to a Redis set.
 * Logs the action to audit_log.
 * 
 */

// Add member to set schema (for new spec endpoint)
const addSetMemberSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  member: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

router.post(
  '/add',
  authenticate,
  validate(addSetMemberSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, member, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SADD command
      const result = await client.sadd(key, member);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'SADD', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, member }),
        Date.now()
      );

      res.json({
        success: true,
        data: { added: result },
      });
    } catch (error) {
      console.error('[Set] Add member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add set member',
      });
    }
  }
);

/**
 * DELETE /api/redis/sets/member
 * 
 * Remove a member from a Redis set.
 * Logs the action to audit_log.
 * 
 */

// Remove member from set schema (for new spec endpoint)
const deleteSetMemberSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  member: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

router.delete(
  '/member',
  authenticate,
  validate(deleteSetMemberSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, member, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SREM command
      const result = await client.srem(key, member);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'SREM', ?, ?, ?)
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
      console.error('[Set] Remove member error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove set member',
      });
    }
  }
);

export default router;
