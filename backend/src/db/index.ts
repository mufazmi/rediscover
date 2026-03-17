/**
 * Database Service for Rediscover
 * 
 * Initializes SQLite connection, creates schema, and provides query helpers.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import { config } from '../config';
import { SCHEMA } from './schema';
import { getAuthorInfo } from '../config/author';

// Ensure data directory exists
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

// Initialize SQLite database
export const db: Database.Database = new Database(config.databasePath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Execute schema creation (idempotent - uses IF NOT EXISTS)
db.exec(SCHEMA);

// Seed project metadata with author information
seedProjectMetadata();

console.log('[DB] SQLite database ready at', config.databasePath);

/**
 * Check if this is the first run (no users exist)
 */
export function isFirstRun(): boolean {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return row.count === 0;
}

/**
 * Execute a query that returns multiple rows
 */
export function query<T = any>(sql: string, params: any[] = []): T[] {
  return db.prepare(sql).all(...params) as T[];
}

/**
 * Execute a query that modifies data (INSERT, UPDATE, DELETE)
 */
export function run(sql: string, params: any[] = []): Database.RunResult {
  return db.prepare(sql).run(...params);
}

/**
 * Execute a query that returns a single row
 */
export function get<T = any>(sql: string, params: any[] = []): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

/**
 * Project metadata record interface
 */
export interface ProjectMetadataRecord {
  key: string;
  value: string;
  created_at: number;
  updated_at: number;
}

/**
 * Seed project metadata with author attribution information
 * 
 * This function populates the project_metadata table with essential author
 * and project information during database initialization. The metadata is
 * inserted using INSERT OR IGNORE to prevent duplicates on subsequent runs.
 */
export function seedProjectMetadata(): void {
  try {
    const author = getAuthorInfo();
    const now = Date.now();
    
    // Prepare the insert statement
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO project_metadata (key, value, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);
    
    // Define the metadata seeds
    const metadataSeeds = [
      { key: 'author.name', value: author.name },
      { key: 'author.github_username', value: author.githubUsername },
      { key: 'author.website', value: author.website },
      { key: 'author.email', value: author.email },
      { key: 'author.title', value: author.title },
      { key: 'author.phone', value: author.phone },
      { key: 'project.name', value: 'Rediscover' },
      { key: 'project.repository', value: 'https://github.com/mufazmi/rediscover' },
      { key: 'project.version', value: '1.0.0' },
      { key: 'project.description', value: 'Professional Redis GUI Client' }
    ];
    
    // Insert each metadata record
    metadataSeeds.forEach(seed => {
      stmt.run(seed.key, seed.value, now, now);
    });
    
    console.log('[Attribution] Project metadata seeded successfully');
  } catch (error) {
    console.warn('[Attribution] Failed to seed project metadata:', error);
    // Continue without attribution metadata - don't fail database initialization
  }
}
