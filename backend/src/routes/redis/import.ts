/**
 * Import Route
 * 
 * Handles Redis data import functionality.
 * Imports keys with their type, TTL, and value.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schema
 */
const importSchema = z.object({
  connectionId: z.number().int().positive(),
  data: z.array(
    z.object({
      key: z.string().min(1),
      type: z.string(),
      ttl: z.number().int(),
      value: z.any(),
    })
  ),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/import
 * 
 * Import Redis data from an array of key objects.
 * Sets keys with appropriate commands based on type and preserves TTL.
 * 
 */
router.post(
  '/',
  authenticate,
  validate(importSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, data, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      let imported = 0;
      let failed = 0;

      // Import each key
      for (const item of data) {
        try {
          const { key, type, ttl, value } = item;

          // Set value based on type
          switch (type) {
            case 'string':
              await client.set(key, value);
              break;

            case 'hash':
              // HSET accepts flat array: field1, value1, field2, value2, ...
              if (typeof value === 'object' && value !== null) {
                const flatArgs: string[] = [];
                for (const [field, val] of Object.entries(value)) {
                  flatArgs.push(field, String(val));
                }
                if (flatArgs.length > 0) {
                  await client.hset(key, ...flatArgs);
                }
              }
              break;

            case 'list':
              // RPUSH accepts multiple values
              if (Array.isArray(value) && value.length > 0) {
                await client.rpush(key, ...value);
              }
              break;

            case 'set':
              // SADD accepts multiple members
              if (Array.isArray(value) && value.length > 0) {
                await client.sadd(key, ...value);
              }
              break;

            case 'zset':
              // ZADD accepts score1, member1, score2, member2, ...
              if (Array.isArray(value) && value.length > 0) {
                const flatArgs: (string | number)[] = [];
                for (const item of value) {
                  if (typeof item === 'object' && 'member' in item && 'score' in item) {
                    flatArgs.push(item.score, item.member);
                  }
                }
                if (flatArgs.length > 0) {
                  await client.zadd(key, ...flatArgs);
                }
              }
              break;

            case 'stream':
              // XADD for each entry
              if (Array.isArray(value) && value.length > 0) {
                for (const entry of value) {
                  // entry format from XRANGE: [id, [field1, value1, field2, value2, ...]]
                  if (Array.isArray(entry) && entry.length === 2) {
                    const [id, fields] = entry;
                    if (Array.isArray(fields) && fields.length > 0) {
                      // Use * to auto-generate ID, or use the original ID
                      await client.xadd(key, id === '*' ? '*' : id, ...fields);
                    }
                  }
                }
              }
              break;

            default:
              console.warn(`[Import] Unknown key type "${type}" for key "${key}"`);
              failed++;
              continue;
          }

          // Set TTL if greater than 0
          if (ttl > 0) {
            await client.expire(key, ttl);
          }

          imported++;
        } catch (error) {
          // Log error but continue with other keys
          console.error(`[Import] Error importing key "${item.key}":`, error);
          failed++;
        }
      }

      res.json({
        success: true,
        data: {
          imported,
          failed,
        },
      });
    } catch (error) {
      console.error('[Import] Import error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to import data',
      });
    }
  }
);

export default router;
