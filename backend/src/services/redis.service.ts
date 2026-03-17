import Redis from 'ioredis';
import { db as database, get } from '../db';
import { CryptoService } from './crypto.service';

/**
 * Redis Connection Interface
 */
export interface RedisConnection {
  id: number;
  name: string;
  url: string;
  color?: string;
  isDefault: boolean;
  status?: string;
  latencyMs?: number;
  lastCheckedAt?: number;
}

/**
 * Connection Test Result
 */
export interface ConnectionTestResult {
  status: 'connected' | 'error';
  latencyMs?: number;
  error?: string;
}

/**
 * Redis Service
 * 
 * Manages Redis connection pool with lazy connection, automatic cleanup,
 * and health monitoring. Uses ioredis for Redis client instances.
 */
export class RedisService {
  private static clients: Map<number, Redis> = new Map();

  /**
   * Get or create a Redis client for the specified connection
   * 
   * @param connectionId - The database connection ID
   * @returns Redis client instance
   * @throws Error if connection not found or client creation fails
   */
  static async getClient(connectionId: number): Promise<Redis> {
    // Check if client already exists in pool
    const existingClient = this.clients.get(connectionId);
    if (existingClient) {
      // Verify client is still connected
      try {
        await existingClient.ping();
        return existingClient;
      } catch (error) {
        // Client is disconnected, remove from pool and create new one
        this.clients.delete(connectionId);
        try {
          await existingClient.quit();
        } catch {
          // Ignore quit errors
        }
      }
    }

    // Fetch connection from database
    const row = get<{
      id: number;
      name: string;
      url_encrypted: string;
      color: string | null;
      is_default: number;
    }>(
      'SELECT id, name, url_encrypted, color, is_default FROM connections WHERE id = ?',
      [connectionId]
    );

    if (!row) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    // Decrypt the connection URL
    let url: string;
    try {
      url = CryptoService.decrypt(row.url_encrypted);
    } catch (error) {
      throw new Error(`Failed to decrypt connection URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Create new ioredis client with configuration
    const client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      connectTimeout: 10000,
      commandTimeout: 10000,
      retryStrategy: (times: number) => {
        // Exponential backoff with max 2 seconds
        return Math.min(times * 50, 2000);
      },
      enableReadyCheck: true,
      enableOfflineQueue: false,
    });

    // Handle connection errors
    client.on('error', (error) => {
      console.error(`[Redis] Connection ${connectionId} error:`, error.message);
      // Remove from pool on error
      this.clients.delete(connectionId);
    });

    // Connect to Redis
    try {
      await client.connect();
    } catch (error) {
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Store in pool
    this.clients.set(connectionId, client);

    return client;
  }

  /**
   * Release (disconnect and remove) a Redis client from the pool
   * 
   * @param connectionId - The database connection ID
   */
  static async releaseClient(connectionId: number): Promise<void> {
    const client = this.clients.get(connectionId);
    
    if (client) {
      this.clients.delete(connectionId);
      
      try {
        await client.quit();
      } catch (error) {
        console.error(`[Redis] Error disconnecting client ${connectionId}:`, error);
        // Force disconnect if quit fails
        try {
          client.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
    }
  }

  /**
   * Test a Redis connection by executing PING and measuring latency
   * 
   * @param connectionId - The database connection ID
   * @param db - Optional database number to select (0-15)
   * @returns Connection test result with status and latency
   */
  static async testConnection(connectionId: number, db: number = 0): Promise<ConnectionTestResult> {
    let client: Redis | null = null;
    const startTime = Date.now();

    try {
      // Get client (will create if doesn't exist)
      client = await this.getClient(connectionId);

      // Select database if specified
      if (db > 0) {
        await client.select(db);
      }

      // Execute PING command
      const response = await client.ping();
      
      if (response !== 'PONG') {
        throw new Error('Unexpected PING response');
      }

      const latencyMs = Date.now() - startTime;

      // Update connection status in database
      database.prepare(
        'UPDATE connections SET status = ?, latency_ms = ?, last_checked_at = ? WHERE id = ?'
      ).run('connected', latencyMs, Date.now(), connectionId);

      return {
        status: 'connected',
        latencyMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Update connection status in database
      database.prepare(
        'UPDATE connections SET status = ?, last_checked_at = ? WHERE id = ?'
      ).run('error', Date.now(), connectionId);

      // Remove from pool on error
      if (client) {
        this.clients.delete(connectionId);
        try {
          await client.quit();
        } catch {
          // Ignore quit errors
        }
      }

      return {
        status: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Disconnect all Redis clients in the pool
   * Used during application shutdown
   */
  static async disconnectAll(): Promise<void> {
    const disconnectPromises: Promise<unknown>[] = [];

    for (const [connectionId, client] of this.clients.entries()) {
      disconnectPromises.push(
        client.quit().catch((error) => {
          console.error(`[Redis] Error disconnecting client ${connectionId}:`, error);
          // Force disconnect if quit fails
          try {
            client.disconnect();
          } catch {
            // Ignore disconnect errors
          }
        })
      );
    }

    await Promise.all(disconnectPromises);
    this.clients.clear();
    
    console.log('[Redis] All connections closed');
  }

  /**
   * Get the number of active connections in the pool
   * Useful for monitoring and debugging
   */
  static getPoolSize(): number {
    return this.clients.size;
  }

  /**
   * Check if a connection exists in the pool
   * 
   * @param connectionId - The database connection ID
   * @returns true if connection exists in pool
   */
  static hasConnection(connectionId: number): boolean {
    return this.clients.has(connectionId);
  }
}
