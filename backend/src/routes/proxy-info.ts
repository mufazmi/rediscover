/**
 * Proxy Information Routes
 * 
 * Provides endpoints to inspect proxy header information for testing and debugging.
 * This is useful for verifying that nginx proxy headers are being received correctly.
 */

import { Router, Response } from 'express';
import { ProxyRequest, getClientIp, isProxiedRequest, getProxyInfo } from '../middleware/proxyHeaders';

const router = Router();

/**
 * GET /api/proxy-info
 * 
 * Returns detailed proxy header information for the current request.
 * Useful for testing and debugging proxy configuration.
 */
router.get('/', (req: ProxyRequest, res: Response) => {
  try {
    const proxyInfo = getProxyInfo(req);
    
    res.json({
      success: true,
      data: {
        clientIp: getClientIp(req),
        isProxied: isProxiedRequest(req),
        headers: {
          realIp: req.realIp,
          forwardedFor: req.forwardedFor,
          forwardedProto: req.forwardedProto,
          originalHost: req.originalHost,
          userAgent: req.get('User-Agent'),
          host: req.get('Host')
        },
        proxyInfo,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get proxy information',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;