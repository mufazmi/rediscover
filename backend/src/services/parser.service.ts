/**
 * Parser Service
 * 
 * Provides parsing utilities for Redis command outputs including MONITOR and CLIENT LIST.
 * Handles quoted arguments, multi-word commands, and error recovery.
 */

/**
 * Parsed MONITOR command event
 */
export interface MonitorEvent {
  timestamp: number;  // Timestamp in milliseconds
  db: number;         // Database number
  client: string;     // Client address (IP:port)
  command: string;    // Command name (uppercase)
  args: string[];     // Command arguments
}

/**
 * Parse a single line of MONITOR output into a structured event
 * 
 * MONITOR output format: timestamp [db client] "command" "arg1" "arg2" ...
 * Example: 1234567890.123456 [0 127.0.0.1:54321] "GET" "mykey"
 * 
 * @param line - Raw MONITOR output line
 * @returns Parsed MonitorEvent or null if parsing fails
 */
export function parseMonitorLine(line: string): MonitorEvent | null {
  try {
    // MONITOR format: timestamp [db client] "command" "arg1" "arg2" ...
    // Example: 1234567890.123456 [0 127.0.0.1:54321] "GET" "mykey"
    
    // Extract timestamp (first token before space)
    const timestampMatch = line.match(/^(\d+\.\d+)\s/);
    if (!timestampMatch) {
      throw new Error('Failed to extract timestamp');
    }
    
    const timestampSeconds = parseFloat(timestampMatch[1]);
    const timestamp = Math.floor(timestampSeconds * 1000); // Convert to milliseconds
    
    // Extract database and client from [db client] format
    const bracketMatch = line.match(/\[(\d+)\s+([^\]]+)\]/);
    if (!bracketMatch) {
      throw new Error('Failed to extract database and client');
    }
    
    const db = parseInt(bracketMatch[1], 10);
    const client = bracketMatch[2];
    
    // Extract quoted arguments (command and args)
    // Find the position after the closing bracket
    const bracketEndIndex = line.indexOf(']');
    if (bracketEndIndex === -1) {
      throw new Error('Failed to find closing bracket');
    }
    
    const argsSection = line.substring(bracketEndIndex + 1).trim();
    
    // Parse quoted strings
    const quotedArgs = parseQuotedArguments(argsSection);
    
    if (quotedArgs.length === 0) {
      throw new Error('No command found');
    }
    
    // First quoted argument is the command
    const command = quotedArgs[0].toUpperCase();
    
    // Remaining arguments are the command arguments
    const args = quotedArgs.slice(1);
    
    return {
      timestamp,
      db,
      client,
      command,
      args,
    };
  } catch (error) {
    // Log parsing errors and continue processing
    console.error('[Parser] Failed to parse MONITOR line:', line);
    console.error('[Parser] Error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Parse quoted arguments from a string
 * Handles escaped quotes within arguments
 * 
 * @param input - String containing quoted arguments
 * @returns Array of unquoted argument strings
 */
function parseQuotedArguments(input: string): string[] {
  const args: string[] = [];
  let currentArg = '';
  let inQuotes = false;
  let escaped = false;
  
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    
    if (escaped) {
      // Handle escaped character
      currentArg += char;
      escaped = false;
      continue;
    }
    
    if (char === '\\') {
      // Start escape sequence
      escaped = true;
      continue;
    }
    
    if (char === '"') {
      if (inQuotes) {
        // End of quoted argument
        args.push(currentArg);
        currentArg = '';
        inQuotes = false;
      } else {
        // Start of quoted argument
        inQuotes = true;
      }
      continue;
    }
    
    if (inQuotes) {
      // Inside quotes, add character to current argument
      currentArg += char;
    }
    // Outside quotes, skip whitespace between arguments
  }
  
  return args;
}

/**
 * Parsed keyspace notification event
 */
export interface KeyspaceNotification {
  eventType: string;  // Event type (e.g., 'set', 'del', 'expire', 'expired')
  key: string;        // Key name
  db: number;         // Database number
}

/**
 * Parse a Redis keyspace notification channel and message
 *
 * Redis keyspace notifications use two channel formats:
 * - Keyspace: __keyspace@<db>__:<key> with message being the event type
 * - Keyevent: __keyevent@<db>__:<event> with message being the key name
 *
 * @param channel - Notification channel (e.g., "__keyspace@0__:mykey" or "__keyevent@0__:set")
 * @param message - Notification message (event type for keyspace, key name for keyevent)
 * @returns Parsed KeyspaceNotification or null if parsing fails
 */
export function parseKeyspaceNotification(
  channel: string,
  message: string
): KeyspaceNotification | null {
  try {
    // Check if it's a keyspace notification: __keyspace@<db>__:<key>
    const keyspaceMatch = channel.match(/^__keyspace@(\d+)__:(.*)$/);
    if (keyspaceMatch) {
      const db = parseInt(keyspaceMatch[1], 10);
      const key = keyspaceMatch[2];
      const eventType = message;

      return {
        eventType,
        key,
        db,
      };
    }

    // Check if it's a keyevent notification: __keyevent@<db>__:<event>
    const keyeventMatch = channel.match(/^__keyevent@(\d+)__:(.*)$/);
    if (keyeventMatch) {
      const db = parseInt(keyeventMatch[1], 10);
      const eventType = keyeventMatch[2];
      const key = message;

      return {
        eventType,
        key,
        db,
      };
    }

    // Not a valid keyspace/keyevent notification format
    throw new Error('Invalid keyspace notification format');
  } catch (error) {
    console.error('[Parser] Failed to parse keyspace notification:', channel, message);
    console.error('[Parser] Error:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
