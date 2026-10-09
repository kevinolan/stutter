/**
 * Dependency-free auth primitives.
 *
 * Passwords: scrypt (Node crypto) with a per-user random salt. Never stored in
 * plaintext or reversibly.
 *
 * Sessions use a two-token model:
 *  - **access token**: HS256 JWT, short-lived (15 min), stateless, carries the
 *    user id + role. Sent as `Authorization: Bearer <jwt>`.
 *  - **refresh token**: opaque random string, long-lived (7 days), stored hashed
 *    in the DB (`refresh_tokens` table) and revocable. Used only at
 *    `/api/auth/refresh` to mint a new access token, and at `/api/auth/logout`
 *    to revoke. Opaque (not a JWT) so it can be invalidated server-side.
 *
 * No external auth libraries — everything is Node `crypto`.
 */
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import {
  getJwtSecret,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from './config.js';

const SCRYPT_KEYLEN = 64;

// ── Passwords ────────────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

/** Password policy: length + at least one letter and one digit. */
export function passwordError(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

// ── Access token (HS256 JWT) ────────────────────────────────────────────────

interface JwtClaims {
  sub: string; // user id
  role: 'client' | 'clinician';
  email: string;
  exp: number; // seconds since epoch
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlJson(obj: unknown): string {
  return base64url(Buffer.from(JSON.stringify(obj), 'utf8'));
}
function fromBase64url(s: string): Buffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

export function signToken(claims: { sub: string; role: 'client' | 'clinician'; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtClaims = { ...claims, exp: now + ACCESS_TTL_SECONDS };
  const header = base64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = base64urlJson(payload);
  const data = `${header}.${body}`;
  const sig = base64url(createHmac('sha256', getJwtSecret()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = base64url(
    createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest(),
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromBase64url(body).toString('utf8')) as JwtClaims;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── Refresh token (opaque, server-stored) ───────────────────────────────────

/** A freshly minted refresh token: the plaintext (returned once) + its SHA-256
 *  hash (store this in the DB; never store the plaintext). */
export interface RefreshToken {
  plaintext: string; // returned to client, used at /refresh and /logout
  hash: string; // store in DB
  expiresAt: string; // ISO timestamp
}

export function issueRefreshToken(): RefreshToken {
  const plaintext = randomBytes(40).toString('base64url');
  return {
    plaintext,
    hash: sha256(plaintext),
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Hash a refresh-token plaintext for storage/lookup (constant representation).
 *
 * Keyed with the JWT secret (not a fixed literal) so the stored hashes are
 * secret-dependent: a DB leak yields nothing reversible, and rotating
 * JWT_SECRET cleanly invalidates every outstanding refresh grant. In dev the
 * dev fallback secret is used; in production assertSecrets() has already
 * guaranteed a real secret before any token is issued, so this never runs with
 * an empty key.
 */
export function sha256(s: string): string {
  return createHmac('sha256', getJwtSecret())
    .update(s)
    .digest('hex');
}

/** Extract a bearer token from an Authorization header, or null. */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
