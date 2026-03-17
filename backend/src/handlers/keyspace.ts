/**
 * Keyspace Events Handler
 * 
 * Handles real-time Redis keyspace notifications via Socket.io using PSUBSCRIBE.
 * Streams parsed keyspace events to clients for monitoring key lifecycle operations.
 * 
 */

import { Socket } from 'socket.io';
import Redis from 'ioredis';
import { get } from '../db';
import { CryptoService } from '../services/crypto.service';
import { parseKeyspaceNotification } from '../services/parser.service';

// Store keyspace clients per socket
const keyspaceClients = new Map<string, Redis>();

/**
 * Register keyspace events handlers for a socket
 * 
 * @param socket - The Socket.io socket instance
 */
export function registerKeyspaceHandler(socket: Socket): void {
  /**
   * Handle start-keyspace-events event
   * Creates a dedicated Redis client for pub/sub and streams parsed keyspace events
   */
  socket.on('start-keyspace-events', async (data: { connectionId: number }) => {
    try {
      const { connectionId } = data;

      // Verify user authentication from socket.data.user
      if (!socket.data.user) {
        socket.emit('keyspace-error', { message: 'Authentication required' });
        return;
      }

      // Check if keyspace monitoring is already active for this socket
      if (keyspaceClients.has(socket.id)) {
        socket.emit('keyspace-error', { message: 'Keyspace monitoring already active for this connection' });
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
        socket.emit('keyspace-error', { message: `Connection ${connectionId} not found` });
        return;
      }

      // Decrypt the connection URL
      let url: string;
      try {
        url = CryptoService.decrypt(row.url_encrypted);
      } catch (error) {
        socket.emit('keyspace-error', { 
          message: `Failed to decrypt connection URL: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Create duplicate Redis client for pub/sub
      // Pub/sub requires a dedicated connection (cannot be pooled)
      const keyspaceClient = new Redis(url, {
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
      keyspaceClient.on('error', (error) => {
        console.error(`[Keyspace] Connection ${connectionId} error:`, error.message);
        socket.emit('keyspace-error', { message: error.message });
        
        // Cleanup on error
        cleanupKeyspace(socket.id);
      });

      // Connect to Redis
      try {
        await keyspaceClient.connect();
      } catch (error) {
        socket.emit('keyspace-error', { 
          message: `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Store keyspace client reference for cleanup
      keyspaceClients.set(socket.id, keyspaceClient);

      // Subscribe to __keyspace@*__:* and __keyevent@*__:*
      // These patterns capture all keyspace and keyevent notifications across all databases
      try {
        await keyspaceClient.psubscribe('__keyspace@*__:*', '__keyevent@*__:*');
        console.log(`[Keyspace] Started keyspace monitoring for socket ${socket.id}, connection ${connectionId}`);
      } catch (error) {
        socket.emit('keyspace-error', { 
          message: `Failed to subscribe to keyspace notifications: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        cleanupKeyspace(socket.id);
        return;
      }

      // Listen for pmessage events (pattern-based pub/sub messages)
      keyspaceClient.on('pmessage', (_pattern: string, channel: string, message: string) => {
        // Parse each notification with parseKeyspaceNotification
        const parsedEvent = parseKeyspaceNotification(channel, message);
        
        if (parsedEvent) {
          // Emit 'keyspace-event' events with structured KeyspaceEvent
          socket.emit('keyspace-event', {
            event: {
              timestamp: Date.now(),
              type: parsedEvent.eventType,
              key: parsedEvent.key,
              db: parsedEvent.db,
            }
          });
        }
        // If parsing fails, parseKeyspaceNotification logs the error and returns null
        // We continue processing subsequent notifications
      });

      // Emit success event
      socket.emit('keyspace-started', {
        connectionId,
      });
    } catch (error) {
      console.error('[Keyspace] Error in start-keyspace-events handler:', error);
      socket.emit('keyspace-error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle stop-keyspace-events event
   * Unsubscribes from keyspace notifications and closes client
   */
  socket.on('stop-keyspace-events', async () => {
    try {
      const keyspaceClient = keyspaceClients.get(socket.id);
      
      if (!keyspaceClient) {
        return; // No active keyspace monitoring for this socket
      }

      console.log(`[Keyspace] Stopping keyspace monitoring for socket ${socket.id}`);
      
      // Emit stopped event
      socket.emit('keyspace-stopped', { 
        reason: 'manual',
        message: 'Keyspace monitoring stopped by user'
      });
      
      // Cleanup keyspace client
      cleanupKeyspace(socket.id);
    } catch (error) {
      console.error('[Keyspace] Error in stop-keyspace-events handler:', error);
      socket.emit('keyspace-error', { 
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
      const keyspaceClient = keyspaceClients.get(socket.id);
      
      if (!keyspaceClient) {
        return; // No active keyspace monitoring for this socket
      }

      console.log(`[Keyspace] Cleaning up keyspace monitoring for disconnected socket ${socket.id}`);
      
      // Cleanup keyspace client
      cleanupKeyspace(socket.id);
    } catch (error) {
      console.error('[Keyspace] Error in disconnect handler:', error);
    }
  });
}

/**
 * Cleanup keyspace client for a socket
 * Store cleanup handler in socket data
 * 
 * @param socketId - The socket ID to cleanup
 */
function cleanupKeyspace(socketId: string): void {
  // Unsubscribe and quit keyspace client
  const keyspaceClient = keyspaceClients.get(socketId);
  if (keyspaceClient) {
    keyspaceClients.delete(socketId);
    
    // Unsubscribe from all patterns
    keyspaceClient.punsubscribe().catch((error) => {
      console.error(`[Keyspace] Error unsubscribing for socket ${socketId}:`, error);
    });
    
    // Quit the client
    keyspaceClient.quit().catch((error) => {
      console.error(`[Keyspace] Error quitting keyspace client for socket ${socketId}:`, error);
      // Force disconnect if quit fails
      try {
        keyspaceClient.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    });
  }
}
