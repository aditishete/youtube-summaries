import pkg from 'node-sqlite3-wasm';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
// dirname re-used below for dbPath parent directory

const { Database: WasmDB } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, '../../data/dashboard.db');

// Ensure data directory exists
mkdirSync(dirname(dbPath), { recursive: true });

// Open the underlying wasm database
const _db = new WasmDB(dbPath);

/**
 * Thin compatibility wrapper that mimics the better-sqlite3 synchronous API:
 *   db.prepare(sql).all(...params)
 *   db.prepare(sql).get(...params)
 *   db.prepare(sql).run(...params)
 *   db.exec(sql)
 *   db.pragma(str)
 */
const db = {
  _db,

  prepare(sql) {
    const self = this;
    return {
      sql,
      all(...args) {
        const params = flattenParams(args);
        return self._db.all(sql, params.length ? params : undefined);
      },
      get(...args) {
        const params = flattenParams(args);
        return self._db.get(sql, params.length ? params : undefined);
      },
      run(...args) {
        const params = flattenParams(args);
        const info = self._db.run(sql, params.length ? params : undefined);
        return {
          changes: info.changes,
          lastInsertRowid: Number(info.lastInsertRowid),
        };
      },
    };
  },

  exec(sql) {
    this._db.exec(sql);
  },

  pragma(str) {
    if (str.toLowerCase().includes('wal')) {
      try { this._db.exec('PRAGMA journal_mode = WAL'); } catch (_) {}
    }
    if (str.toLowerCase().includes('foreign_keys')) {
      try { this._db.exec('PRAGMA foreign_keys = ON'); } catch (_) {}
    }
  },
};

/** Flatten positional args — handle (a, b, c) and ([a, b, c]) styles */
function flattenParams(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return args;
}

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create channels table
db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    rss_url TEXT NOT NULL,
    thumbnail_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_fetched_at DATETIME
  )
`);

// Create videos table
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    youtube_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    published_at DATETIME NOT NULL,
    summary TEXT,
    tickers TEXT DEFAULT '[]',
    trade_signals TEXT DEFAULT '[]',
    analyzed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create user_visits table (one row per visit, throttled to ~1/hr in middleware)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visited_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create user_summaries table (keeps last 20 per user)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    youtube_id TEXT NOT NULL,
    title TEXT NOT NULL,
    thumbnail TEXT,
    url TEXT NOT NULL,
    summary TEXT NOT NULL,
    key_points TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Close DB cleanly so node --watch restarts don't hit "database is locked"
function closeDb() {
  try { _db.close(); } catch (_) {}
}
process.on('exit', closeDb);
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
process.on('SIGINT',  () => { closeDb(); process.exit(0); });

export default db;
