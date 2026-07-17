import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let db = null;

export function initDB(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS guides (
      id           TEXT PRIMARY KEY,
      city         TEXT,
      guide_type   TEXT,
      source_text  TEXT NOT NULL,
      extracted    TEXT NOT NULL,
      token_count  INTEGER DEFAULT 0,
      created_at   INTEGER NOT NULL,
      deleted      INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_guides_city ON guides(city);
    CREATE INDEX IF NOT EXISTS idx_guides_deleted ON guides(deleted);

    CREATE TABLE IF NOT EXISTS rag_metadata (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}

export function getDB() {
  if (!db) throw new Error('RAG database not initialized. Call initDB() first.');
  return db;
}

export function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}
