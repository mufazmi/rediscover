/**
 * ACL Routes
 * 
 * Handles Redis ACL (Access Control List) operations including listing users, 
 * creating/updating users, deleting users, and resetting ACL log.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// ACL list schema
const aclListSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

// ACL setuser schema
const aclSetUserSchema = z.object({
  connectionId: z.number().int().positive(),
  username: z.string().min(1),
  rules: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// ACL deluser schema
const aclDelUserSchema = z.object({
  connectionId: z.number().int().positive(),
  username: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// ACL resetlog schema
const aclResetLogSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/acl/list
 * 
 * List ACL users using ACL LIST command.
 */
router.post(
  '/list',
  authenticate,
  validate(aclListSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ACL LIST command
      const aclUsers = await client.call('ACL', 'LIST') as string[];

      res.json({
        success: true,
        data: aclUsers,
      });
    } catch (error) {
      console.error('[ACL] List error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list ACL users',
      });
    }
  }
);

/**
 * POST /api/acl/setuser
 * 
 * Create or update ACL user using ACL SETUSER command.
 * Requires admin role.
 */
router.post(
  '/setuser',
  authenticate,
  requireRole('admin'),
  validate(aclSetUserSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, username, rules, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Parse rules string into array (space-separated)
      const rulesArray = rules.trim().split(/\s+/);

      // Execute ACL SETUSER command
      await client.call('ACL', 'SETUSER', username, ...rulesArray);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[ACL] Set user error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set ACL user',
      });
    }
  }
);

/**
 * POST /api/acl/deluser
 * 
 * Delete ACL user using ACL DELUSER command.
 * Requires admin role.
 */
router.post(
  '/deluser',
  authenticate,
  requireRole('admin'),
  validate(aclDelUserSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, username, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ACL DELUSER command
      await client.call('ACL', 'DELUSER', username);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[ACL] Delete user error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete ACL user',
      });
    }
  }
);

/**
 * POST /api/acl/resetlog
 * 
 * Reset ACL log using ACL LOG RESET command.
 * Requires admin role.
 */
router.post(
  '/resetlog',
  authenticate,
  requireRole('admin'),
  validate(aclResetLogSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute ACL LOG RESET command
      await client.call('ACL', 'LOG', 'RESET');

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[ACL] Reset log error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset ACL log',
      });
    }
  }
);

export default router;
