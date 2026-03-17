/**
 * Command Profiler Handler
 * 
 * Handles real-time Redis command profiling via Socket.io using MONITOR command.
 * Streams parsed command events to clients with automatic 5-minute timeout.
 */

import { Socket } from 'socket.io';
import Redis from 'ioredis';
import { get } from '../db';
import { CryptoService } from '../services/crypto.service';
import { parseMonitorLine } from '../services/parser.service';

// Store profiler clients and timeouts per socket
const profilerClients = new Map<string, Redis>();
const profilerTimeouts = new Map<string, NodeJS.Timeout>();

// 5-minute timeout in milliseconds
const PROFILER_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Register command profiler event handlers for a socket
 * 
 * @param socket - The Socket.io socket instance
 */
export function registerProfilerHandler(socket: Socket): void {
  /**
   * Handle start-profiler event
   * Creates a dedicated Redis client for MONITOR and streams parsed command events
   */
  socket.on('start-profiler', async (data: { connectionId: number; db?: number }) => {
    try {
      const { connectionId, db = 0 } = data;

      // Verify user authentication from socket.data.user
      if (!socket.data.user) {
        socket.emit('profiler-error', { message: 'Authentication required' });
        return;
      }

      // Check if profiling is already active for this socket
      if (profilerClients.has(socket.id)) {
        socket.emit('profiler-error', { message: 'Profiler already active for this connection' });
        return;
      }

      // Fetch connection from database
      const row = get<{
        id: number;
        name: string;
        url_encrypted: string;
      }>(
        'SELECT id, name, url_encrypted FROM connections WHERE id = ?',
        [connectionId]
      );

      if (!row) {
        socket.emit('profiler-error', { message: `Connection ${connectionId} not found` });
        return;
      }

      // Decrypt the connection URL
      let url: string;
      try {
        url = CryptoService.decrypt(row.url_encrypted);
      } catch (error) {
        socket.emit('profiler-error', { 
          message: `Failed to decrypt connection URL: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Create duplicate Redis client for MONITOR
      // MONITOR command requires a dedicated connection (cannot be pooled)
      const profilerClient = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
        commandTimeout: 10000,
        retryStrategy: (times: number) => {
          return Math.min(times * 50, 2000);
        },
        enableReadyCheck: true,
        enableOfflineQueue: false,
      });

      // Handle connection errors
      profilerClient.on('error', (error) => {
        console.error(`[Profiler] Connection ${connectionId} error:`, error.message);
        socket.emit('profiler-error', { message: error.message });
        
        // Cleanup on error
        cleanupProfiler(socket.id);
      });

      // Connect to Redis
      try {
        await profilerClient.connect();
      } catch (error) {
        socket.emit('profiler-error', { 
          message: `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Select database if not default (db 0)
      if (db !== 0) {
        try {
          await profilerClient.select(db);
        } catch (error) {
          socket.emit('profiler-error', { 
            message: `Failed to select database ${db}: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
          await profilerClient.quit();
          return;
        }
      }

      // Store profiler client reference for cleanup
      profilerClients.set(socket.id, profilerClient);

      // Set 5-minute timeout to auto-stop profiling
      const timeout = setTimeout(() => {
        console.log(`[Profiler] Auto-stopping profiler for socket ${socket.id} after 5 minutes`);
        
        // Emit profiler-stopped event with reason
        socket.emit('profiler-stopped', { 
          reason: 'timeout',
          message: 'Profiling automatically stopped after 5 minutes'
        });
        
        // Cleanup profiler
        cleanupProfiler(socket.id);
      }, PROFILER_TIMEOUT_MS);

      profilerTimeouts.set(socket.id, timeout);

      // Listen for monitor data events from ioredis
      // The 'monitor' event is emitted by ioredis when MONITOR command is active
      profilerClient.on('monitor', (time: number, args: string[], source: string, database: string) => {
        // Format MONITOR line for parsing
        // ioredis provides: time (timestamp), args (command array), source (client info), database (db number)
        const timestamp = time.toString();
        const db = database;
        const client = source;
        
        // Format command with quoted arguments for parseMonitorLine
        const quotedArgs = args.map(arg => `"${arg}"`).join(' ');
        const monitorLine = `${timestamp} [${db} ${client}] ${quotedArgs}`;
        
        // Parse each MONITOR line with parseMonitorLine
        const parsedEvent = parseMonitorLine(monitorLine);
        
        if (parsedEvent) {
          // Emit 'profiler-command' events with structured CommandEvent
          socket.emit('profiler-command', {
            event: {
              timestamp: parsedEvent.timestamp,
              db: parsedEvent.db,
              client: parsedEvent.client,
              command: parsedEvent.command,
              args: parsedEvent.args,
            }
          });
        }
        // If parsing fails, parseMonitorLine logs the error and returns null
        // We continue processing subsequent lines
      });

      // Execute MONITOR command and stream output
      try {
        await profilerClient.monitor();
        console.log(`[Profiler] Started profiling for socket ${socket.id}, connection ${connectionId}, db ${db}`);
        
        // Emit success event
        socket.emit('profiler-started', {
          connectionId,
          db,
          timeoutMs: PROFILER_TIMEOUT_MS
        });
      } catch (error) {
        socket.emit('profiler-error', { 
          message: `Failed to start profiling: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        cleanupProfiler(socket.id);
      }
    } catch (error) {
      console.error('[Profiler] Error in start-profiler handler:', error);
      socket.emit('profiler-error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle stop-profiler event
   * Stops MONITOR and closes client
   */
  socket.on('stop-profiler', async () => {
    try {
      const profilerClient = profilerClients.get(socket.id);
      
      if (!profilerClient) {
        return; // No active profiler for this socket
      }

      console.log(`[Profiler] Stopping profiler for socket ${socket.id}`);
      
      // Emit stopped event
      socket.emit('profiler-stopped', { 
        reason: 'manual',
        message: 'Profiling stopped by user'
      });
      
      // Cleanup profiler
      cleanupProfiler(socket.id);
    } catch (error) {
      console.error('[Profiler] Error in stop-profiler handler:', error);
      socket.emit('profiler-error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle socket disconnect event
   * Clean up on socket disconnect
   */
  socket.on('disconnect', async () => {
    try {
      const profilerClient = profilerClients.get(socket.id);
      
      if (!profilerClient) {
        return; // No active profiler for this socket
      }

      console.log(`[Profiler] Cleaning up profiler for disconnected socket ${socket.id}`);
      
      // Cleanup profiler
      cleanupProfiler(socket.id);
    } catch (error) {
      console.error('[Profiler] Error in disconnect handler:', error);
    }
  });
}

/**
 * Cleanup profiler client and timeout for a socket
 * Store cleanup handler in socket data
 * 
 * @param socketId - The socket ID to cleanup
 */
function cleanupProfiler(socketId: string): void {
  // Clear timeout if exists
  const timeout = profilerTimeouts.get(socketId);
  if (timeout) {
    clearTimeout(timeout);
    profilerTimeouts.delete(socketId);
  }

  // Quit and remove profiler client
  const profilerClient = profilerClients.get(socketId);
  if (profilerClient) {
    profilerClients.delete(socketId);
    
    profilerClient.quit().catch((error) => {
      console.error(`[Profiler] Error quitting profiler client for socket ${socketId}:`, error);
      // Force disconnect if quit fails
      try {
        profilerClient.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    });
  }
}
