/**
 * HTTP Server
 * 
 * Creates HTTP server with Express app, initializes Socket.io,
 * and implements graceful shutdown.
 * 
 */

import http from 'http';
import { app } from './app';
import { config } from './config';
import { initSocketServer } from './socket';
import { RedisService } from './services/redis.service';
import { db } from './db';

/**
 * Create HTTP server with Express app
 */
const httpServer = http.createServer(app);

/**
 * Initialize Socket.io server
 * 
 */
const io = initSocketServer(httpServer);

/**
 * Graceful shutdown handler
 * 
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n[Server] Received ${signal}, starting graceful shutdown...`);

  try {
    // 1. Stop accepting new connections
    httpServer.close(() => {
      console.log('[Server] HTTP server closed');
    });

    // 2. Close all Socket.io connections
    io.close(() => {
      console.log('[Server] Socket.io server closed');
    });

    // 3. Disconnect all Redis connections
    await RedisService.disconnectAll();
    console.log('[Server] All Redis connections closed');

    // 4. Close database connection
    db.close();
    console.log('[Server] Database connection closed');

    console.log('[Server] Graceful shutdown complete');
    
    // 5. Exit process
    process.exit(0);
  } catch (error) {
    console.error('[Server] Error during graceful shutdown:', error);
    process.exit(1);
  }
}

/**
 * Register signal handlers for graceful shutdown
 * 
 */
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

/**
 * Start the server
 */
function startServer(): void {
  httpServer.listen(config.port, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                                                            ║');
    console.log('║              🚀 Rediscover Backend Server                  ║');
    console.log('║                                                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] Listening on port ${config.port}`);
    console.log(`[Server] API available at http://localhost:${config.port}/api`);
    console.log(`[Server] Health check at http://localhost:${config.port}/api/health`);
    console.log(`[Server] Frontend URL: ${config.frontendUrl}`);
    console.log('');
    console.log('[Server] Press Ctrl+C to stop');
    console.log('');
  });
}

// Start the server
startServer();

