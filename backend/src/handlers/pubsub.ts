/**
 * Pub/Sub Handler
 * 
 * Handles real-time Redis Pub/Sub streaming via Socket.io.
 * Creates dedicated Redis clients for subscriptions and streams messages to clients.
 */

import { Socket } from 'socket.io';
import Redis from 'ioredis';
import { get } from '../db';
import { CryptoService } from '../services/crypto.service';

// Store subscription clients per socket
// Each socket can have one subscription client with multiple channels
const subscriptionClients = new Map<string, {
  client: Redis;
  channels: Set<string>;
}>();

/**
 * Register Pub/Sub event handlers for a socket
 * 
 * @param socket - The Socket.io socket instance
 */
export function registerPubSubHandler(socket: Socket): void {
  /**
   * Handle pubsub:subscribe event
   * Creates a dedicated Redis client for subscription (if not exists) and subscribes to a channel
   */
  socket.on('pubsub:subscribe', async (data: { connectionId: number; channel: string; db?: number }) => {
    try {
      const { connectionId, channel, db = 0 } = data;

      if (!channel) {
        socket.emit('pubsub:error', { message: 'Channel name is required' });
        return;
      }

      // Check if we already have a subscription client for this socket
      let subscriptionData = subscriptionClients.get(socket.id);

      if (!subscriptionData) {
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
          socket.emit('pubsub:error', { message: `Connection ${connectionId} not found` });
          return;
        }

        // Decrypt the connection URL
        let url: string;
        try {
          url = CryptoService.decrypt(row.url_encrypted);
        } catch (error) {
          socket.emit('pubsub:error', { 
            message: `Failed to decrypt connection URL: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
          return;
        }

        // Create dedicated ioredis client for subscription
        // SUBSCRIBE command requires a dedicated connection (cannot be pooled)
        // Subscription client cannot execute other commands while subscribed
        const subscriptionClient = new Redis(url, {
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
        subscriptionClient.on('error', (error) => {
          console.error(`[PubSub] Connection ${connectionId} error:`, error.message);
          socket.emit('pubsub:error', { message: error.message });
          
          // Cleanup on error
          subscriptionClients.delete(socket.id);
          subscriptionClient.quit().catch(() => {
            // Ignore quit errors
          });
        });

        // Connect to Redis
        try {
          await subscriptionClient.connect();
        } catch (error) {
          socket.emit('pubsub:error', { 
            message: `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}` 
          });
          return;
        }

        // Select database if not default (db 0)
        if (db !== 0) {
          try {
            await subscriptionClient.select(db);
          } catch (error) {
            socket.emit('pubsub:error', { 
              message: `Failed to select database ${db}: ${error instanceof Error ? error.message : 'Unknown error'}` 
            });
            await subscriptionClient.quit();
            return;
          }
        }

        // Listen for message events from ioredis
        // The 'message' event is emitted when a message is published to a subscribed channel
        subscriptionClient.on('message', (receivedChannel: string, message: string) => {
          // Emit pubsub:message event to client with channel and message
          socket.emit('pubsub:message', {
            channel: receivedChannel,
            message,
          });
        });

        // Store subscription client reference and initialize channels set
        subscriptionData = {
          client: subscriptionClient,
          channels: new Set<string>(),
        };
        subscriptionClients.set(socket.id, subscriptionData);
      }

      // Subscribe to the channel
      try {
        await subscriptionData.client.subscribe(channel);
        subscriptionData.channels.add(channel);
        console.log(`[PubSub] Socket ${socket.id} subscribed to channel: ${channel}`);
      } catch (error) {
        socket.emit('pubsub:error', { 
          message: `Failed to subscribe to channel ${channel}: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    } catch (error) {
      console.error('[PubSub] Error in pubsub:subscribe handler:', error);
      socket.emit('pubsub:error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle pubsub:unsubscribe event
   * Unsubscribes from a channel and cleans up client if no more subscriptions
   */
  socket.on('pubsub:unsubscribe', async (data: { channel: string }) => {
    try {
      const { channel } = data;

      if (!channel) {
        socket.emit('pubsub:error', { message: 'Channel name is required' });
        return;
      }

      const subscriptionData = subscriptionClients.get(socket.id);
      
      if (!subscriptionData) {
        return; // No active subscriptions for this socket
      }

      // Unsubscribe from the channel
      try {
        await subscriptionData.client.unsubscribe(channel);
        subscriptionData.channels.delete(channel);
        console.log(`[PubSub] Socket ${socket.id} unsubscribed from channel: ${channel}`);

        // If no more subscriptions, cleanup the client
        if (subscriptionData.channels.size === 0) {
          subscriptionClients.delete(socket.id);
          await subscriptionData.client.quit();
          console.log(`[PubSub] Cleaned up subscription client for socket ${socket.id} (no more channels)`);
        }
      } catch (error) {
        socket.emit('pubsub:error', { 
          message: `Failed to unsubscribe from channel ${channel}: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      }
    } catch (error) {
      console.error('[PubSub] Error in pubsub:unsubscribe handler:', error);
      socket.emit('pubsub:error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle pubsub:publish event
   * Publishes a message to a channel using a regular Redis client (not subscription client)
   */
  socket.on('pubsub:publish', async (data: { connectionId: number; channel: string; message: string; db?: number }) => {
    try {
      const { connectionId, channel, message, db = 0 } = data;

      if (!channel) {
        socket.emit('pubsub:error', { message: 'Channel name is required' });
        return;
      }

      if (message === undefined || message === null) {
        socket.emit('pubsub:error', { message: 'Message is required' });
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
        socket.emit('pubsub:error', { message: `Connection ${connectionId} not found` });
        return;
      }

      // Decrypt the connection URL
      let url: string;
      try {
        url = CryptoService.decrypt(row.url_encrypted);
      } catch (error) {
        socket.emit('pubsub:error', { 
          message: `Failed to decrypt connection URL: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
        return;
      }

      // Create a regular Redis client for PUBLISH command
      // PUBLISH command should NOT use the subscription client
      const publishClient = new Redis(url, {
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

      try {
        // Connect to Redis
        await publishClient.connect();

        // Select database if not default (db 0)
        if (db !== 0) {
          await publishClient.select(db);
        }

        // Execute PUBLISH command
        const subscriberCount = await publishClient.publish(channel, message);
        console.log(`[PubSub] Published message to channel ${channel}, ${subscriberCount} subscribers received it`);

        // Return success response
        socket.emit('pubsub:published', {
          channel,
          subscriberCount,
        });
      } catch (error) {
        socket.emit('pubsub:error', { 
          message: `Failed to publish message: ${error instanceof Error ? error.message : 'Unknown error'}` 
        });
      } finally {
        // Always cleanup the publish client
        try {
          await publishClient.quit();
        } catch {
          // Ignore quit errors
        }
      }
    } catch (error) {
      console.error('[PubSub] Error in pubsub:publish handler:', error);
      socket.emit('pubsub:error', { 
        message: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  /**
   * Handle socket disconnect event
   * Cleanup subscription client if active
   */
  socket.on('disconnect', async () => {
    try {
      const subscriptionData = subscriptionClients.get(socket.id);
      
      if (!subscriptionData) {
        return; // No active subscriptions for this socket
      }

      // Remove from map
      subscriptionClients.delete(socket.id);

      // Execute QUIT to unsubscribe from all channels and disconnect
      try {
        await subscriptionData.client.quit();
        console.log(`[PubSub] Cleaned up subscription client for disconnected socket ${socket.id}`);
      } catch (error) {
        console.error(`[PubSub] Error cleaning up subscription client for socket ${socket.id}:`, error);
        // Force disconnect if quit fails
        try {
          subscriptionData.client.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    } catch (error) {
      console.error('[PubSub] Error in disconnect handler:', error);
    }
  });
}
