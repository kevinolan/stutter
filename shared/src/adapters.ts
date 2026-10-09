import { z } from 'zod';
import { IngestMetricsSchema, type IngestMetrics, type RecordingMetric } from './domain.js';

/**
 * Adapter for the flat snake_case metrics format, e.g.
 *   { speech_rate, pauses, repetitions, prolongations, blocks, confidence }
 *
 * It converts to the canonical IngestMetrics shape so the rest of the backend
 * only ever sees one format. `pauses` has no canonical field and is dropped.
 * `confidence` is treated as P(stutter) from the model.
 */

const count = z.number().int().nonnegative();

export const SnakeCaseMetricSchema = z.object({
  id: z.string().min(1).optional(),
  recorded_at: z.string().datetime().optional(),
  duration_sec: count.optional(),
  word_count: count.optional(),
  speech_rate: z.number().nonnegative(),
  pauses: count.optional(),
  repetitions: count,
  prolongations: count,
  blocks: count,
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type SnakeCaseMetric = z.infer<typeof SnakeCaseMetricSchema>;

const identity = {
  user_id: z.string().min(1),
  device_id: z.string().min(1),
};

/** Accepts either one flat metric with ids, or a batch under `metrics`. */
export const SnakeCaseIngestSchema = z.union([
  z.object({ ...identity, metrics: z.array(SnakeCaseMetricSchema).min(1).max(200) }),
  SnakeCaseMetricSchema.extend(identity),
]);
export type SnakeCaseIngest = z.infer<typeof SnakeCaseIngestSchema>;

export function fromSnakeCaseMetric(
  m: SnakeCaseMetric,
  deviceId: string,
  now: () => Date = () => new Date(),
): RecordingMetric {
  const recordedAt = m.recorded_at ?? now().toISOString();
  const durationSec = m.duration_sec ?? 0;
  const wordCount = m.word_count ?? Math.round((m.speech_rate * durationSec) / 60);
  return {
    // Deterministic default so a retried upload upserts instead of duplicating.
    id: m.id ?? `${deviceId}:${recordedAt}`,
    recordedAt,
    durationSec,
    pStutter: m.confidence ?? null,
    heuristic: {
      repetitions: m.repetitions,
      prolongations: m.prolongations,
      blocks: m.blocks,
      wordCount,
      ratePerMin: m.speech_rate,
      disfluencies: m.repetitions + m.prolongations + m.blocks,
    },
  };
}

export function fromSnakeCaseIngest(input: SnakeCaseIngest, now?: () => Date): IngestMetrics {
  const items = 'metrics' in input ? input.metrics : [input];
  return {
    userId: input.user_id,
    deviceId: input.device_id,
    metrics: items.map((m) => fromSnakeCaseMetric(m, input.device_id, now)),
  };
}

/**
 * Parses a request body in either the canonical or snake_case format.
 * On failure, returns the canonical schema's error (the documented contract).
 */
export function parseIngestPayload(
  body: unknown,
  now?: () => Date,
): { success: true; data: IngestMetrics } | { success: false; error: z.ZodError } {
  const canonical = IngestMetricsSchema.safeParse(body);
  if (canonical.success) return canonical;
  const snake = SnakeCaseIngestSchema.safeParse(body);
  if (snake.success) {
    const data = IngestMetricsSchema.safeParse(fromSnakeCaseIngest(snake.data, now));
    if (data.success) return data;
    return { success: false, error: data.error };
  }
  return { success: false, error: canonical.error };
}
