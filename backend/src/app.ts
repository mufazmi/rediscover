/**
 * Express Application
 * 
 * Configures Express middleware stack, mounts API routes, serves static files,
 * and implements error handling.
 *
 */

import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { attributionMiddleware } from './middleware/attribution';
import { proxyHeadersMiddleware } from './middleware/proxyHeaders';

// Import route modules
import authRoutes from './routes/auth';
import connectionRoutes from './routes/connections';
import keyRoutes from './routes/redis/keys';
import stringRoutes from './routes/redis/strings';
import hashRoutes from './routes/redis/hashes';
import listRoutes from './routes/redis/lists';
import setRoutes from './routes/redis/sets';
import zsetRoutes from './routes/redis/zsets';
import streamRoutes from './routes/redis/streams';
import serverRoutes from './routes/redis/server';
import cliRoutes from './routes/redis/cli';
import slowlogRoutes from './routes/redis/slowlog';
import memoryRoutes from './routes/redis/memory';
import aclRoutes from './routes/redis/acl';
import dbRoutes from './routes/redis/db';
import exportRoutes from './routes/redis/export';
import importRoutes from './routes/redis/import';
import diagnosticsRoutes from './routes/redis/diagnostics';
import clientsRoutes from './routes/redis/clients';
import configRoutes from './routes/redis/config';
import ttlRoutes from './routes/redis/ttl';
import searchRoutes from './routes/redis/search';
import healthRoutes from './routes/health';
import versionRoutes from './routes/version';
import proxyInfoRoutes from './routes/proxy-info';

/**
 * Create and configure Express application
 */
export const app = express();

/**
 * Middleware Stack (Order is critical)
 */

// 1. Helmet - Security headers
app.use(helmet());

// 2. CORS - Allow requests from frontend origin
const corsOrigin = config.frontendUrl;
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  optionsSuccessStatus: 200, // Support legacy browsers
}));

// 3. Proxy Headers - Handle nginx proxy headers for client identification
app.use(proxyHeadersMiddleware);

// 4. Attribution - Add author attribution headers to all responses
app.use(attributionMiddleware);

// 5. JSON body parser with size limit
app.use(express.json({ limit: '10mb' }));

/**
 * API Routes
 * 
 * All API routes are mounted at /api prefix
 */

// Authentication routes
app.use('/api/auth', authRoutes);

// Connection management routes
app.use('/api/connections', connectionRoutes);

// Redis key management routes
app.use('/api/keys', keyRoutes);

// Redis data type routes
app.use('/api/string', stringRoutes);
app.use('/api/hash', hashRoutes);
app.use('/api/list', listRoutes);
app.use('/api/set', setRoutes);
app.use('/api/zset', zsetRoutes);
app.use('/api/stream', streamRoutes);

// Redis data type CRUD routes (new spec endpoints)
app.use('/api/redis/strings', stringRoutes);
app.use('/api/redis/hashes', hashRoutes);
app.use('/api/redis/lists', listRoutes);
app.use('/api/redis/sets', setRoutes);
app.use('/api/redis/zsets', zsetRoutes);
app.use('/api/redis/streams', streamRoutes);
app.use('/api/redis/keys', keyRoutes);

// Redis server management routes
app.use('/api/server', serverRoutes);
app.use('/api/cli', cliRoutes);
app.use('/api/slowlog', slowlogRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/acl', aclRoutes);
app.use('/api/db', dbRoutes);

// Redis diagnostics routes
app.use('/api/redis/diagnostics', diagnosticsRoutes);

// Redis clients routes
app.use('/api/redis/clients', clientsRoutes);

// Redis config routes
app.use('/api/redis/config', configRoutes);

// Redis TTL routes
app.use('/api/redis/ttl', ttlRoutes);

// Redis search routes
app.use('/api/redis/search', searchRoutes);

// Export/Import routes
app.use('/api/export', exportRoutes);
app.use('/api/import', importRoutes);

// Health check route
app.use('/api/health', healthRoutes);

// Version check routes
app.use('/api/version', versionRoutes);

// Proxy information routes (for testing and debugging)
app.use('/api/proxy-info', proxyInfoRoutes);

/**
 * Static File Serving
 * 
 * Serve frontend static files from /dist directory in production
 */
if (config.nodeEnv === 'production') {
  const distPath = path.join(__dirname, '..', '..', 'dist');
  
  // Serve static files
  app.use(express.static(distPath));
  
  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

/**
 * 404 Handler for undefined API routes
 * 
 */
app.use('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found',
  });
});

/**
 * Error Handler Middleware
 * 
 * MUST be last middleware in the stack
 */
app.use(errorHandler);

