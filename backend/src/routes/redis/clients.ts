/**
 * Connected Clients Routes
 * 
 * Handles Redis client connection management including listing, killing individual clients,
 * and bulk killing idle clients.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest, requireRole } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Redis client interface
 */
interface RedisClient {
  id: string;
  addr: string;
  user: string;
  name: string;
  db: number;
  cmd: string;
  idle: number; // seconds
  flags: string;
}

/**
 * Validation schemas
 */
const clientsListSchema = z.object({
  connectionId: z.number().int().positive(),
});

const killClientSchema = z.object({
  connectionId: z.number().int().positive(),
  clientId: z.string().min(1),
});

const killIdleClientsSchema = z.object({
  connectionId: z.number().int().positive(),
  idleThreshold: z.number().int().positive(), // seconds
});

/**
 * Parse CLIENT LIST output into structured client objects
 * 
 * CLIENT LIST format:
 * id=123 addr=127.0.0.1:12345 user=default name= db=0 cmd=get idle=5 flags=N
 */
function parseClientList(clientListOutput: string): RedisClient[] {
  const clients: RedisClient[] = [];
  const lines = clientListOutput.trim().split('\n');
  
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    
    const client: Partial<RedisClient> = {};
    
    // Parse key=value pairs
    const pairs = line.match(/(\w+)=([^\s]*)/g);
    if (!pairs) {
      continue;
    }
    
    for (const pair of pairs) {
      const [key, value] = pair.split('=');
      
      switch (key) {
        case 'id':
          client.id = value;
          break;
        case 'addr':
          client.addr = value;
          break;
        case 'user':
          client.user = value || 'default';
          break;
        case 'name':
          client.name = value || '';
          break;
        case 'db':
          client.db = parseInt(value, 10);
          break;
        case 'cmd':
          client.cmd = value || '';
          break;
        case 'idle':
          client.idle = parseInt(value, 10);
          break;
        case 'flags':
          client.flags = value || '';
          break;
      }
    }
    
    // Only add if we have required fields
    if (client.id && client.addr !== undefined) {
      clients.push(client as RedisClient);
    }
  }
  
  return clients;
}

/**
 * GET /api/redis/clients
 * 
 * Returns list of all connected clients with parsed information.
 */
router.get(
  '/',
  authenticate,
  validate(clientsListSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId } = req.query as any;

      // Get Redis client
      const client = await RedisService.getClient(parseInt(connectionId, 10));

      // Execute CLIENT LIST command
      const clientListOutput = await client.call('CLIENT', 'LIST') as string;

      // Parse output into structured data
      const clients = parseClientList(clientListOutput);

      res.json({
        success: true,
        data: {
          clients,
        },
      });
    } catch (error) {
      console.error('[Clients] List error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list clients',
      });
    }
  }
);

/**
 * POST /api/redis/clients/kill
 * 
 * Kills a specific client connection by ID.
 * Logs the operation to audit_log.
 */
router.post(
  '/kill',
  authenticate,
  requireRole('admin'),
  validate(killClientSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, clientId } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Execute CLIENT KILL ID command
      await client.call('CLIENT', 'KILL', 'ID', clientId);

      // Log to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'CLIENT_KILL', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ clientId }),
        new Date().toISOString()
      );

      res.json({
        success: true,
        data: {
          killed: 1,
        },
      });
    } catch (error) {
      console.error('[Clients] Kill error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to kill client',
      });
    }
  }
);

/**
 * POST /api/redis/clients/kill-idle
 * 
 * Kills all clients exceeding the specified idle threshold.
 * Logs the bulk operation to audit_log with affected count.
 */
router.post(
  '/kill-idle',
  authenticate,
  requireRole('admin'),
  validate(killIdleClientsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, idleThreshold } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Get list of all clients
      const clientListOutput = await client.call('CLIENT', 'LIST') as string;
      const clients = parseClientList(clientListOutput);

      // Filter clients exceeding idle threshold
      const idleClients = clients.filter(c => c.idle > idleThreshold);

      // Kill each idle client
      let killedCount = 0;
      for (const idleClient of idleClients) {
        try {
          await client.call('CLIENT', 'KILL', 'ID', idleClient.id);
          killedCount++;
        } catch (error) {
          // Client might have disconnected already, continue
          console.warn(`[Clients] Failed to kill client ${idleClient.id}:`, error);
        }
      }

      // Log bulk operation to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'CLIENT_KILL_IDLE', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ idleThreshold, killedCount }),
        new Date().toISOString()
      );

      res.json({
        success: true,
        data: {
          killed: killedCount,
        },
      });
    } catch (error) {
      console.error('[Clients] Kill idle error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to kill idle clients',
      });
    }
  }
);

export default router;
