/**
 * Authentication Middleware
 * 
 * Handles JWT token extraction, verification, and role-based access control.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService, JWTPayload } from '../services/auth.service';

/**
 * Extended Request interface with user payload
 */
export interface AuthRequest extends Request {
  user?: JWTPayload;
}

/**
 * Authentication middleware
 * 
 * Extracts JWT from Authorization header, verifies it, and attaches user to request.
 * Returns 401 if token is missing or invalid.
 */
export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({ 
        success: false, 
        error: 'Authorization header missing' 
      });
      return;
    }

    // Check Bearer format
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid authorization format. Expected: Bearer <token>' 
      });
      return;
    }

    const token = parts[1];

    // Verify token using AuthService
    const user = AuthService.verifyToken(token);
    
    // Attach user payload to request
    req.user = user;
    
    next();
  } catch (error) {
    // Return 401 for any token verification errors
    res.status(401).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Authentication failed' 
    });
  }
}

/**
 * Role-based access control middleware factory
 * 
 * Creates middleware that checks if authenticated user has required role.
 * Returns 403 if user doesn't have the required role.
 * 
 * @param role - Required role ('admin' or 'operator')
 * @returns Middleware function
 */
export function requireRole(role: 'admin' | 'operator') {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // User should be attached by authenticate middleware
    if (!req.user) {
      res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
      return;
    }

    // Check role hierarchy: admin has all permissions
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Check if user has required role
    if (req.user.role === role) {
      next();
      return;
    }

    // User doesn't have required role
    res.status(403).json({ 
      success: false, 
      error: `Access denied. Required role: ${role}` 
    });
  };
}
