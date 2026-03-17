/**
 * CLI Route
 * 
 * Handles execution of arbitrary Redis commands with security restrictions.
 * Dangerous commands are blocked for non-admin users.
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Dangerous commands that can cause data loss or service disruption
 * These commands are restricted to admin users only
 */
const DANGEROUS_COMMANDS = new Set([
  'FLUSHALL',
  'FLUSHDB',
  'SHUTDOWN',
  'CONFIG',
  'SCRIPT',
  'EVAL',
  'EVALSHA',
  'KEYS',
  'DEBUG',
  'MIGRATE',
  'SLAVEOF',
  'REPLICAOF',
  'BGREWRITEAOF',
  'ACL',
]);

/**
 * Safe ACL subcommands that are read-only and don't modify ACL configuration
 * These can be executed by non-admin users
 */
const SAFE_ACL_SUBCOMMANDS = new Set([
  'LOG',
  'LIST',
  'GETUSER',
  'WHOAMI',
  'CAT',
]);

/**
 * Validation schema for CLI command execution
 */
const cliCommandSchema = z.object({
  connectionId: z.number().int().positive(),
  command: z.string().min(1),
  db: z.number().int().min(0).max(15).default(0),
});

/**
 * Parse command string into command name and arguments
 * Handles quoted strings and spaces
 * 
 * @param commandStr - Raw command string (e.g., "SET mykey 'my value'")
 * @returns Object with command name and arguments array
 */
function parseCommand(commandStr: string): { command: string; args: string[] } {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < commandStr.length; i++) {
    const char = commandStr[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      // Start of quoted string
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      // End of quoted string
      inQuotes = false;
      quoteChar = '';
      if (current) {
        parts.push(current);
        current = '';
      }
    } else if (char === ' ' && !inQuotes) {
      // Space outside quotes - separator
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      // Regular character
      current += char;
    }
  }

  // Add last part if exists
  if (current) {
    parts.push(current);
  }

  if (parts.length === 0) {
    throw new Error('Empty command');
  }

  const [command, ...args] = parts;
  return { command: command.toUpperCase(), args };
}

/**
 * POST /api/cli
 * 
 * Execute arbitrary Redis command with security restrictions.
 * Dangerous commands are blocked for non-admin users.
 */
router.post(
  '/',
  authenticate,
  validate(cliCommandSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { connectionId, command: commandStr, db: dbNumber } = req.body;

      // Parse command string into command name and arguments
      let command: string;
      let args: string[];
      
      try {
        const parsed = parseCommand(commandStr);
        command = parsed.command;
        args = parsed.args;
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to parse command',
        });
        return;
      }

      // Check if command is dangerous
      let isDangerous = DANGEROUS_COMMANDS.has(command);

      // Special handling for ACL commands: allow safe read-only subcommands
      if (command === 'ACL' && args.length > 0) {
        const subcommand = args[0].toUpperCase();
        if (SAFE_ACL_SUBCOMMANDS.has(subcommand)) {
          isDangerous = false;
        }
      }

      // If dangerous and user is not admin, return 403
      if (isDangerous && req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: `Command '${command}' is restricted to admin users only`,
        });
        return;
      }

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      // Select database
      if (dbNumber !== 0) {
        await client.select(dbNumber);
      }

      // Execute command using client.call()
      const result = await client.call(command, ...args);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[CLI] Command execution error:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Command execution failed',
      });
    }
  }
);

export default router;
