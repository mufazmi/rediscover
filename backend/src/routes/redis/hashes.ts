/**
 * Hash Data Type Routes
 * 
 * Handles Redis hash operations including HSET, HDEL, and field rename operations.
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

// Set hash field schema
const setHashFieldSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  field: z.string().min(1),
  value: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

// Delete hash field schema
const deleteHashFieldSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  field: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Rename hash field schema
const renameHashFieldSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  oldField: z.string().min(1),
  newField: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/redis/hashes/set
 * 
 * Set a field in a Redis hash.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/set',
  authenticate,
  validate(setHashFieldSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, field, value, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute HSET command
      const result = await client.hset(key, field, value);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'HSET', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, field, value }),
        Date.now()
      );

      res.json({
        success: true,
        data: { created: result === 1 },
      });
    } catch (error) {
      console.error('[Hash] Set error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set hash field',
      });
    }
  }
);

/**
 * DELETE /api/redis/hashes/field
 * 
 * Delete a field from a Redis hash.
 * Logs the action to audit_log.
 * 
 */
router.delete(
  '/field',
  authenticate,
  validate(deleteHashFieldSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, field, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute HDEL command
      const result = await client.hdel(key, field);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'HDEL', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, field }),
        Date.now()
      );

      res.json({
        success: true,
        data: { deleted: result },
      });
    } catch (error) {
      console.error('[Hash] Delete error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete hash field',
      });
    }
  }
);

/**
 * POST /api/redis/hashes/rename-field
 * 
 * Rename a field in a Redis hash.
 * Executes HGET to get value, HSET with newField, HDEL with oldField.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/rename-field',
  authenticate,
  validate(renameHashFieldSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, oldField, newField, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute HGET to get the value
      const value = await client.hget(key, oldField);

      // If field doesn't exist, return error
      if (value === null) {
        res.status(400).json({
          success: false,
          error: `Field '${oldField}' does not exist in hash '${key}'`,
        });
        return;
      }

      // Execute HSET with new field name
      await client.hset(key, newField, value);

      // Execute HDEL with old field name
      await client.hdel(key, oldField);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'HRENAME', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, oldField, newField }),
        Date.now()
      );

      res.json({
        success: true,
        data: { renamed: true },
      });
    } catch (error) {
      console.error('[Hash] Rename field error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rename hash field',
      });
    }
  }
);

export default router;
