/**
 * In-memory rate limiting for the API surface.
 *
 * Two complementary guards, both config-driven (see config.ts):
 *  - `authRateLimit`  — fixed-window per-client-IP cap across ALL /api/auth/*
 *                       endpoints (login / refresh / logout). Stops credential
 *                       stuffing and refresh-endpoint abuse from one source.
 *  - `apiRateLimit`   — fixed-window per-client-IP cap across the remaining API
 *                       endpoints, preventing repeated authorized database work.
 *  - login lockout    — per-email failure counter that locks an account for
 *                       LOGIN_LOCKOUT_SECONDS after LOGIN_MAX_ATTEMPTS failed
 *                       attempts inside LOGIN_WINDOW_SECONDS.
 *
 * State is scoped to the instance returned by `createRateLimiter`, so each app
 * (and each test) gets isolated counters. NOT shared across processes; use a
 * shared store such as Redis when the backend scales out.
 */
import type { Request } from 'express';
import {
  AUTH_RATE_LIMIT,
  AUTH_RATE_WINDOW_SECONDS,
  API_RATE_LIMIT,
  API_RATE_WINDOW_SECONDS,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_SECONDS,
  LOGIN_LOCKOUT_SECONDS,
} from './config.js';

/** Resolve the client IP using Express's explicitly configured proxy trust. */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export interface RateLimitResult {
  limited: boolean;
  retryAfter: number;
}
export interface LockoutResult {
  locked: boolean;
  retryAfter: number;
}

interface Window {
  count: number;
  resetAt: number;
}
interface LoginTrack {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

export function createRateLimiter() {
  const authBuckets = new Map<string, Window>();
  const apiBuckets = new Map<string, Window>();
  const loginAttempts = new Map<string, LoginTrack>();

  function checkBucket(
    buckets: Map<string, Window>,
    limit: number,
    windowSeconds: number,
    req: Request,
  ): RateLimitResult {
    const now = Date.now();
    const key = clientIp(req);

    // Lazy prune of long-expired buckets so the map can't grow unbounded.
    if (buckets.size > 4096) {
      for (const [k, w] of buckets) if (w.resetAt <= now) buckets.delete(k);
    }

    const win = buckets.get(key);
    if (!win || win.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { limited: false, retryAfter: 0 };
    }
    win.count += 1;
    if (win.count > limit) {
      return { limited: true, retryAfter: Math.ceil((win.resetAt - now) / 1000) };
    }
    return { limited: false, retryAfter: 0 };
  }

  function authRateLimit(req: Request): RateLimitResult {
    return checkBucket(authBuckets, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_SECONDS, req);
  }

  function apiRateLimit(req: Request): RateLimitResult {
    return checkBucket(apiBuckets, API_RATE_LIMIT, API_RATE_WINDOW_SECONDS, req);
  }

  function checkLoginLockout(email: string): LockoutResult {
    const now = Date.now();
    const t = loginAttempts.get(email);
    if (!t) return { locked: false, retryAfter: 0 };
    if (t.lockedUntil > now) return { locked: true, retryAfter: Math.ceil((t.lockedUntil - now) / 1000) };
    return { locked: false, retryAfter: 0 };
  }

  function recordLoginFailure(email: string): void {
    const now = Date.now();
    const t = loginAttempts.get(email);
    if (!t || t.windowStart <= now - LOGIN_WINDOW_SECONDS * 1000) {
      loginAttempts.set(email, { count: 1, windowStart: now, lockedUntil: 0 });
      return;
    }
    t.count += 1;
    if (t.count > LOGIN_MAX_ATTEMPTS) {
      t.lockedUntil = now + LOGIN_LOCKOUT_SECONDS * 1000;
    }
  }

  function recordLoginSuccess(email: string): void {
    loginAttempts.delete(email);
  }

  return { authRateLimit, apiRateLimit, checkLoginLockout, recordLoginFailure, recordLoginSuccess };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
