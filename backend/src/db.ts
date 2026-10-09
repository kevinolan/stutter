/**
 * SQLite data layer backed by better-sqlite3.
 *
 * Unlike the former WASM adapter, this keeps SQLite's file locking and WAL
 * behavior intact. Each write is committed by SQLite; the legacy persist()
 * hook remains a no-op so callers do not need to know which adapter is in use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'fluentpath.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('client','clinician')),
  password_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  p_stutter REAL,
  repetitions INTEGER NOT NULL,
  prolongations INTEGER NOT NULL,
  blocks INTEGER NOT NULL,
  word_count INTEGER NOT NULL,
  rate_per_min REAL NOT NULL,
  disfluencies INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_user ON metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_metrics_recorded ON metrics(recorded_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
`;

export interface SqlResult {
  values: unknown[][];
}

/** Small compatibility surface used by repo.ts and the existing tests. */
export interface SqlDatabase {
  exec(sql: string, params?: unknown[]): SqlResult[];
  run(sql: string, params?: unknown[]): void;
  close(): void;
}

class SqliteAdapter implements SqlDatabase {
  constructor(private readonly database: Database.Database) {}

  exec(sql: string, params: unknown[] = []): SqlResult[] {
    if (!/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql)) {
      this.database.exec(sql);
      return [];
    }
    const rows = this.database.prepare(sql).all(...params) as Record<string, unknown>[];
    return [{ values: rows.map((row) => Object.values(row)) }];
  }

  run(sql: string, params: unknown[] = []): void {
    if (params.length === 0 && sql.includes(';')) {
      this.database.exec(sql);
      return;
    }
    this.database.prepare(sql).run(...params);
  }

  close(): void {
    this.database.close();
  }
}

export interface DbHandle {
  db: SqlDatabase;
  /** SQLite commits every mutating statement; retained for caller compatibility. */
  persist: () => void;
  /** Drop all rows (tests + db:reset). */
  clear: () => void;
  close: () => void;
}

function configure(database: Database.Database): void {
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = FULL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
}

function openDatabase(dbPath: string): DbHandle {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const database = new Database(dbPath);
  configure(database);
  database.exec(SCHEMA);

  const columns = database.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!columns.some((column) => column.name.toLowerCase() === 'password_hash')) {
    database.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }

  const adapter = new SqliteAdapter(database);
  return {
    db: adapter,
    persist: () => {},
    clear: () => adapter.run('DELETE FROM metrics; DELETE FROM users; DELETE FROM refresh_tokens;'),
    close: () => adapter.close(),
  };
}

/** Open the production database (creates the file + schema if missing). */
export async function openDb(dbPath: string = DB_PATH): Promise<DbHandle> {
  return openDatabase(dbPath);
}

/** Open an isolated in-memory database for tests. */
export async function openMemoryDb(): Promise<DbHandle> {
  return openDatabase(':memory:');
}
