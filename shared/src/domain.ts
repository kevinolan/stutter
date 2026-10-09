import { z } from 'zod';

/**
 * Shared domain types + validation schemas for the FluentPath platform.
 *
 * These are the contract between the Node backend, the Next.js admin, and the
 * React Native mobile client. Keep this package dependency-free (zod only) so it
 * can be consumed by any tier without pulling a framework.
 */

// ── Metrics ingestion ────────────────────────────────────────────────────────
// Mirrors the metrics the mobile/desktop app already collects on-device
// (src/lib/metricsStore.ts) so the backend can store + sync them.

export const RecordingMetricSchema = z.object({
  id: z.string().min(1),
  recordedAt: z.string().datetime(), // ISO 8601
  durationSec: z.number().int().nonnegative(),
  /** P(stutter) in [0,1] from the on-device ONNX model, or null if it didn't run. */
  pStutter: z.number().min(0).max(1).nullable(),
  heuristic: z.object({
    repetitions: z.number().int().nonnegative(),
    prolongations: z.number().int().nonnegative(),
    blocks: z.number().int().nonnegative(),
    wordCount: z.number().int().nonnegative(),
    ratePerMin: z.number().nonnegative(),
    disfluencies: z.number().int().nonnegative(),
  }),
});
export type RecordingMetric = z.infer<typeof RecordingMetricSchema>;

/** Payload the client POSTs to /api/metrics (upsert of a batch of recordings). */
export const IngestMetricsSchema = z.object({
  userId: z.string().min(1),
  deviceId: z.string().min(1),
  metrics: z.array(RecordingMetricSchema).min(1).max(200),
});
export type IngestMetrics = z.infer<typeof IngestMetricsSchema>;

// ── User / auth ──────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  role: z.enum(['client', 'clinician']),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(80),
  role: z.enum(['client', 'clinician']).default('client'),
  /** Required when seeding a clinician via admin tooling; never accepted from the public user-create endpoint. */
  password: z.string().min(8).optional(),
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

// ── Auth ───────────────────────────────────────────────────────────────────

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthResponseSchema = z.object({
  token: z.string().min(1),
  user: UserSchema,
  /** Opaque refresh token (returned on login / refresh). Clients use it at
   *  /api/auth/refresh to mint a new access token and at /api/auth/logout to
   *  revoke. Optional so pre-refresh clients keep working. */
  refreshToken: z.string().min(1).optional(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/** Body for /api/auth/refresh and /api/auth/logout. */
export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

// ── Aggregated per-patient summary (clinician dashboard) ─────────────────────

/** Stat bundle for one patient. Computed server-side over their stored metrics. */
export interface UserSummary {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  metricCount: number;
  earliestAt: string | null;
  latestAt: string | null;
  avgPStutter: number | null;
  avgDisfluencies: number | null;
  avgRatePerMin: number | null;
  trend: 'up' | 'down' | 'flat';
}

// ── API envelopes ───────────────────────────────────────────────────────────

export const ErrorSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
  // Present on 429 responses so clients can surface a precise wait time.
  retryAfter: z.number().int().nonnegative().optional(),
});
export type ApiError = z.infer<typeof ErrorSchema>;

/** Server → client "no content" style ack. */
export interface IngestAck {
  accepted: number;
  rejected: number;
  serverTime: string;
}
