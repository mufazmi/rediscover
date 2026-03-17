/**
 * Proxy Headers Middleware
 * 
 * Handles proxy headers sent by nginx reverse proxy for proper client identification.
 * Extracts real client IP from X-Forwarded-For and X-Real-IP headers.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Extended Request interface with proxy header information
 */
export interface ProxyRequest extends Request {
  clientIp?: string;
  realIp?: string;
  forwardedFor?: string;
  forwardedProto?: string;
  originalHost?: string;
}

/**
 * Extract real client IP from proxy headers
 * 
 * Priority order:
 * 1. X-Real-IP (most reliable for single proxy)
 * 2. First IP in X-Forwarded-For (for multiple proxies)
 * 3. req.ip (Express default)
 * 4. req.connection.remoteAddress (fallback)
 */
function extractClientIp(req: Request): string {
  // Check X-Real-IP header (set by nginx)
  const realIp = req.get('X-Real-IP');
  if (realIp) {
    return realIp;
  }

  // Check X-Forwarded-For header (comma-separated list of IPs)
  const forwardedFor = req.get('X-Forwarded-For');
  if (forwardedFor) {
    // Take the first IP (original client)
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // Fallback to Express default IP detection
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Proxy headers middleware
 * 
 * Processes proxy headers and adds client identification information to the request object.
 * Also logs requests with real client IP information.
 */
export function proxyHeadersMiddleware(req: ProxyRequest, _res: Response, next: NextFunction): void {
  // Extract proxy header information
  req.realIp = req.get('X-Real-IP');
  req.forwardedFor = req.get('X-Forwarded-For');
  req.forwardedProto = req.get('X-Forwarded-Proto');
  req.originalHost = req.get('Host');
  
  // Determine the real client IP
  req.clientIp = extractClientIp(req);

  // Log request with real client information
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl || req.url;
  const userAgent = req.get('User-Agent') || 'unknown';
  
  // Create log entry with proxy information
  const logParts = [
    `[${timestamp}]`,
    `${req.clientIp}`,
    `"${method} ${url}"`,
    `"${userAgent}"`
  ];

  // Add proxy information if available
  if (req.realIp || req.forwardedFor) {
    const proxyInfo = [];
    if (req.realIp) proxyInfo.push(`real-ip=${req.realIp}`);
    if (req.forwardedFor) proxyInfo.push(`forwarded-for=${req.forwardedFor}`);
    if (req.forwardedProto) proxyInfo.push(`proto=${req.forwardedProto}`);
    
    logParts.push(`proxy=[${proxyInfo.join(', ')}]`);
  }

  console.log(`[Request] ${logParts.join(' ')}`);

  next();
}

/**
 * Get client IP from request (utility function)
 * 
 * Can be used in route handlers to get the real client IP
 */
export function getClientIp(req: ProxyRequest): string {
  return req.clientIp || extractClientIp(req);
}

/**
 * Check if request came through proxy
 */
export function isProxiedRequest(req: ProxyRequest): boolean {
  return !!(req.realIp || req.forwardedFor);
}

/**
 * Get proxy information for logging/debugging
 */
export function getProxyInfo(req: ProxyRequest): {
  clientIp: string;
  realIp?: string;
  forwardedFor?: string;
  forwardedProto?: string;
  originalHost?: string;
  isProxied: boolean;
} {
  return {
    clientIp: req.clientIp || extractClientIp(req),
    realIp: req.realIp,
    forwardedFor: req.forwardedFor,
    forwardedProto: req.forwardedProto,
    originalHost: req.originalHost,
    isProxied: isProxiedRequest(req)
  };
}