/**
 * Connection Management Routes
 * 
 * Handles CRUD operations for Redis connections including testing and health monitoring.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { CryptoService } from '../services/crypto.service';
import { RedisService } from '../services/redis.service';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Validation schemas
 */

// Create connection schema
const createConnectionSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  url: z.string().min(1, 'URL is required'),
  color: z.string().optional(),
});

// Update connection schema
const updateConnectionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().min(1).optional(),
  color: z.string().optional(),
  isDefault: z.boolean().optional(),
});

// Test connection schema
const testConnectionSchema = z.object({
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * Connection interface for responses
 */
interface Connection {
  id: number;
  name: string;
  url: string;
  color?: string;
  isDefault: boolean;
  status?: string;
  latencyMs?: number;
  lastCheckedAt?: number;
  createdAt: number;
}

/**
 * GET /api/connections
 * 
 * List all connections with decrypted URLs.
 */
router.get('/', authenticate, (_req: AuthRequest, res: Response) => {
  try {
    // Fetch all connections from database
    const rows = db.prepare(`
      SELECT id, name, url_encrypted, color, is_default, status, latency_ms, last_checked_at, created_at
      FROM connections
      ORDER BY created_at DESC
    `).all() as Array<{
      id: number;
      name: string;
      url_encrypted: string;
      color: string | null;
      is_default: number;
      status: string | null;
      latency_ms: number | null;
      last_checked_at: number | null;
      created_at: number;
    }>;

    // Decrypt URLs and format response
    const connections: Connection[] = rows.map(row => {
      let url: string;
      try {
        url = CryptoService.decrypt(row.url_encrypted);
      } catch (error) {
        console.error(`[Connections] Failed to decrypt URL for connection ${row.id}:`, error);
        url = '[Decryption failed]';
      }

      return {
        id: row.id,
        name: row.name,
        url,
        color: row.color || undefined,
        isDefault: row.is_default === 1,
        status: row.status || undefined,
        latencyMs: row.latency_ms || undefined,
        lastCheckedAt: row.last_checked_at || undefined,
        createdAt: row.created_at,
      };
    });

    res.json({
      success: true,
      data: connections,
    });
  } catch (error) {
    console.error('[Connections] List error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch connections',
    });
  }
});

/**
 * POST /api/connections
 * 
 * Create a new connection with encrypted URL.
 */
router.post(
  '/',
  authenticate,
  validate(createConnectionSchema),
  (req: AuthRequest, res: Response) => {
    try {
      const { name, url, color } = req.body;

      // Encrypt the connection URL
      const urlEncrypted = CryptoService.encrypt(url);

      // Insert into database
      const result = db.prepare(`
        INSERT INTO connections (name, url_encrypted, color, is_default, created_at)
        VALUES (?, ?, ?, 0, ?)
      `).run(name, urlEncrypted, color || null, Date.now());

      const connectionId = result.lastInsertRowid as number;

      // Fetch the created connection
      const row = db.prepare(`
        SELECT id, name, url_encrypted, color, is_default, status, latency_ms, last_checked_at, created_at
        FROM connections
        WHERE id = ?
      `).get(connectionId) as {
        id: number;
        name: string;
        url_encrypted: string;
        color: string | null;
        is_default: number;
        status: string | null;
        latency_ms: number | null;
        last_checked_at: number | null;
        created_at: number;
      };

      // Format response with decrypted URL
      const connection: Connection = {
        id: row.id,
        name: row.name,
        url: CryptoService.decrypt(row.url_encrypted),
        color: row.color || undefined,
        isDefault: row.is_default === 1,
        status: row.status || undefined,
        latencyMs: row.latency_ms || undefined,
        lastCheckedAt: row.last_checked_at || undefined,
        createdAt: row.created_at,
      };

      res.json({
        success: true,
        data: connection,
      });
    } catch (error) {
      console.error('[Connections] Create error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create connection',
      });
    }
  }
);

/**
 * PUT /api/connections/:id
 * 
 * Update an existing connection.
 */
router.put(
  '/:id',
  authenticate,
  validate(updateConnectionSchema),
  (req: AuthRequest, res: Response) => {
    try {
      const connectionId = parseInt(req.params.id, 10);

      if (isNaN(connectionId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid connection ID',
        });
        return;
      }

      // Check if connection exists
      const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(connectionId);

      if (!existing) {
        res.status(404).json({
          success: false,
          error: 'Connection not found',
        });
        return;
      }

      const { name, url, color, isDefault } = req.body;

      // Build update query dynamically based on provided fields
      const updates: string[] = [];
      const params: any[] = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }

      if (url !== undefined) {
        // Re-encrypt URL if changed
        const urlEncrypted = CryptoService.encrypt(url);
        updates.push('url_encrypted = ?');
        params.push(urlEncrypted);

        // Release existing client since URL changed
        RedisService.releaseClient(connectionId);
      }

      if (color !== undefined) {
        updates.push('color = ?');
        params.push(color || null);
      }

      if (isDefault !== undefined) {
        // If setting as default, unset other defaults first
        if (isDefault) {
          db.prepare('UPDATE connections SET is_default = 0').run();
        }
        updates.push('is_default = ?');
        params.push(isDefault ? 1 : 0);
      }

      // Execute update if there are changes
      if (updates.length > 0) {
        params.push(connectionId);
        db.prepare(`
          UPDATE connections
          SET ${updates.join(', ')}
          WHERE id = ?
        `).run(...params);
      }

      // Fetch updated connection
      const row = db.prepare(`
        SELECT id, name, url_encrypted, color, is_default, status, latency_ms, last_checked_at, created_at
        FROM connections
        WHERE id = ?
      `).get(connectionId) as {
        id: number;
        name: string;
        url_encrypted: string;
        color: string | null;
        is_default: number;
        status: string | null;
        latency_ms: number | null;
        last_checked_at: number | null;
        created_at: number;
      };

      // Format response with decrypted URL
      const connection: Connection = {
        id: row.id,
        name: row.name,
        url: CryptoService.decrypt(row.url_encrypted),
        color: row.color || undefined,
        isDefault: row.is_default === 1,
        status: row.status || undefined,
        latencyMs: row.latency_ms || undefined,
        lastCheckedAt: row.last_checked_at || undefined,
        createdAt: row.created_at,
      };

      res.json({
        success: true,
        data: connection,
      });
    } catch (error) {
      console.error('[Connections] Update error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update connection',
      });
    }
  }
);

/**
 * DELETE /api/connections/:id
 * 
 * Delete a connection and cleanup Redis client.
 */
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const connectionId = parseInt(req.params.id, 10);

    if (isNaN(connectionId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid connection ID',
      });
      return;
    }

    // Check if connection exists
    const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(connectionId);

    if (!existing) {
      res.status(404).json({
        success: false,
        error: 'Connection not found',
      });
      return;
    }

    // Release Redis client if exists
    await RedisService.releaseClient(connectionId);

    // Delete from database (cascade will delete audit logs)
    db.prepare('DELETE FROM connections WHERE id = ?').run(connectionId);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Connections] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete connection',
    });
  }
});

/**
 * POST /api/connections/:id/test
 * 
 * Test a connection by executing PING and measuring latency.
 */
router.post(
  '/:id/test',
  authenticate,
  validate(testConnectionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const connectionId = parseInt(req.params.id, 10);

      if (isNaN(connectionId)) {
        res.status(400).json({
          success: false,
          error: 'Invalid connection ID',
        });
        return;
      }

      const { db: dbNumber } = req.body;

      // Test the connection using RedisService
      const result = await RedisService.testConnection(connectionId, dbNumber);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[Connections] Test error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test connection',
      });
    }
  }
);

export default router;
