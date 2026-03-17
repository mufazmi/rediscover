/**
 * Export Route
 * 
 * Handles Redis data export functionality.
 * Exports all keys matching a pattern with their type, TTL, and value.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { ScanService } from '../../services/scan.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Validation schema
 */
const exportSchema = z.object({
  connectionId: z.number().int().positive(),
  pattern: z.string().default('*'),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * Export data structure
 */
interface ExportedKey {
  key: string;
  type: string;
  ttl: number;
  value: any;
}

/**
 * POST /api/export
 * 
 * Export Redis data matching a pattern.
 * Retrieves all keys with their type, TTL, and value.
 */
router.post(
  '/',
  authenticate,
  validate(exportSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, pattern, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Scan all keys matching pattern
      const keys = await ScanService.scanAllKeys(client, pattern);

      // Export data for each key
      const exportedData: ExportedKey[] = [];

      for (const key of keys) {
        try {
          // Get key type
          const type = await client.type(key);

          // Get TTL (-1 = no expiration, -2 = key doesn't exist)
          const ttl = await client.ttl(key);

          // Skip if key was deleted between scan and now
          if (ttl === -2) {
            continue;
          }

          // Get value based on type
          let value: any;

          switch (type) {
            case 'string':
              value = await client.get(key);
              break;

            case 'hash':
              value = await client.hgetall(key);
              break;

            case 'list':
              value = await client.lrange(key, 0, -1);
              break;

            case 'set':
              value = await client.smembers(key);
              break;

            case 'zset':
              // Get sorted set with scores
              const zsetData = await client.zrange(key, 0, -1, 'WITHSCORES');
              // Convert flat array [member1, score1, member2, score2, ...] to [{member, score}, ...]
              value = [];
              for (let i = 0; i < zsetData.length; i += 2) {
                value.push({
                  member: zsetData[i],
                  score: parseFloat(zsetData[i + 1]),
                });
              }
              break;

            case 'stream':
              // Get all stream entries
              value = await client.xrange(key, '-', '+');
              break;

            default:
              // Unknown type, skip
              console.warn(`[Export] Unknown key type "${type}" for key "${key}"`);
              continue;
          }

          exportedData.push({
            key,
            type,
            ttl,
            value,
          });
        } catch (error) {
          // Log error but continue with other keys
          console.error(`[Export] Error exporting key "${key}":`, error);
        }
      }

      res.json({
        success: true,
        data: exportedData,
      });
    } catch (error) {
      console.error('[Export] Export error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export data',
      });
    }
  }
);

export default router;
