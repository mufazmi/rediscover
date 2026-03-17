/**
 * Health Check Route
 * 
 * Provides a simple health check endpoint for monitoring and load balancers.
 * No authentication required.
 */

import { Router, Request, Response } from 'express';
import versionService from '../services/version.service';
import { getAuthorInfo } from '../config/author';

const router = Router();

/**
 * GET /api/health
 * 
 * Health check endpoint that returns server status, uptime, and timestamp.
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const versionInfo = versionService.getCurrentVersion();
    const authorInfo = getAuthorInfo();
    
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: versionInfo.version,
      nodeVersion: versionInfo.nodeVersion,
      platform: versionInfo.platform,
      author: {
        name: authorInfo.name,
        githubUsername: authorInfo.githubUsername,
        website: authorInfo.website,
      },
    });
  } catch (error) {
    console.warn('[Attribution] Failed to include author in health response:', error);
    // Return health response without author info to maintain functionality
    const versionInfo = versionService.getCurrentVersion();
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
      version: versionInfo.version,
      nodeVersion: versionInfo.nodeVersion,
      platform: versionInfo.platform,
    });
  }
});

export default router;

