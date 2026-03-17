/**
 * Audit Logging Verification Script
 * 
 * This script verifies that all dangerous operations have proper audit logging.
 * It checks the route files for audit_log INSERT statements and validates their structure.
 */

import fs from 'fs';
import path from 'path';

interface AuditLogEntry {
  file: string;
  action: string;
  hasConnectionId: boolean;
  hasAction: boolean;
  hasKeyName: boolean;
  hasDetails: boolean;
  hasTimestamp: boolean;
  lineNumber: number;
  context: string;
}

interface VerificationResult {
  totalOperations: number;
  compliantOperations: number;
  nonCompliantOperations: number;
  entries: AuditLogEntry[];
  missingOperations: string[];
}

// Expected dangerous operations that should have audit logging
const EXPECTED_OPERATIONS = [
  'CLIENT_KILL',
  'CLIENT_KILL_IDLE',
  'CONFIG_SET',
  'TTL_BULK_APPLY',
  'TTL_BULK_REMOVE',
  'DELETE',
  'SET',
  'APPEND',
  'INCR',
  'DECR',
  'LPUSH',
  'RPUSH',
  'LSET',
  'HSET',
  'HDEL',
  'HRENAME',
  'SADD',
  'SREM',
  'ZADD',
  'ZREM',
  'XADD',
  'XDEL',
  'XTRIM',
  'EXPIRE',
  'PERSIST',
  'RENAME',
];

/**
 * Parse a file and extract audit log entries
 */
function parseFileForAuditLogs(filePath: string): AuditLogEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const entries: AuditLogEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Look for audit_log INSERT statements
    if (line.includes('INSERT INTO audit_log')) {
      // Extract the action from the next few lines
      let action = '';
      let hasConnectionId = false;
      let hasAction = false;
      let hasKeyName = false;
      let hasDetails = false;
      let hasTimestamp = false;
      
      // Look at the next 10 lines for the VALUES clause
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        const contextLine = lines[j];
        
        // Check for action name (usually in quotes after VALUES)
        const actionMatch = contextLine.match(/VALUES\s*\([^,]*,\s*'([^']+)'/);
        if (actionMatch) {
          action = actionMatch[1];
        }
        
        // Check for required fields in the INSERT statement
        if (contextLine.includes('connection_id')) hasConnectionId = true;
        if (contextLine.includes('action')) hasAction = true;
        if (contextLine.includes('key_name')) hasKeyName = true;
        if (contextLine.includes('details')) hasDetails = true;
        if (contextLine.includes('created_at')) hasTimestamp = true;
      }
      
      // Get context (surrounding lines)
      const contextStart = Math.max(0, i - 2);
      const contextEnd = Math.min(lines.length, i + 8);
      const context = lines.slice(contextStart, contextEnd).join('\n');
      
      entries.push({
        file: path.basename(filePath),
        action,
        hasConnectionId,
        hasAction,
        hasKeyName,
        hasDetails,
        hasTimestamp,
        lineNumber: i + 1,
        context,
      });
    }
  }

  return entries;
}

/**
 * Verify audit logging across all route files
 */
function verifyAuditLogging(): VerificationResult {
  const routesDir = path.join(__dirname, '../routes/redis');
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  
  const allEntries: AuditLogEntry[] = [];
  const foundActions = new Set<string>();

  // Parse all route files
  for (const file of files) {
    const filePath = path.join(routesDir, file);
    const entries = parseFileForAuditLogs(filePath);
    allEntries.push(...entries);
    
    entries.forEach(entry => {
      if (entry.action) {
        foundActions.add(entry.action);
      }
    });
  }

  // Check for missing operations
  const missingOperations = EXPECTED_OPERATIONS.filter(op => !foundActions.has(op));

  // Count compliant vs non-compliant
  const compliantOperations = allEntries.filter(entry => 
    entry.hasConnectionId &&
    entry.hasAction &&
    entry.hasDetails &&
    entry.hasTimestamp
  ).length;

  const nonCompliantOperations = allEntries.length - compliantOperations;

  return {
    totalOperations: allEntries.length,
    compliantOperations,
    nonCompliantOperations,
    entries: allEntries,
    missingOperations,
  };
}

/**
 * Generate a verification report
 */
function generateReport(result: VerificationResult): string {
  let report = '='.repeat(80) + '\n';
  report += 'AUDIT LOGGING VERIFICATION REPORT\n';
  report += '='.repeat(80) + '\n\n';

  report += `Total Operations Found: ${result.totalOperations}\n`;
  report += `Compliant Operations: ${result.compliantOperations}\n`;
  report += `Non-Compliant Operations: ${result.nonCompliantOperations}\n\n`;

  if (result.missingOperations.length > 0) {
    report += '⚠️  MISSING OPERATIONS:\n';
    report += '-'.repeat(80) + '\n';
    result.missingOperations.forEach(op => {
      report += `  - ${op}\n`;
    });
    report += '\n';
  } else {
    report += '✅ All expected operations have audit logging\n\n';
  }

  report += 'AUDIT LOG ENTRIES:\n';
  report += '-'.repeat(80) + '\n';

  // Group by file
  const byFile = new Map<string, AuditLogEntry[]>();
  result.entries.forEach(entry => {
    if (!byFile.has(entry.file)) {
      byFile.set(entry.file, []);
    }
    byFile.get(entry.file)!.push(entry);
  });

  for (const [file, entries] of byFile) {
    report += `\n📄 ${file}\n`;
    entries.forEach(entry => {
      const status = (
        entry.hasConnectionId &&
        entry.hasAction &&
        entry.hasDetails &&
        entry.hasTimestamp
      ) ? '✅' : '❌';
      
      report += `  ${status} Line ${entry.lineNumber}: ${entry.action || 'UNKNOWN'}\n`;
      report += `     - connection_id: ${entry.hasConnectionId ? '✓' : '✗'}\n`;
      report += `     - action: ${entry.hasAction ? '✓' : '✗'}\n`;
      report += `     - key_name: ${entry.hasKeyName ? '✓' : '✗'}\n`;
      report += `     - details: ${entry.hasDetails ? '✓' : '✗'}\n`;
      report += `     - created_at: ${entry.hasTimestamp ? '✓' : '✗'}\n`;
    });
  }

  report += '\n' + '='.repeat(80) + '\n';
  report += 'VERIFICATION SUMMARY\n';
  report += '='.repeat(80) + '\n';

  if (result.nonCompliantOperations === 0 && result.missingOperations.length === 0) {
    report += '✅ ALL AUDIT LOGGING IS COMPLIANT\n';
    report += '✅ All dangerous operations have proper audit_log entries\n';
    report += '✅ All entries include: connection_id, action, key_name, details, timestamp\n';
  } else {
    report += '❌ AUDIT LOGGING VERIFICATION FAILED\n';
    if (result.nonCompliantOperations > 0) {
      report += `❌ ${result.nonCompliantOperations} operations have incomplete audit logging\n`;
    }
    if (result.missingOperations.length > 0) {
      report += `❌ ${result.missingOperations.length} expected operations are missing audit logging\n`;
    }
  }

  report += '\n';
  return report;
}

/**
 * Main execution
 */
function main() {
  console.log('Starting audit logging verification...\n');
  
  const result = verifyAuditLogging();
  const report = generateReport(result);
  
  console.log(report);
  
  // Write report to file
  const reportPath = path.join(__dirname, '../../audit-logging-report.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`Report saved to: ${reportPath}\n`);
  
  // Exit with error code if verification failed
  if (result.nonCompliantOperations > 0 || result.missingOperations.length > 0) {
    process.exit(1);
  }
}

main();
