/**
 * Memory Routes
 * 
 * Handles Redis memory analysis operations including stats, diagnostics, and top keys by memory usage.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// Memory stats schema
const memoryStatsSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

// Memory doctor schema
const memoryDoctorSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

// Memory top keys schema
const memoryTopKeysSchema = z.object({
  connectionId: z.number().int().positive(),
  count: z.number().int().positive().default(10),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/memory/stats
 * 
 * Get memory statistics using MEMORY STATS command.
 * 
 */
router.post(
  '/stats',
  authenticate,
  validate(memoryStatsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute MEMORY STATS command
      const memoryStats = await client.call('MEMORY', 'STATS');

      res.json({
        success: true,
        data: memoryStats,
      });
    } catch (error) {
      console.error('[Memory] Stats error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get memory stats',
      });
    }
  }
);

/**
 * POST /api/memory/doctor
 * 
 * Get memory diagnostics using MEMORY DOCTOR command.
 * 
 */
router.post(
  '/doctor',
  authenticate,
  validate(memoryDoctorSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute MEMORY DOCTOR command
      const doctorReport = await client.call('MEMORY', 'DOCTOR') as string;

      res.json({
        success: true,
        data: doctorReport,
      });
    } catch (error) {
      console.error('[Memory] Doctor error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get memory diagnostics',
      });
    }
  }
);

/**
 * POST /api/memory/top-keys
 * 
 * Get top keys by memory usage.
 * Samples random keys and measures memory usage for each.
 * 
 */
router.post(
  '/top-keys',
  authenticate,
  validate(memoryTopKeysSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, count, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Sample random keys (sample more than needed to get better results)
      const sampleSize = count * 10;
      const sampledKeys: string[] = [];
      
      for (let i = 0; i < sampleSize; i++) {
        try {
          const randomKey = await client.randomkey();
          if (randomKey) {
            sampledKeys.push(randomKey);
          }
        } catch (error) {
          // No more keys or error sampling
          break;
        }
      }

      // Get memory usage for each sampled key
      const keyMemoryUsage: Array<{ key: string; memory: number }> = [];
      
      for (const key of sampledKeys) {
        try {
          const memory = await client.call('MEMORY', 'USAGE', key) as number;
          if (memory !== null) {
            keyMemoryUsage.push({ key, memory });
          }
        } catch (error) {
          // Skip keys that fail
          continue;
        }
      }

      // Sort by memory usage (descending) and take top N
      const topKeys = keyMemoryUsage
        .sort((a, b) => b.memory - a.memory)
        .slice(0, count);

      res.json({
        success: true,
        data: topKeys,
      });
    } catch (error) {
      console.error('[Memory] Top keys error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get top keys by memory',
      });
    }
  }
);

export default router;
