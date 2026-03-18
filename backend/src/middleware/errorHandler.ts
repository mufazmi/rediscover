/**
 * Error Handler Middleware
 * 
 * Centralized error handling for all route handlers.
 * Catches errors, logs them, and returns standardized JSON responses.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Custom error classes for different error types
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class RedisConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RedisConnectionError';
  }
}

/**
 * Error handler middleware
 * 
 * Catches all errors from route handlers, logs them, and returns standardized responses.
 * Maps error types to appropriate HTTP status codes.
 * 
 * @param err - Error object
 * @param req - Express request
 * @param res - Express response
 * @param next - Express next function
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error message and stack trace to console
  console.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Map error types to HTTP status codes
  let statusCode = 500;
  let errorMessage = err.message || 'Internal server error';

  if (err instanceof ZodError) {
    // Zod validation errors → 400
    statusCode = 400;
    errorMessage = 'Validation failed';
  } else if (err instanceof ValidationError) {
    // Custom validation errors → 400
    statusCode = 400;
  } else if (err instanceof AuthenticationError) {
    // Authentication errors → 401
    statusCode = 401;
  } else if (err instanceof AuthorizationError) {
    // Authorization errors → 403
    statusCode = 403;
  } else if (err instanceof NotFoundError) {
    // Not found errors → 404
    statusCode = 404;
  } else if (err instanceof RedisConnectionError) {
    // Redis connection errors → 503
    statusCode = 503;
  }

  // Return JSON response with error message
  res.status(statusCode).json({
    success: false,
    error: errorMessage,
  });
}
