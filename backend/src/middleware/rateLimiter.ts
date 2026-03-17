/**
 * Rate Limiter Middleware
 * 
 * Provides rate limiting for authentication endpoints to prevent brute force attacks.
 */

import rateLimit from 'express-rate-limit';

/**
 * Login rate limiter
 * 
 * Limits login attempts to 10 requests per 15 minutes per IP address.
 * Returns 429 with Retry-After header when limit is exceeded.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: 'Too many login attempts, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many login attempts, please try again later',
    });
  },
});

/**
 * Setup rate limiter
 * 
 * Limits setup attempts to 5 requests per 15 minutes per IP address.
 * Returns 429 with Retry-After header when limit is exceeded.
 */
export const setupRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many setup attempts, please try again later',
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many setup attempts, please try again later',
    });
  },
});
