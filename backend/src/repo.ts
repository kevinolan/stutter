/**
 * Data-access layer. Pure functions over a DbHandle. No HTTP concerns here so it
 * is trivially unit-testable with an in-memory DB.
 */
import { randomUUID } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  issueRefreshToken,
  sha256,
  passwordError,
  type RefreshToken,
} from './auth.js';
import { isProd } from './config.js';
import type { DbHandle } from './db.js';
import type {
  IngestMetrics,
  RecordingMetric,
  User,
  CreateUser,
  UserSummary,
} from '@fluentpath/shared';

export function listUsers(db: DbHandle): User[] {
  const rows = db.db.exec(
    'SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC',
  )[0]?.values ?? [];
  return rows.map((r: unknown[]) => ({
    id: String(r[0]),
    email: String(r[1]),
    displayName: String(r[2]),
    role: r[3] as User['role'],
    createdAt: String(r[4]),
  }));
}

export function getUser(db: DbHandle, id: string): User | null {
  const res = db.db.exec(
    'SELECT id, email, display_name, role, created_at FROM users WHERE id = ?',
    [id],
  )[0]?.values ?? [];
  if (res.length === 0) return null;
  const r = res[0];
  return {
    id: String(r[0]),
    email: String(r[1]),
    displayName: String(r[2]),
    role: r[3] as User['role'],
    createdAt: String(r[4]),
  };
}

export function createUser(db: DbHandle, input: CreateUser): User {
  const user: User = {
    id: randomUUID(),
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  const passwordHash = input.password ? hashPassword(input.password) : null;
  db.db.run(
    'INSERT INTO users (id, email, display_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, user.email, user.displayName, user.role, passwordHash, user.createdAt],
  );
  return user;
}

/**
 * Create a default clinician on first run (idempotent). Called by the server at
 * startup so the seed happens through the server's database connection.
 *
 * Credentials come from the environment; never rely on the dev fallback in prod.
 */
export function ensureSeeded(db: DbHandle): void {
  const email = (process.env.CLINICIAN_EMAIL ?? 'clinician@fluentpath.dev').toLowerCase();
  const password = process.env.CLINICIAN_PASSWORD ?? 'fluentpath-dev-1234';
  // Fail closed in production: a weak seed password is a real vulnerability.
  if (isProd) {
    const weak = passwordError(password);
    if (weak) {
      throw new Error(
        `Refusing to seed clinician in production: ${weak} Set a strong CLINICIAN_PASSWORD (>=8 chars, letters + digits).`,
      );
    }
  }
  const name = process.env.CLINICIAN_NAME ?? 'Demo Clinician';
  const existing = db.db.exec('SELECT id FROM users WHERE email = ?', [email])[0]?.values ?? [];
  if (existing.length > 0) return;
  const user: User = {
    id: randomUUID(),
    email,
    displayName: name,
    role: 'clinician',
    createdAt: new Date().toISOString(),
  };
  db.db.run(
    'INSERT INTO users (id, email, display_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, user.email, user.displayName, user.role, hashPassword(password), user.createdAt],
  );
  db.persist();
  console.log(`[seed] created default clinician ${email} (login: ${password})`);
}

export function findByEmail(db: DbHandle, email: string): (User & { passwordHash: string | null }) | null {
  const res = db.db.exec(
    'SELECT id, email, display_name, role, password_hash, created_at FROM users WHERE email = ?',
    [email.toLowerCase()],
  )[0]?.values ?? [];
  if (res.length === 0) return null;
  const r = res[0];
  return {
    id: String(r[0]),
    email: String(r[1]),
    displayName: String(r[2]),
    role: r[3] as User['role'],
    passwordHash: r[4] === null ? null : String(r[4]),
    createdAt: String(r[5]),
  };
}

/** Verify credentials; return the user (without hash) on success, null otherwise. */
export function authenticate(db: DbHandle, email: string, password: string): User | null {
  const row = findByEmail(db, email);
  if (!row || !row.passwordHash) return null;
  if (!verifyPassword(password, row.passwordHash)) return null;
  const { passwordHash: _omit, ...user } = row;
  return user;
}

// ── Refresh tokens (opaque, server-stored, revocable) ────────────────────────
// Only the SHA-256 hash is persisted; the plaintext is returned to the client
// exactly once and can be invalidated via /api/auth/logout or rotation.

export interface StoredRefreshToken {
  userId: string;
  expiresAt: string; // ISO 8601
  revoked: boolean;
}

export function insertRefreshToken(db: DbHandle, userId: string, rt: RefreshToken): void {
  db.db.run(
    `INSERT OR REPLACE INTO refresh_tokens (token_hash, user_id, expires_at, revoked, created_at)
     VALUES (?, ?, ?, 0, ?)`,
    [rt.hash, userId, rt.expiresAt, new Date().toISOString()],
  );
}

export function findRefreshToken(db: DbHandle, hash: string): StoredRefreshToken | null {
  const res = db.db.exec(
    'SELECT user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = ?',
    [hash],
  )[0]?.values ?? [];
  if (res.length === 0) return null;
  const r = res[0];
  return {
    userId: String(r[0]),
    expiresAt: String(r[1]),
    revoked: Number(r[2]) === 1,
  };
}

export function revokeRefreshToken(db: DbHandle, hash: string): void {
  db.db.run('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?', [hash]);
}

interface StoredMetric {
  id: string;
  userId: string;
  deviceId: string;
  recordedAt: string;
  durationSec: number;
  pStutter: number | null;
  repetitions: number;
  prolongations: number;
  blocks: number;
  wordCount: number;
  ratePerMin: number;
  disfluencies: number;
}

export function insertMetric(db: DbHandle, userId: string, deviceId: string, m: RecordingMetric): void {
  db.db.run(
    `INSERT OR REPLACE INTO metrics
       (id, user_id, device_id, recorded_at, duration_sec, p_stutter,
        repetitions, prolongations, blocks, word_count, rate_per_min, disfluencies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.id,
      userId,
      deviceId,
      m.recordedAt,
      m.durationSec,
      m.pStutter,
      m.heuristic.repetitions,
      m.heuristic.prolongations,
      m.heuristic.blocks,
      m.heuristic.wordCount,
      m.heuristic.ratePerMin,
      m.heuristic.disfluencies,
    ],
  );
}

export function ingestBatch(db: DbHandle, payload: IngestMetrics): { accepted: number; rejected: number } {
  let accepted = 0;
  let rejected = 0;
  // Validate + upsert; a single bad row shouldn't roll back the whole batch.
  for (const m of payload.metrics) {
    try {
      insertMetric(db, payload.userId, payload.deviceId, m);
      accepted++;
    } catch {
      rejected++;
    }
  }
  return { accepted, rejected };
}

export function listMetrics(db: DbHandle, userId: string, limit = 200): StoredMetric[] {
  const res = db.db.exec(
    `SELECT id, user_id, device_id, recorded_at, duration_sec, p_stutter,
            repetitions, prolongations, blocks, word_count, rate_per_min, disfluencies
     FROM metrics WHERE user_id = ? ORDER BY recorded_at DESC LIMIT ?`,
    [userId, limit],
  )[0]?.values ?? [];
  return res.map((r: unknown[]) => ({
    id: String(r[0]),
    userId: String(r[1]),
    deviceId: String(r[2]),
    recordedAt: String(r[3]),
    durationSec: Number(r[4]),
    pStutter: r[5] === null ? null : Number(r[5]),
    repetitions: Number(r[6]),
    prolongations: Number(r[7]),
    blocks: Number(r[8]),
    wordCount: Number(r[9]),
    ratePerMin: Number(r[10]),
    disfluencies: Number(r[11]),
  }));
}

/**
 * Aggregated per-patient summary for the clinician dashboard.
 * Computes averages over chronological order and a simple least-squares trend on
 * p_stutter (or disfluencies when p_stutter is sparse) to classify up/down/flat.
 */
export function summarizeUser(db: DbHandle, userId: string): UserSummary | null {
  const user = getUser(db, userId);
  if (!user) return null;
  const res = db.db.exec(
    `SELECT recorded_at, p_stutter, disfluencies, rate_per_min
     FROM metrics WHERE user_id = ? ORDER BY recorded_at ASC`,
    [userId],
  )[0]?.values ?? [];

  const count = res.length;
  if (count === 0) {
    return {
      ...user,
      metricCount: 0,
      earliestAt: null,
      latestAt: null,
      avgPStutter: null,
      avgDisfluencies: null,
      avgRatePerMin: null,
      trend: 'flat',
    };
  }

  let pSum = 0, pN = 0, dSum = 0, rSum = 0;
  const earliest = String(res[0][0]);
  const latest = String(res[count - 1][0]);
  // chronological series for trend
  const xs: number[] = [];
  const ys: number[] = [];
  res.forEach((r, i) => {
    const p = r[1] === null ? null : Number(r[1]);
    const d = Number(r[2]);
    const rate = Number(r[3]);
    if (p !== null) { pSum += p; pN++; }
    dSum += d;
    rSum += rate;
    xs.push(i);
    // prefer p_stutter for trend; fall back to disfluencies
    ys.push(p !== null ? p : d);
  });

  const trend = leastSquaresTrend(xs, ys);

  return {
    ...user,
    metricCount: count,
    earliestAt: earliest,
    latestAt: latest,
    avgPStutter: pN > 0 ? pSum / pN : null,
    avgDisfluencies: dSum / count,
    avgRatePerMin: rSum / count,
    trend,
  };
}

/** Sign of the slope of a simple least-squares fit. Threshold avoids noise on tiny samples. */
function leastSquaresTrend(xs: number[], ys: number[]): 'up' | 'down' | 'flat' {
  const n = xs.length;
  if (n < 3) return 'flat';
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return 'flat';
  const slope = num / den;
  // Normalize: a slope is "meaningful" if it's >5% of the mean value.
  const rel = Math.abs(slope) > 0.05 * (Math.abs(my) || 1);
  if (!rel) return 'flat';
  return slope > 0 ? 'up' : 'down';
}
