/**
 * Authentication Routes
 * 
 * Handles user authentication, setup, and profile endpoints.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';
import { db, isFirstRun } from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginRateLimiter, setupRateLimiter } from '../middleware/rateLimiter';

const router = Router();

/**
 * Validation schemas
 */

// Setup/Login credentials schema
const credentialsSchema = z.object({
  username: z.string().min(1, 'Username is required').max(50),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * GET /api/auth/setup
 * 
 * Check if initial setup is needed (no users exist).
 */
router.get('/setup', (_req: Request, res: Response) => {
  try {
    const needsSetup = isFirstRun();
    
    res.json({
      success: true,
      data: { needsSetup },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to check setup status',
    });
  }
});

/**
 * POST /api/auth/setup
 * 
 * Create the initial admin user. Only works when no users exist.
 */
router.post(
  '/setup',
  setupRateLimiter,
  validate(credentialsSchema),
  async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Check if setup is still needed
      if (!isFirstRun()) {
        res.status(400).json({
          success: false,
          error: 'Setup already completed',
        });
        return;
      }

      // Hash password
      const hashedPassword = await AuthService.hashPassword(password);

      // Create admin user
      const result = db.prepare(`
        INSERT INTO users (username, password, role, created_at)
        VALUES (?, ?, 'admin', ?)
      `).run(username, hashedPassword, Date.now());

      const userId = result.lastInsertRowid as number;

      // Generate JWT token
      const token = AuthService.generateToken({
        userId,
        username,
        role: 'admin',
      });

      res.json({
        success: true,
        data: { token },
      });
    } catch (error) {
      console.error('[Auth] Setup error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create admin user',
      });
    }
  }
);

/**
 * POST /api/auth/login
 * 
 * Authenticate user with username and password.
 */
router.post(
  '/login',
  loginRateLimiter,
  validate(credentialsSchema),
  async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;

      // Fetch user from database
      const user = db.prepare(`
        SELECT id, username, password, role
        FROM users
        WHERE username = ?
      `).get(username) as { id: number; username: string; password: string; role: 'admin' | 'operator' } | undefined;

      // Check if user exists
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
        return;
      }

      // Compare password
      const isValid = await AuthService.comparePassword(password, user.password);

      if (!isValid) {
        res.status(401).json({
          success: false,
          error: 'Invalid credentials',
        });
        return;
      }

      // Generate JWT token
      const token = AuthService.generateToken({
        userId: user.id,
        username: user.username,
        role: user.role,
      });

      res.json({
        success: true,
        data: { token },
      });
    } catch (error) {
      console.error('[Auth] Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed',
      });
    }
  }
);

/**
 * GET /api/auth/me
 * 
 * Get current authenticated user information.
 */
router.get('/me', authenticate, (req: AuthRequest, res: Response) => {
  try {
    // User is attached by authenticate middleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: req.user.userId,
        username: req.user.username,
        role: req.user.role,
      },
    });
  } catch (error) {
    console.error('[Auth] Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information',
    });
  }
});

export default router;
