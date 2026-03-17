/**
 * Global Search Routes
 * 
 * Handles Redis global search across key names and values.
 * Supports searching by key names using SCAN with MATCH pattern,
 * and searching by values with type-specific inspection.
 * 
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { RedisService } from '../../services/redis.service';
import { authenticate, AuthRequest } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const router = Router();

/**
 * Search result interface
 */
interface SearchResult {
  key: string;
  type: string;
  db: number;
  matchType: 'name' | 'value';
  matchLocation?: string;
}

/**
 * Validation schema for search request
 */
const searchSchema = z.object({
  connectionId: z.number().int().positive(),
  query: z.string().min(1),
  mode: z.enum(['names', 'values', 'both']),
  typeFilters: z.array(z.string()).optional(),
  dbFilter: z.number().int().min(0).max(15).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().positive().max(1000).default(100),
});

/**
 * POST /api/redis/search
 * 
 * Searches for keys by name and/or value across Redis databases.
 * 
 */
router.post(
  '/',
  authenticate,
  validate(searchSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { 
        connectionId, 
        query, 
        mode, 
        typeFilters, 
        dbFilter, 
        cursor: inputCursor, 
        limit 
      } = req.body;

      // Get Redis client
      const client = await RedisService.getClient(connectionId);

      const results: SearchResult[] = [];
      const resultKeys = new Set<string>(); // For deduplication in 'both' mode
      let nextCursor: string | null = inputCursor || '0';

      // Determine which databases to search
      const databasesToSearch = dbFilter !== undefined ? [dbFilter] : [0]; // Default to db 0 if not specified

      for (const dbNumber of databasesToSearch) {
        // Select database
        if (dbNumber !== 0) {
          await client.select(dbNumber);
        }

        // Search by key names
        if (mode === 'names' || mode === 'both') {
          const nameResults = await searchByKeyNames(
            client,
            query,
            typeFilters,
            dbNumber,
            nextCursor || '0',
            limit
          );
          
          for (const result of nameResults.results) {
            if (!resultKeys.has(result.key)) {
              results.push(result);
              resultKeys.add(result.key);
            }
          }
          
          nextCursor = nameResults.cursor;
        }

        // Search by values
        if (mode === 'values' || mode === 'both') {
          const valueResults = await searchByValues(
            client,
            query,
            typeFilters,
            dbNumber,
            limit
          );
          
          for (const result of valueResults) {
            if (!resultKeys.has(result.key)) {
              results.push(result);
              resultKeys.add(result.key);
            }
          }
        }

        // Limit results to requested limit
        if (results.length >= limit) {
          break;
        }
      }

      // Determine if there are more results
      const hasMore = nextCursor !== '0' && nextCursor !== null;

      res.json({
        success: true,
        data: {
          results: results.slice(0, limit),
          cursor: hasMore ? nextCursor : null,
          hasMore,
        },
      });
    } catch (error) {
      console.error('[Search] Search error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search Redis',
      });
    }
  }
);

/**
 * Search by key names using SCAN with MATCH pattern
 * Requirement 7.3: Use SCAN with MATCH pattern for name search
 */
async function searchByKeyNames(
  client: any,
  query: string,
  typeFilters: string[] | undefined,
  dbNumber: number,
  cursor: string,
  limit: number
): Promise<{ results: SearchResult[]; cursor: string }> {
  const results: SearchResult[] = [];
  const pattern = `*${query}*`;
  
  // Use SCAN with MATCH pattern
  const scanResult = await client.scan(cursor, 'MATCH', pattern, 'COUNT', limit);
  const [nextCursor, keys] = scanResult;

  // Get type for each key and filter if needed
  for (const key of keys) {
    try {
      const type = await client.type(key);
      
      // Apply type filter if specified
      if (typeFilters && typeFilters.length > 0) {
        if (!typeFilters.includes(type)) {
          continue;
        }
      }

      results.push({
        key,
        type,
        db: dbNumber,
        matchType: 'name',
      });

      if (results.length >= limit) {
        break;
      }
    } catch (error) {
      // Key might have been deleted, continue
      console.warn(`[Search] Failed to get type for key ${key}:`, error);
    }
  }

  return {
    results,
    cursor: nextCursor,
  };
}

/**
 * Search by values with type-specific inspection
 */
async function searchByValues(
  client: any,
  query: string,
  typeFilters: string[] | undefined,
  dbNumber: number,
  limit: number
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  let scannedCount = 0;
  const maxKeysToScan = 1000; // Requirement 7.9: Limit to 1000 keys per db

  // Use SCAN to iterate keys
  let cursor = '0';
  do {
    const scanResult = await client.scan(cursor, 'COUNT', 100);
    const [nextCursor, keys] = scanResult;
    cursor = nextCursor;

    for (const key of keys) {
      scannedCount++;
      
      // Stop if we've scanned too many keys
      if (scannedCount > maxKeysToScan) {
        return results;
      }

      try {
        const type = await client.type(key);

        // Apply type filter if specified
        if (typeFilters && typeFilters.length > 0) {
          if (!typeFilters.includes(type)) {
            continue;
          }
        }

        // Search based on type
        const match = await searchValueByType(client, key, type, query);
        
        if (match) {
          results.push({
            key,
            type,
            db: dbNumber,
            matchType: 'value',
            matchLocation: match.location,
          });

          if (results.length >= limit) {
            return results;
          }
        }
      } catch (error) {
        // Key might have been deleted or error accessing, continue
        console.warn(`[Search] Failed to search value for key ${key}:`, error);
      }
    }
  } while (cursor !== '0' && scannedCount < maxKeysToScan);

  return results;
}

/**
 * Search value by type with type-specific commands
 */
async function searchValueByType(
  client: any,
  key: string,
  type: string,
  query: string
): Promise<{ location?: string } | null> {
  const lowerQuery = query.toLowerCase();

  try {
    switch (type) {
      case 'string': {
        // Requirement 7.10: Use GET for STRING values
        const value = await client.get(key);
        if (value && value.toLowerCase().includes(lowerQuery)) {
          return { location: 'value' };
        }
        break;
      }

      case 'list': {
        // Requirement 7.11: Use LRANGE 0 99 for LIST values
        const elements = await client.lrange(key, 0, 99);
        for (let i = 0; i < elements.length; i++) {
          if (elements[i].toLowerCase().includes(lowerQuery)) {
            return { location: `index ${i}` };
          }
        }
        break;
      }

      case 'hash': {
        // Requirement 7.12: Use HGETALL for HASH values
        const hash = await client.hgetall(key);
        for (const [field, value] of Object.entries(hash)) {
          if (field.toLowerCase().includes(lowerQuery)) {
            return { location: `field: ${field}` };
          }
          if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
            return { location: `value of ${field}` };
          }
        }
        break;
      }

      case 'set': {
        // Requirement 7.13: Use SMEMBERS for SET values (limit 100)
        const members = await client.smembers(key);
        const limitedMembers = members.slice(0, 100);
        for (const member of limitedMembers) {
          if (member.toLowerCase().includes(lowerQuery)) {
            return { location: 'member' };
          }
        }
        break;
      }

      case 'zset': {
        // Requirement 7.14: Use ZRANGE 0 99 for ZSET values
        const members = await client.zrange(key, 0, 99);
        for (const member of members) {
          if (member.toLowerCase().includes(lowerQuery)) {
            return { location: 'member' };
          }
        }
        break;
      }

      case 'stream': {
        // Skip STREAM values (too expensive)
        break;
      }

      default:
        // Unknown type, skip
        break;
    }
  } catch (error) {
    // Error accessing value, skip
    console.warn(`[Search] Error searching value for key ${key}:`, error);
  }

  return null;
}

export default router;
