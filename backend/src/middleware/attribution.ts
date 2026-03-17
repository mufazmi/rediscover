/**
 * HTTP Attribution Middleware
 * 
 * Express middleware that adds professional author attribution headers to all HTTP responses.
 * This middleware injects X-Powered-By and X-Author headers for network traffic analysis
 * and security auditing while maintaining non-intrusive operation.
 * 
 * @author Umair Farooqui
 * @github mufazmi
 */

import { Request, Response, NextFunction } from 'express';
import { getAttributionHeaders } from '../config/author';

/**
 * Attribution headers interface for type safety
 */
export interface AttributionHeaders {
  'X-Powered-By': string;
  'X-Author': string;
}

/**
 * HTTP Attribution Middleware
 * 
 * Adds author attribution headers to all API responses for network traffic analysis
 * and security auditing. The middleware operates non-intrusively and does not
 * interfere with existing security headers or application functionality.
 * 
 * Headers added:
 * - X-Powered-By: "Rediscover by Umair Farooqui (mufazmi)"
 * - X-Author: "Umair Farooqui"
 * 
 * @param req Express request object
 * @param res Express response object  
 * @param next Express next function
 */
export function attributionMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Get attribution headers from centralized author constants
    const headers = getAttributionHeaders();
    
    // Set attribution headers without overriding existing headers
    res.setHeader('X-Powered-By', headers['X-Powered-By']);
    res.setHeader('X-Author', headers['X-Author']);
    
  } catch (error) {
    // Log error but continue - attribution failures should never block requests
    console.warn('[Attribution] Failed to set attribution headers:', error);
  }
  
  // Always call next() to continue the middleware chain
  next();
}

/**
 * Get attribution headers for testing and validation
 * 
 * @returns Attribution headers object
 */
export function getExpectedHeaders(): AttributionHeaders {
  return getAttributionHeaders();
}