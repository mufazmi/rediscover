/**
 * Socket.io Server
 * 
 * Initializes Socket.io with HTTP server and implements JWT authentication.
 * Registers event handlers for real-time features (monitor, pub/sub).
 */

import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '../config';
import { AuthService, JWTPayload } from '../services/auth.service';
import { registerMonitorHandler } from '../handlers/monitor';
import { registerPubSubHandler } from '../handlers/pubsub';
import { registerProfilerHandler } from '../handlers/profiler';
import { registerKeyspaceHandler } from '../handlers/keyspace';

// Extend Socket.io socket data interface to include user payload
declare module 'socket.io' {
  interface SocketData {
    user?: JWTPayload;
  }
}

/**
 * Initialize Socket.io server with HTTP server
 * 
 * @param httpServer - The HTTP server instance
 * @returns Configured Socket.io server instance
 */
export function initSocketServer(httpServer: HTTPServer): SocketIOServer {
  // Initialize Socket.io with CORS configuration
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.frontendUrl,
      credentials: true,
    },
  });

  // Authentication middleware
  // Extract token from handshake.auth.token and verify using AuthService
  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify token using AuthService
      const user = AuthService.verifyToken(token);

      // Attach user payload to socket.data.user for access in handlers
      socket.data.user = user;

      next();
    } catch (error) {
      // Disconnect socket with error message if auth fails
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      next(new Error(errorMessage));
    }
  });

  // Handle socket connections
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}, user: ${socket.data.user?.username}`);

    // Register event handlers
    registerMonitorHandler(socket);
    registerPubSubHandler(socket);
    registerProfilerHandler(socket);
    registerKeyspaceHandler(socket);

    // Handle socket disconnection and cleanup
    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected: ${socket.id}, reason: ${reason}`);
      // Cleanup will be handled by individual handlers
    });
  });

  return io;
}
