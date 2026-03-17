/**
 * Slowlog Routes
 * 
 * Handles Redis slowlog operations including getting entries, resetting log, and configuration.
 * 
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

// Slowlog get schema
const slowlogGetSchema = z.object({
  connectionId: z.number().int().positive(),
  count: z.number().int().positive().default(10),
  db: z.number().int().min(0).max(15).default(0),
});

// Slowlog reset schema
const slowlogResetSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

// Slowlog config schema
const slowlogConfigSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/slowlog/get
 * 
 * Get slow log entries using SLOWLOG GET command.
 * 
 */
router.post(
  '/get',
  authenticate,
  validate(slowlogGetSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, count, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SLOWLOG GET command
      const slowlogEntries = await client.slowlog('GET', count);

      res.json({
        success: true,
        data: slowlogEntries,
      });
    } catch (error) {
      console.error('[Slowlog] Get error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get slowlog entries',
      });
    }
  }
);

/**
 * POST /api/slowlog/reset
 * 
 * Reset slow log using SLOWLOG RESET command.
 * Requires admin role.
 * 
 */
router.post(
  '/reset',
  authenticate,
  requireRole('admin'),
  validate(slowlogResetSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SLOWLOG RESET command
      await client.slowlog('RESET');

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Slowlog] Reset error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset slowlog',
      });
    }
  }
);

/**
 * POST /api/slowlog/config
 * 
 * Get slowlog configuration using CONFIG GET slowlog-* commands.
 * 
 */
router.post(
  '/config',
  authenticate,
  validate(slowlogConfigSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute CONFIG GET slowlog-* command
      const configResult = await client.config('GET', 'slowlog-*') as string[];

      // Convert array result to object
      // Redis returns: [key1, value1, key2, value2, ...]
      const configObject: Record<string, string> = {};
      for (let i = 0; i < configResult.length; i += 2) {
        configObject[configResult[i]] = configResult[i + 1];
      }

      res.json({
        success: true,
        data: configObject,
      });
    } catch (error) {
      console.error('[Slowlog] Config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get slowlog config',
      });
    }
  }
);

export default router;
