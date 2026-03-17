/**
 * Database Schema for Rediscover
 * 
 * SQLite schema definitions for users, connections, settings, and audit logs.
 * All timestamps are stored as INTEGER (Unix epoch milliseconds).
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'operator')),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url_encrypted TEXT NOT NULL,
  color TEXT,
  is_default INTEGER DEFAULT 0,
  status TEXT,
  latency_ms INTEGER,
  last_checked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER,
  action TEXT NOT NULL,
  key_name TEXT,
  details TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_log_connection 
  ON audit_log(connection_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created 
  ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_metadata_key 
  ON project_metadata(key);
`;
