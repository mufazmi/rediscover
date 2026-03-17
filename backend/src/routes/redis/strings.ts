/**
 * String Data Type Routes
 * 
 * Handles Redis string operations including GET, SET, APPEND, INCR, and DECR commands.
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

// Get string schema
const getStringSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Set string schema
const setStringSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  value: z.string(),
  ttl: z.number().int().positive().optional(),
  db: z.number().int().min(0).max(15).default(0),
});

// Append string schema
const appendStringSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  value: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

// Increment/Decrement string schema
const incrDecrStringSchema = z.object({
  connectionId: z.number().int().positive(),
  key: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * POST /api/string/get
 * 
 * Get the value of a Redis string key.
 * 
 */
router.post(
  '/get',
  authenticate,
  validate(getStringSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute GET command
      const value = await client.get(key);

      res.json({
        success: true,
        data: value,
      });
    } catch (error) {
      console.error('[String] Get error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get string value',
      });
    }
  }
);

/**
 * POST /api/string/set
 * 
 * Set the value of a Redis string key with optional TTL.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/set',
  authenticate,
  validate(setStringSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, value, ttl, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute SET command with optional EX (expiration in seconds)
      if (ttl !== undefined) {
        await client.set(key, value, 'EX', ttl);
      } else {
        await client.set(key, value);
      }

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'SET', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, ttl: ttl || null }),
        Date.now()
      );

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[String] Set error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set string value',
      });
    }
  }
);

/**
 * POST /api/string/append
 * 
 * Append a value to a Redis string key.
 * Returns the new string length.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/append',
  authenticate,
  validate(appendStringSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, value, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute APPEND command
      const length = await client.append(key, value);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'APPEND', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber, appendedValue: value }),
        Date.now()
      );

      res.json({
        success: true,
        data: { length },
      });
    } catch (error) {
      console.error('[String] Append error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to append to string',
      });
    }
  }
);

/**
 * POST /api/string/incr
 * 
 * Increment a Redis string key (must be numeric).
 * Returns the new value.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/incr',
  authenticate,
  validate(incrDecrStringSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute INCR command
      const value = await client.incr(key);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'INCR', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber }),
        Date.now()
      );

      res.json({
        success: true,
        data: { value },
      });
    } catch (error) {
      console.error('[String] Incr error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to increment string value',
      });
    }
  }
);

/**
 * POST /api/string/decr
 * 
 * Decrement a Redis string key (must be numeric).
 * Returns the new value.
 * Logs the action to audit_log.
 * 
 */
router.post(
  '/decr',
  authenticate,
  validate(incrDecrStringSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, key, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute DECR command
      const value = await client.decr(key);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'DECR', ?, ?, ?)
      `).run(
        connectionId,
        key,
        JSON.stringify({ db: dbNumber }),
        Date.now()
      );

      res.json({
        success: true,
        data: { value },
      });
    } catch (error) {
      console.error('[String] Decr error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to decrement string value',
      });
    }
  }
);

export default router;
