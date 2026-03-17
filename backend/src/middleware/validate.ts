/**
 * Validation Middleware
 * 
 * Provides request body validation using Zod schemas.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

/**
 * Validation middleware factory
 * 
 * Creates middleware that validates request data against a Zod schema.
 * For GET requests, validates req.query. For other methods, validates req.body.
 * Returns 400 with validation errors on failure.
 * 
 * @param schema - Zod schema to validate against
 * @returns Middleware function
 */
export function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Determine what to validate based on HTTP method
      const isGetRequest = req.method === 'GET';
      const dataToValidate = isGetRequest ? req.query : req.body;
      
      // For GET requests, query params come as strings and need type coercion
      let processedData = dataToValidate;
      if (isGetRequest) {
        processedData = coerceQueryParams(dataToValidate);
      }
      
      // Parse and validate request data
      const validated = schema.parse(processedData);
      
      // Replace the appropriate property with validated data (ensures type safety)
      if (isGetRequest) {
        req.query = validated as any;
      } else {
        req.body = validated;
      }
      
      next();
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors,
        });
        return;
      }
      
      // Handle unexpected errors
      res.status(400).json({
        success: false,
        error: 'Validation failed',
      });
    }
  };
}

/**
 * Coerce query parameter types
 * 
 * Query parameters are always strings. This function converts them to appropriate types
 * for validation (numbers, booleans, etc.)
 * 
 * @param query - Query parameters object
 * @returns Coerced query parameters
 */
function coerceQueryParams(query: any): any {
  if (!query || typeof query !== 'object') {
    return query;
  }
  
  const coerced: any = {};
  
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== 'string') {
      coerced[key] = value;
      continue;
    }
    
    // Try to coerce to number
    const numValue = Number(value);
    if (!isNaN(numValue) && value.trim() !== '') {
      coerced[key] = numValue;
      continue;
    }
    
    // Try to coerce to boolean
    if (value === 'true') {
      coerced[key] = true;
      continue;
    }
    if (value === 'false') {
      coerced[key] = false;
      continue;
    }
    
    // Keep as string
    coerced[key] = value;
  }
  
  return coerced;
}

/**
 * Common validation schemas
 */

// Connection ID schema
export const connectionIdSchema = z.object({
  connectionId: z.number().int().positive({
    message: 'Connection ID must be a positive integer',
  }),
});

// Database number schema (Redis supports 0-15 by default)
export const dbSchema = z.object({
  db: z.number().int().min(0).max(15).default(0),
});

// Key name schema
export const keySchema = z.object({
  key: z.string().min(1, {
    message: 'Key name cannot be empty',
  }),
});

// Scan parameters schema
export const scanSchema = z.object({
  connectionId: z.number().int().positive({
    message: 'Connection ID must be a positive integer',
  }),
  pattern: z.string().default('*'),
  cursor: z.string().default('0'),
  count: z.number().int().positive().default(100),
  db: z.number().int().min(0).max(15).default(0),
});
