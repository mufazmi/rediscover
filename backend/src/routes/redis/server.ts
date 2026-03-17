/**
 * Server Management Routes
 * 
 * Handles Redis server operations including INFO, CONFIG, CLIENT LIST, and BGSAVE commands.
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

// Server info schema
const serverInfoSchema = z.object({
  connectionId: z.number().int().positive(),
  section: z.string().optional(),
  db: z.number().int().min(0).max(15).default(0),
});

// Server config get schema
const serverConfigGetSchema = z.object({
  connectionId: z.number().int().positive(),
  parameter: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

// Server config set schema
const serverConfigSetSchema = z.object({
  connectionId: z.number().int().positive(),
  parameter: z.string().min(1),
  value: z.string(),
  db: z.number().int().min(0).max(15).default(0),
});

// Server clients schema
const serverClientsSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

// Server bgsave schema
const serverBgsaveSchema = z.object({
  connectionId: z.number().int().positive(),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * Parse Redis INFO response into sections
 * 
 * INFO response format:
 * # Section1
 * key1:value1
 * key2:value2
 * 
 * # Section2
 * key3:value3
 */
function parseInfoResponse(infoString: string): Record<string, Record<string, string>> {
  const sections: Record<string, Record<string, string>> = {};
  let currentSection = 'default';
  
  const lines = infoString.split('\r\n');
  
  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }
    
    // Section header (starts with #)
    if (line.startsWith('#')) {
      currentSection = line.substring(1).trim().toLowerCase();
      sections[currentSection] = {};
      continue;
    }
    
    // Key-value pair
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).trim();
      const value = line.substring(colonIndex + 1).trim();
      
      if (!sections[currentSection]) {
        sections[currentSection] = {};
      }
      
      sections[currentSection][key] = value;
    }
  }
  
  return sections;
}

/**
 * Parse Redis CLIENT LIST response into array of client objects
 * 
 * CLIENT LIST response format:
 * id=1 addr=127.0.0.1:12345 fd=8 name= age=0 idle=0 ...
 * id=2 addr=127.0.0.1:12346 fd=9 name= age=1 idle=1 ...
 */
function parseClientListResponse(clientListString: string): Array<Record<string, string>> {
  const clients: Array<Record<string, string>> = [];
  
  const lines = clientListString.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    
    const client: Record<string, string> = {};
    const parts = line.split(' ');
    
    for (const part of parts) {
      const equalIndex = part.indexOf('=');
      if (equalIndex > 0) {
        const key = part.substring(0, equalIndex);
        const value = part.substring(equalIndex + 1);
        client[key] = value;
      }
    }
    
    if (Object.keys(client).length > 0) {
      clients.push(client);
    }
  }
  
  return clients;
}

/**
 * POST /api/server/info
 * 
 * Get Redis server information using INFO command.
 * Optionally filter by section (e.g., "server", "memory", "stats").
 * 
 */
router.post(
  '/info',
  authenticate,
  validate(serverInfoSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, section, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute INFO command (with optional section parameter)
      let infoResult: string;
      if (section) {
        infoResult = await client.info(section);
      } else {
        infoResult = await client.info();
      }

      // Parse response into sections
      const parsedInfo = parseInfoResponse(infoResult);

      res.json({
        success: true,
        data: parsedInfo,
      });
    } catch (error) {
      console.error('[Server] Info error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get server info',
      });
    }
  }
);

/**
 * POST /api/server/config
 * 
 * Get Redis server configuration using CONFIG GET command.
 * 
 */
router.post(
  '/config',
  authenticate,
  validate(serverConfigGetSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, parameter, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute CONFIG GET command
      const configResult = await client.config('GET', parameter) as string[];

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
      console.error('[Server] Config get error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get server config',
      });
    }
  }
);

/**
 * POST /api/server/config/set
 * 
 * Set Redis server configuration using CONFIG SET command.
 * Requires admin role.
 * 
 */
router.post(
  '/config/set',
  authenticate,
  requireRole('admin'),
  validate(serverConfigSetSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, parameter, value, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute CONFIG SET command
      await client.config('SET', parameter, value);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Server] Config set error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set server config',
      });
    }
  }
);

/**
 * POST /api/server/clients
 * 
 * List connected clients using CLIENT LIST command.
 * 
 */
router.post(
  '/clients',
  authenticate,
  validate(serverClientsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute CLIENT LIST command
      const clientListResult = await client.call('CLIENT', 'LIST') as string;

      // Parse response into array of client objects
      const clients = parseClientListResponse(clientListResult);

      res.json({
        success: true,
        data: clients,
      });
    } catch (error) {
      console.error('[Server] Clients list error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list clients',
      });
    }
  }
);

/**
 * POST /api/server/bgsave
 * 
 * Trigger background save using BGSAVE command.
 * Requires admin role.
 * 
 */
router.post(
  '/bgsave',
  authenticate,
  requireRole('admin'),
  validate(serverBgsaveSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, db: dbNumber } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute BGSAVE command
      await client.bgsave();

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[Server] BGSAVE error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger background save',
      });
    }
  }
);

export default router;
