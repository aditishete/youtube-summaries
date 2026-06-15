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
    subscribed INTEGER NOT NULL DEFAULT 1,
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

// Create user_video_requests table (one row per GET /api/videos call)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_video_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// Add tickers/trade_signals/recommendations columns if they don't exist yet (migration)
try { db.exec('ALTER TABLE user_summaries ADD COLUMN tickers TEXT DEFAULT \'[]\''); } catch (_) {}
try { db.exec('ALTER TABLE user_summaries ADD COLUMN trade_signals TEXT DEFAULT \'[]\''); } catch (_) {}
try { db.exec('ALTER TABLE user_summaries ADD COLUMN recommendations TEXT DEFAULT \'[]\''); } catch (_) {}
try { db.exec('ALTER TABLE user_summaries ADD COLUMN published_at TEXT'); } catch (_) {}

// Shared video analyses — one row per youtube_id, referenced by user_summaries.
// Prevents re-running Claude when two users submit the same URL, and enables sharing.
db.exec(`
  CREATE TABLE IF NOT EXISTS video_analyses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id    TEXT UNIQUE NOT NULL,
    title         TEXT NOT NULL DEFAULT '',
    thumbnail     TEXT,
    url           TEXT NOT NULL DEFAULT '',
    published_at  TEXT,
    summary       TEXT NOT NULL DEFAULT '',
    key_points    TEXT DEFAULT '[]',
    tickers       TEXT DEFAULT '[]',
    trade_signals TEXT DEFAULT '[]',
    recommendations TEXT DEFAULT '[]',
    analyzed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add reference columns to user_summaries
try { db.exec('ALTER TABLE user_summaries ADD COLUMN video_analysis_id INTEGER REFERENCES video_analyses(id)'); } catch (_) {}
try { db.exec('ALTER TABLE user_summaries ADD COLUMN share_token TEXT'); } catch (_) {}

// Migrate existing user_summaries rows into video_analyses (dedup by youtube_id)
try {
  db.exec(`
    INSERT OR IGNORE INTO video_analyses
      (youtube_id, title, thumbnail, url, published_at, summary, key_points, tickers, trade_signals, recommendations, analyzed_at, created_at)
    SELECT
      youtube_id, COALESCE(title, ''), thumbnail, COALESCE(url, ''), published_at,
      COALESCE(summary, ''), COALESCE(key_points, '[]'), COALESCE(tickers, '[]'),
      COALESCE(trade_signals, '[]'), COALESCE(recommendations, '[]'), created_at, created_at
    FROM user_summaries
    WHERE youtube_id IS NOT NULL AND youtube_id != ''
      AND summary IS NOT NULL AND summary != ''
  `);
} catch (_) {}

// Back-fill video_analysis_id on existing user_summaries rows
try {
  db.exec(`
    UPDATE user_summaries
    SET video_analysis_id = (SELECT id FROM video_analyses WHERE video_analyses.youtube_id = user_summaries.youtube_id)
    WHERE video_analysis_id IS NULL AND youtube_id IS NOT NULL AND youtube_id != ''
  `);
} catch (_) {}

// Generate share tokens for all user_summaries rows that don't have one
try { db.exec(`UPDATE user_summaries SET share_token = lower(hex(randomblob(16))) WHERE share_token IS NULL`); } catch (_) {}

// Create user_logins table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    logged_in_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create user_page_views table (per-page navigation tracking)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    page TEXT NOT NULL,
    viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add subscribed column to existing channels tables that predate it
try {
  db.exec('ALTER TABLE channels ADD COLUMN subscribed INTEGER NOT NULL DEFAULT 1');
} catch (_) { /* column already exists — safe to ignore */ }

// Action log — admin and user actions with timestamp
db.exec(`
  CREATE TABLE IF NOT EXISTS action_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Add analysis_status to videos — tracks pipeline state per video
try { db.exec("ALTER TABLE videos ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'pending'"); } catch (_) {}
// Backfill: videos that already have analyzed_at set are done
try { db.exec("UPDATE videos SET analysis_status = 'done' WHERE analyzed_at IS NOT NULL AND analysis_status = 'pending'"); } catch (_) {}
// Add key_points to videos — aligned with video brief quality
try { db.exec("ALTER TABLE videos ADD COLUMN key_points TEXT DEFAULT '[]'"); } catch (_) {}

// Observability error tables
db.exec(`
  CREATE TABLE IF NOT EXISTS video_brief_errors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    url        TEXT NOT NULL,
    phase      TEXT NOT NULL,
    error      TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS market_brief_errors (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    video_id   TEXT NOT NULL,
    phase      TEXT NOT NULL,
    error      TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS channel_rss_errors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id   INTEGER REFERENCES channels(id) ON DELETE SET NULL,
    channel_name TEXT NOT NULL,
    error        TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS rate_limit_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    endpoint   TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Async summary jobs — only written when a job exceeds the inline timeout
db.exec(`
  CREATE TABLE IF NOT EXISTS summary_jobs (
    id          TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    result      TEXT,
    error       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
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
