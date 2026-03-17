import Redis from 'ioredis';

/**
 * Scan Service
 * 
 * Provides safe key scanning functionality using Redis SCAN command.
 * Prevents blocking operations by using cursor-based iteration instead of KEYS command.
 */
export class ScanService {
  /**
   * Scan Redis keys using cursor-based iteration
   * 
   * Uses the SCAN command which is non-blocking and returns results in batches.
   * The cursor can be used to continue iteration in subsequent calls.
   * 
   * @param client - Redis client instance
   * @param pattern - Key pattern to match (supports wildcards like "user:*")
   * @param count - Hint for number of keys to return per iteration (default: 100)
   * @param cursor - Cursor position for pagination (default: "0" for start)
   * @returns Object containing next cursor and array of matching keys
   * 
   * @example
   * ```typescript
   * // First call - start scanning
   * const result1 = await ScanService.scanKeys(client, 'user:*', 100, '0');
   * console.log(result1.keys); // ['user:1', 'user:2', ...]
   * 
   * // Continue scanning with returned cursor
   * const result2 = await ScanService.scanKeys(client, 'user:*', 100, result1.cursor);
   * 
   * // When cursor returns to '0', iteration is complete
   * if (result2.cursor === '0') {
   *   console.log('Scan complete');
   * }
   * ```
   */
  static async scanKeys(
    client: Redis,
    pattern: string = '*',
    count: number = 100,
    cursor: string = '0'
  ): Promise<{
    cursor: string;
    keys: string[];
  }> {
    try {
      // Execute SCAN command with MATCH pattern and COUNT hint
      // SCAN returns [cursor, keys] tuple
      const result = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        count
      );

      // ioredis returns [cursor, keys] array
      const [nextCursor, keys] = result;

      return {
        cursor: nextCursor,
        keys: keys,
      };
    } catch (error) {
      throw new Error(
        `Failed to scan keys: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Scan all Redis keys matching a pattern
   * 
   * Iterates through all keys by repeatedly calling SCAN until the cursor
   * returns to "0". This is useful for operations that need the complete
   * set of matching keys (e.g., export functionality).
   * 
   * WARNING: For databases with millions of keys, this may take significant time.
   * Consider using scanKeys() with pagination for better performance.
   * 
   * @param client - Redis client instance
   * @param pattern - Key pattern to match (supports wildcards like "user:*")
   * @returns Array of all matching keys
   * 
   * @example
   * ```typescript
   * // Get all user keys
   * const allUserKeys = await ScanService.scanAllKeys(client, 'user:*');
   * console.log(`Found ${allUserKeys.length} user keys`);
   * ```
   */
  static async scanAllKeys(
    client: Redis,
    pattern: string = '*'
  ): Promise<string[]> {
    const allKeys: string[] = [];
    let cursor = '0';

    try {
      do {
        // Scan with current cursor
        const result = await this.scanKeys(client, pattern, 100, cursor);
        
        // Accumulate keys
        allKeys.push(...result.keys);
        
        // Update cursor for next iteration
        cursor = result.cursor;
        
        // Continue until cursor returns to "0"
      } while (cursor !== '0');

      return allKeys;
    } catch (error) {
      throw new Error(
        `Failed to scan all keys: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
