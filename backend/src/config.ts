/**
 * Centralized runtime configuration + env validation.
 *
 * In production (`NODE_ENV=production`) a strong `JWT_SECRET` is REQUIRED; the
 * server refuses to boot without one (see `assertSecrets`). Everything else has
 * a safe dev default so local runs "just work".
 */
import { randomBytes } from 'node:crypto';

export const NODE_ENV = (process.env.NODE_ENV ?? 'development').toLowerCase();

export const isProd = NODE_ENV === 'production';

/** Access-token lifetime (seconds). Short: 15 minutes. */
export const ACCESS_TTL_SECONDS = Number(process.env.ACCESS_TTL_SECONDS ?? 15 * 60);

/** Refresh-token lifetime (seconds). 7 days. */
export const REFRESH_TTL_SECONDS = Number(process.env.REFRESH_TTL_SECONDS ?? 7 * 24 * 60 * 60);

/**
 * Comma-separated list of origins allowed to call the API from a browser.
 * Default allows the local admin dev server. In prod set this explicitly.
 */
export const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Max login attempts per email within the window before lockout. */
export const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS ?? 5);
/** Lockout window (seconds) and cooldown applied after exceeding it. */
export const LOGIN_WINDOW_SECONDS = Number(process.env.LOGIN_WINDOW_SECONDS ?? 15 * 60);
export const LOGIN_LOCKOUT_SECONDS = Number(process.env.LOGIN_LOCKOUT_SECONDS ?? 15 * 60);

/** Per-IP rate limit on auth endpoints (requests / window). */
export const AUTH_RATE_LIMIT = Number(process.env.AUTH_RATE_LIMIT ?? 20);
export const AUTH_RATE_WINDOW_SECONDS = Number(process.env.AUTH_RATE_WINDOW_SECONDS ?? 60);

/** Number of trusted reverse proxies in front of Express (0 when direct). */
export const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 0);

/** Minimum password length accepted at account creation. */
export const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH ?? 8);

/**
 * Resolve the signing secret. In dev, a deterministic-but-clearly-insecure value
 * is used so local runs work without config. In production this MUST come from
 * the environment or the server refuses to start.
 */
export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 16) return s;
  if (!isProd) return 'dev-only-insecure-secret-change-me-please-0000';
  // Production without a secret: signal the failure loudly (caller throws).
  return '';
}

/** A strong random secret suggestion (for ops to drop into env/secrets). */
export function generateSecret(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Called at boot. Throws if production is misconfigured so we fail closed
 * rather than run with a guessable secret or open CORS.
 */
export function assertSecrets(): void {
  if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16)) {
    throw new Error(
      'Refusing to start in production without JWT_SECRET (>=16 chars). Set JWT_SECRET in the environment.',
    );
  }
  if (isProd && CORS_ORIGINS.includes('*')) {
    throw new Error('Refusing to start in production with CORS_ORIGINS=* (open CORS). Set explicit origins.');
  }
}
