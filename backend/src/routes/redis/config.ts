/**
 * Config Editor Routes
 * 
 * Handles Redis configuration parameter viewing and editing.
 * Provides categorized configuration parameters with validation and audit logging.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Configuration parameter category types
 */
type ConfigCategory = 'memory' | 'network' | 'security' | 'persistence' | 'logging' | 'replication' | 'lua' | 'other';

/**
 * Configuration parameter interface
 */
interface ConfigParameter {
  name: string;
  value: string;
  category: ConfigCategory;
  mutable: boolean;
  dangerous: boolean;
  enumValues?: string[];
  description?: string;
}

/**
 * Validation schemas
 */
const configGetSchema = z.object({
  connectionId: z.number().int().positive(),
});

const configSetSchema = z.object({
  connectionId: z.number().int().positive(),
  parameter: z.string().min(1),
  value: z.string(),
});

/**
 * Dangerous parameters that require extra caution
 */
const DANGEROUS_PARAMETERS = new Set([
  'requirepass',
  'bind',
  'protected-mode',
]);

/**
 * Runtime-immutable parameters (cannot be changed with CONFIG SET)
 */
const IMMUTABLE_PARAMETERS = new Set([
  'daemonize',
  'supervised',
  'pidfile',
  'port',
  'tcp-backlog',
  'unixsocket',
  'unixsocketperm',
  'dir',
  'always-show-logo',
]);

/**
 * Parameters with enumerated values
 */
const ENUM_PARAMETERS: Record<string, string[]> = {
  'maxmemory-policy': [
    'noeviction',
    'allkeys-lru',
    'allkeys-lfu',
    'allkeys-random',
    'volatile-lru',
    'volatile-lfu',
    'volatile-random',
    'volatile-ttl',
  ],
  'appendfsync': [
    'always',
    'everysec',
    'no',
  ],
  'loglevel': [
    'debug',
    'verbose',
    'notice',
    'warning',
  ],
};

/**
 * Categorize a configuration parameter
 */
function categorizeParameter(name: string): ConfigCategory {
  const lowerName = name.toLowerCase();
  
  // Memory-related parameters
  if (lowerName.includes('memory') || lowerName.includes('evict')) {
    return 'memory';
  }
  
  // Network-related parameters
  if (lowerName.includes('bind') || lowerName.includes('port') || 
      lowerName.includes('tcp') || lowerName.includes('timeout') ||
      lowerName.includes('keepalive') || lowerName.includes('socket')) {
    return 'network';
  }
  
  // Security-related parameters
  if (lowerName.includes('pass') || lowerName.includes('protected') ||
      lowerName.includes('acl') || lowerName.includes('tls') ||
      lowerName.includes('ssl')) {
    return 'security';
  }
  
  // Persistence-related parameters
  if (lowerName.includes('save') || lowerName.includes('rdb') ||
      lowerName.includes('aof') || lowerName.includes('append') ||
      lowerName.includes('fsync') || lowerName.includes('dir')) {
    return 'persistence';
  }
  
  // Logging-related parameters
  if (lowerName.includes('log') || lowerName.includes('syslog')) {
    return 'logging';
  }
  
  // Replication-related parameters
  if (lowerName.includes('repl') || lowerName.includes('slave') ||
      lowerName.includes('master')) {
    return 'replication';
  }
  
  // Lua-related parameters
  if (lowerName.includes('lua')) {
    return 'lua';
  }
  
  // Default to other
  return 'other';
}

/**
 * Validate parameter value before CONFIG SET
 */
function validateParameterValue(parameter: string, value: string): { valid: boolean; error?: string } {
  // Check enum values
  if (ENUM_PARAMETERS[parameter]) {
    if (!ENUM_PARAMETERS[parameter].includes(value)) {
      return {
        valid: false,
        error: `Invalid value for ${parameter}. Must be one of: ${ENUM_PARAMETERS[parameter].join(', ')}`,
      };
    }
  }
  
  // Validate numeric parameters
  if (parameter.includes('timeout') || parameter.includes('limit') || 
      parameter.includes('size') || parameter.includes('memory')) {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue) && value !== '') {
      return {
        valid: false,
        error: `Invalid numeric value for ${parameter}`,
      };
    }
  }
  
  // Validate boolean parameters
  if (parameter.includes('enabled') || parameter === 'protected-mode' || 
      parameter === 'appendonly') {
    if (!['yes', 'no', '1', '0', 'true', 'false'].includes(value.toLowerCase())) {
      return {
        valid: false,
        error: `Invalid boolean value for ${parameter}. Must be yes/no or 1/0`,
      };
    }
  }
  
  return { valid: true };
}

/**
 * GET /api/redis/config
 * 
 * Returns all configuration parameters categorized and annotated with metadata.
 */
router.get(
  '/',
  authenticate,
  validate(configGetSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId } = req.query as any;

      // Get Redis client
      const client = await RedisService.getClient(parseInt(connectionId, 10));

      // Execute CONFIG GET * to retrieve all parameters
      const configResult = await client.config('GET', '*') as string[];

      // Parse result into parameter objects
      const parameters: ConfigParameter[] = [];
      
      for (let i = 0; i < configResult.length; i += 2) {
        const name = configResult[i];
        const value = configResult[i + 1];
        
        parameters.push({
          name,
          value,
          category: categorizeParameter(name),
          mutable: !IMMUTABLE_PARAMETERS.has(name),
          dangerous: DANGEROUS_PARAMETERS.has(name),
          enumValues: ENUM_PARAMETERS[name],
        });
      }

      res.json({
        success: true,
        data: {
          parameters,
        },
      });
    } catch (error) {
      console.error('[Config] Get error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve configuration',
      });
    }
  }
);

/**
 * PATCH /api/redis/config
 * 
 * Updates a configuration parameter value.
 * Validates the value, executes CONFIG SET, and logs to audit_log.
 */
router.patch(
  '/',
  authenticate,
  validate(configSetSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { connectionId, parameter, value } = req.body;

      // Check if parameter is dangerous and require admin role
      if (DANGEROUS_PARAMETERS.has(parameter) && req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: `Access denied. Admin role required to modify dangerous parameter: ${parameter}`,
        });
        return;
      }

      // Validate parameter value
      const validation = validateParameterValue(parameter, value);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error,
        });
        return;
      }

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Get old value for audit log
      let oldValue = '';
      try {
        const oldConfigResult = await client.config('GET', parameter) as string[];
        if (oldConfigResult.length >= 2) {
          oldValue = oldConfigResult[1];
        }
      } catch (error) {
        // Continue even if we can't get old value
        console.warn('[Config] Could not retrieve old value:', error);
      }

      // Execute CONFIG SET
      try {
        await client.config('SET', parameter, value);
      } catch (error) {
        // Return descriptive error message
        const errorMessage = error instanceof Error ? error.message : 'CONFIG SET failed';
        res.status(400).json({
          success: false,
          error: `Failed to set ${parameter}: ${errorMessage}`,
        });
        return;
      }

      // Log configuration change to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'CONFIG_SET', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ parameter, oldValue, newValue: value }),
        new Date().toISOString()
      );

      res.json({
        success: true,
        data: {
          parameter,
          value,
        },
      });
    } catch (error) {
      console.error('[Config] Set error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update configuration',
      });
    }
  }
);

/**
 * GET /api/redis/config/keyspace/config
 * 
 * Returns the current notify-keyspace-events configuration value.
 */
router.get(
  '/keyspace/config',
  authenticate,
  validate(configGetSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId } = req.query as any;

      // Get Redis client
      const client = await RedisService.getClient(parseInt(connectionId, 10));

      // Get notify-keyspace-events configuration
      const configResult = await client.config('GET', 'notify-keyspace-events') as string[];
      
      const config = configResult.length >= 2 ? configResult[1] : '';

      res.json({
        success: true,
        data: {
          config,
        },
      });
    } catch (error) {
      console.error('[Config] Get keyspace config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve keyspace configuration',
      });
    }
  }
);

/**
 * Validation schema for keyspace config
 */
const keyspaceConfigSchema = z.object({
  connectionId: z.number().int().positive(),
  preset: z.enum(['none', 'expired', 'all']),
});

/**
 * POST /api/redis/config/keyspace/config
 * 
 * Sets the notify-keyspace-events configuration using a preset.
 * Presets: none='', expired='Ex', all='AKE'
 */
router.post(
  '/keyspace/config',
  authenticate,
  validate(keyspaceConfigSchema),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { connectionId, preset } = req.body;

      // Map presets to Redis config values
      const presetMap: Record<string, string> = {
        none: '',
        expired: 'Ex',
        all: 'AKE',
      };

      const value = presetMap[preset];

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Get old value for audit log
      let oldValue = '';
      try {
        const oldConfigResult = await client.config('GET', 'notify-keyspace-events') as string[];
        if (oldConfigResult.length >= 2) {
          oldValue = oldConfigResult[1];
        }
      } catch (error) {
        console.warn('[Config] Could not retrieve old keyspace config value:', error);
      }

      // Execute CONFIG SET notify-keyspace-events
      try {
        await client.config('SET', 'notify-keyspace-events', value);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'CONFIG SET failed';
        res.status(400).json({
          success: false,
          error: `Failed to set notify-keyspace-events: ${errorMessage}`,
        });
        return;
      }

      // Log configuration change to audit_log
      db.prepare(`
        INSERT INTO audit_log (connection_id, action, key_name, details, created_at)
        VALUES (?, 'CONFIG_SET_KEYSPACE', NULL, ?, ?)
      `).run(
        connectionId,
        JSON.stringify({ parameter: 'notify-keyspace-events', preset, oldValue, newValue: value }),
        new Date().toISOString()
      );

      res.json({
        success: true,
        data: {
          preset,
          config: value,
        },
      });
    } catch (error) {
      console.error('[Config] Set keyspace config error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update keyspace configuration',
      });
    }
  }
);

export default router;
