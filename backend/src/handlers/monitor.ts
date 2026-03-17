/**
 * Monitor Handler
 * 
 * Handles real-time Redis MONITOR command streaming via Socket.io.
 * Creates dedicated Redis clients for monitoring and streams command data to clients.
 */

import { Socket } from 'socket.io';
import Redis from 'ioredis';
import { get } from '../db';
import { CryptoService } from '../services/crypto.service';

// Store monitor clients per socket
const monitorClients = new Map<string, Redis>();

/**
 * Register monitor event handlers for a socket
 * 
 * @param socket - The Socket.io socket instance
 */
export function registerMonitorHandler(socket: Socket): void {
  /**
   * Handle monitor:start event
   * Creates a dedicated Redis client and starts monitoring
   */
  socket.on('monitor:start', async (data: { connectionId: number; db?: number }) => {
    try {
      const { connectionId, db = 0 } = data;

      // Check if monitoring is already active for this socket
      if (monitorClients.has(socket.id)) {
        socket.emit('monitor:error', { message: 'Monitor already active for this connection' });
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
        socket.emit('monitor:error', { message: `Connection ${connectionId} not found` });
        return;
      }

      // Decrypt the connection URL
      let url: string;
      try {
        url = CryptoService.decrypt(row.url_encrypted);
      } catch (error) {
        socket.emit('monitor:error', { 
          message: `Failed to decrypt connection URL: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Create dedicated ioredis client for monitoring
      // MONITOR command requires a dedicated connection (cannot be pooled)
      const monitorClient = new Redis(url, {
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
      monitorClient.on('error', (error) => {
        console.error(`[Monitor] Connection ${connectionId} error:`, error.message);
        socket.emit('monitor:error', { message: error.message });
        
        // Cleanup on error
        monitorClients.delete(socket.id);
        monitorClient.quit().catch(() => {
          // Ignore quit errors
        });
      });

      // Connect to Redis
      try {
        await monitorClient.connect();
      } catch (error) {
        socket.emit('monitor:error', { 
          message: `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Select database if not default (db 0)
      if (db !== 0) {
        try {
          await monitorClient.select(db);
        } catch (error) {
          socket.emit('monitor:error', { 
            message: `Failed to select database ${db}: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
          await monitorClient.quit();
          return;
        }
      }

      // Store monitor client reference for cleanup
      monitorClients.set(socket.id, monitorClient);

      // Listen for monitor data events from ioredis
      // The 'monitor' event is emitted by ioredis when MONITOR command is active
      monitorClient.on('monitor', (time: number, args: string[], source: string, database: string) => {
        // Parse monitor output format: timestamp [db] "command" "arg1" "arg2" ...
        // ioredis provides parsed data: time (timestamp), args (command array), source (client info), database (db number)
        
        // Format command string from args array
        const command = args.join(' ');
        
        // Emit monitor:data event to client with timestamp and command
        socket.emit('monitor:data', {
          timestamp: time,
          command,
          source,
          database,
        });
      });

      // Execute MONITOR command
      // This puts the Redis connection into monitor mode
      try {
        await monitorClient.monitor();
        console.log(`[Monitor] Started monitoring for socket ${socket.id}, connection ${connectionId}, db ${db}`);
      } catch (error) {
        socket.emit('monitor:error', { 
          message: `Failed to start monitoring: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        monitorClients.delete(socket.id);
        await monitorClient.quit();
      }
    } catch (error) {
      console.error('[Monitor] Error in monitor:start handler:', error);
      socket.emit('monitor:error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle monitor:stop event
   * Stops monitoring and cleans up the monitor client
   */
  socket.on('monitor:stop', async () => {
    try {
      const monitorClient = monitorClients.get(socket.id);
      
      if (!monitorClient) {
        return; // No active monitor for this socket
      }

      // Remove from map
      monitorClients.delete(socket.id);

      // Execute QUIT to stop monitoring and disconnect
      try {
        await monitorClient.quit();
        console.log(`[Monitor] Stopped monitoring for socket ${socket.id}`);
      } catch (error) {
        console.error(`[Monitor] Error stopping monitor for socket ${socket.id}:`, error);
        // Force disconnect if quit fails
        try {
          monitorClient.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    } catch (error) {
      console.error('[Monitor] Error in monitor:stop handler:', error);
    }
  });

  /**
   * Handle socket disconnect event
   * Cleanup monitor client if active
   */
  socket.on('disconnect', async () => {
    try {
      const monitorClient = monitorClients.get(socket.id);
      
      if (!monitorClient) {
        return; // No active monitor for this socket
      }

      // Remove from map
      monitorClients.delete(socket.id);

      // Execute QUIT to stop monitoring and disconnect
      try {
        await monitorClient.quit();
        console.log(`[Monitor] Cleaned up monitor for disconnected socket ${socket.id}`);
      } catch (error) {
        console.error(`[Monitor] Error cleaning up monitor for socket ${socket.id}:`, error);
        // Force disconnect if quit fails
        try {
          monitorClient.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    } catch (error) {
      console.error('[Monitor] Error in disconnect handler:', error);
    }
  });
}
