/**
 * Socket.io Client
 * 
 * Provides real-time communication with the backend Socket.io server.
 * Handles JWT authentication, monitor streaming, and pub/sub messaging.
 */

import { io, Socket } from 'socket.io-client';

// Socket.io client instance
let socket: Socket | null = null;

// Connection state
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY = 1000; // 1 second

/**
 * Get JWT token from localStorage
 */
function getToken(): string | null {
  return localStorage.getItem('jwt');
}

/**
 * Calculate exponential backoff delay
 */
function getReconnectDelay(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, max 60s
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), 60000);
  return delay;
}

/**
 * Connect to Socket.io server
 */
export function connect(): Socket {
  // Return existing socket if already connected
  if (socket && socket.connected) {
    return socket;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    return socket!;
  }

  isConnecting = true;

  // Get JWT token from localStorage
  const token = getToken();

  if (!token) {
    console.error('[Socket] No JWT token found in localStorage');
    isConnecting = false;
    throw new Error('Authentication token required');
  }

  // Initialize Socket.io client
  // Use relative URL when VITE_API_URL is not set (for reverse proxy deployment)
  // This enables same-domain WebSocket connections through nginx reverse proxy
  const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
  
  socket = io(socketUrl, {
    auth: {
      token, // Send JWT token in auth handshake
    },
    autoConnect: true,
    reconnection: false, // We'll handle reconnection manually with exponential backoff
  });

  // Handle successful connection
  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket!.id);
    isConnecting = false;
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  });

  // Handle connection errors
  socket.on('connect_error', (error) => { 
    console.error('[Socket] Connection error:', error.message);
    isConnecting = false;

    // If authentication fails, don't attempt to reconnect
    if (error.message.includes('Authentication') || error.message.includes('token')) {
      console.error('[Socket] Authentication failed, not attempting reconnection');
      return;
    }

    // Attempt reconnection with exponential backoff
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = getReconnectDelay();
      console.log(`[Socket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      
      setTimeout(() => {
        reconnectAttempts++;
        connect();
      }, delay);
    } else {
      console.error('[Socket] Max reconnection attempts reached');
    }
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    isConnecting = false;

    // Attempt reconnection if disconnection was not intentional
    if (reason === 'io server disconnect') {
      // Server disconnected the socket, don't reconnect automatically
      console.log('[Socket] Server disconnected, not attempting reconnection');
    } else if (reason === 'io client disconnect') {
      // Client disconnected intentionally, don't reconnect
      console.log('[Socket] Client disconnected intentionally');
    } else {
      // Unexpected disconnection, attempt reconnection
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = getReconnectDelay();
        console.log(`[Socket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        
        setTimeout(() => {
          reconnectAttempts++;
          connect();
        }, delay);
      }
    }
  });

  return socket;
}

/**
 * Disconnect from Socket.io server
 */
export function disconnect(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnecting = false;
    reconnectAttempts = 0;
  }
}

/**
 * Get current socket instance
 */
export function getSocket(): Socket | null {
  return socket;
}

/**
 * Check if socket is connected
 */
export function isConnected(): boolean {
  return socket !== null && socket.connected;
}

// ============================================================================
// Monitor Methods
// ============================================================================

/**
 * Start Redis MONITOR streaming
 * 
 * @param connectionId - The Redis connection ID
 * @param db - The Redis database number (default: 0)
 */
export function startMonitor(connectionId: number, db: number = 0): void {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('monitor:start', { connectionId, db });
}

/**
 * Stop Redis MONITOR streaming
 */
export function stopMonitor(): void {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('monitor:stop');
}

/**
 * Listen for monitor data events
 * 
 * @param callback - Callback function to handle monitor data
 * @returns Cleanup function to remove the listener
 */
export function onMonitorData(
  callback: (data: {
    timestamp: number;
    command: string;
    source: string;
    database: string;
  }) => void
): () => void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.on('monitor:data', callback);

  // Return cleanup function
  return () => {
    if (socket) {
      socket.off('monitor:data', callback);
    }
  };
}

/**
 * Listen for monitor error events
 * 
 * @param callback - Callback function to handle monitor errors
 * @returns Cleanup function to remove the listener
 */
export function onMonitorError(
  callback: (data: { message: string }) => void
): () => void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.on('monitor:error', callback);

  // Return cleanup function
  return () => {
    if (socket) {
      socket.off('monitor:error', callback);
    }
  };
}

// ============================================================================
// Pub/Sub Methods
// ============================================================================

/**
 * Subscribe to a Redis Pub/Sub channel
 * 
 * @param connectionId - The Redis connection ID
 * @param channel - The channel name to subscribe to
 * @param db - The Redis database number (default: 0)
 */
export function subscribe(connectionId: number, channel: string, db: number = 0): void {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('pubsub:subscribe', { connectionId, channel, db });
}

/**
 * Unsubscribe from a Redis Pub/Sub channel
 * 
 * @param channel - The channel name to unsubscribe from
 */
export function unsubscribe(channel: string): void {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('pubsub:unsubscribe', { channel });
}

/**
 * Publish a message to a Redis Pub/Sub channel
 * 
 * @param connectionId - The Redis connection ID
 * @param channel - The channel name to publish to
 * @param message - The message to publish
 * @param db - The Redis database number (default: 0)
 */
export function publish(
  connectionId: number,
  channel: string,
  message: string,
  db: number = 0
): void {
  if (!socket || !socket.connected) {
    throw new Error('Socket not connected');
  }

  socket.emit('pubsub:publish', { connectionId, channel, message, db });
}

/**
 * Listen for Pub/Sub message events
 * 
 * @param callback - Callback function to handle Pub/Sub messages
 * @returns Cleanup function to remove the listener
 */
export function onPubSubMessage(
  callback: (data: { channel: string; message: string }) => void
): () => void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.on('pubsub:message', callback);

  // Return cleanup function
  return () => {
    if (socket) {
      socket.off('pubsub:message', callback);
    }
  };
}

/**
 * Listen for Pub/Sub error events
 * 
 * @param callback - Callback function to handle Pub/Sub errors
 * @returns Cleanup function to remove the listener
 */
export function onPubSubError(
  callback: (data: { message: string }) => void
): () => void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.on('pubsub:error', callback);

  // Return cleanup function
  return () => {
    if (socket) {
      socket.off('pubsub:error', callback);
    }
  };
}

/**
 * Listen for Pub/Sub published confirmation events
 * 
 * @param callback - Callback function to handle publish confirmations
 * @returns Cleanup function to remove the listener
 */
export function onPubSubPublished(
  callback: (data: { channel: string; subscriberCount: number }) => void
): () => void {
  if (!socket) {
    throw new Error('Socket not initialized');
  }

  socket.on('pubsub:published', callback);

  // Return cleanup function
  return () => {
    if (socket) {
      socket.off('pubsub:published', callback);
    }
  };
}
