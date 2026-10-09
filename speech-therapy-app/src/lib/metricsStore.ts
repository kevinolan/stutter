/**
 * Local-first metrics ingestion store for the FluentPath AI agent (v1, offline).
 *
 * Ingests the fluency signals the app already produces on every recording:
 *   - `pStutter`      : P(stutter) from the fine-tuned ONNX model (on-device)
 *   - heuristic       : repetitions / prolongations / blocks / wordCount / ratePerMin
 *                      from the rule-based analyzer (src/lib/fluency.ts)
 *   - durationSec     : from the session tracker
 *
 * Everything is stored in localStorage — there is NO network call. The agent
 * (src/lib/agent.ts) reads a snapshot from here to give data-aware coaching.
 */
import type { FluencyReport } from './fluency';

const STORAGE_KEY = 'stt_metrics';

export interface RecordingMetric {
  id: string;
  date: string; // ISO
  durationSec: number;
  /** P(stutter) in [0,1] from the ONNX model, or null if the model didn't run. */
  pStutter: number | null;
  heuristic: {
    repetitions: number;
    prolongations: number;
    blocks: number;
    wordCount: number;
    ratePerMin: number;
  };
}

export type Trend = 'up' | 'down' | 'flat';

export interface MetricsSummary {
  count: number;
  samplesLast7d: number;
  avgPStutter: number | null;
  latestPStutter: number | null;
  avgRepetitions: number;
  avgProlongations: number;
  avgBlocks: number;
  pStutterTrend: Trend;
  /** One-line, human-readable summary the agent can drop into its reply. */
  headline: string;
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function load(): RecordingMetric[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidMetric);
  } catch {
    return [];
  }
}

function isValidMetric(m: unknown): m is RecordingMetric {
  if (typeof m !== 'object' || m === null) return false;
  const o = m as Record<string, unknown>;
  const h = (o.heuristic ?? {}) as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.date === 'string' &&
    typeof o.durationSec === 'number' &&
    (o.pStutter === null || typeof o.pStutter === 'number') &&
    typeof h.repetitions === 'number' &&
    typeof h.prolongations === 'number' &&
    typeof h.blocks === 'number' &&
    typeof h.wordCount === 'number' &&
    typeof h.ratePerMin === 'number'
  );
}

function save(metrics: RecordingMetric[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metrics));
  } catch {
    /* storage full / private mode — non-fatal */
  }
}

/** Ingest one recording's metrics. Returns the stored record. */
export function ingestRecording(input: {
  durationSec: number;
  pStutter: number | null;
  report: FluencyReport;
}): RecordingMetric {
  const record: RecordingMetric = {
    id: newId(),
    date: new Date().toISOString(),
    durationSec: input.durationSec,
    pStutter: input.pStutter,
    heuristic: {
      repetitions: input.report.repetitions,
      prolongations: input.report.prolongations,
      blocks: input.report.blocks,
      wordCount: input.report.wordCount,
      ratePerMin: input.report.ratePerMin,
    },
  };
  const next = [record, ...load()].slice(0, 200);
  save(next);
  return record;
}

export function getRecordings(): RecordingMetric[] {
  return load();
}

/** Sign of a simple least-squares slope over recent values (needs >= 3 points). */
export function detectTrend(values: number[]): Trend {
  const n = values.length;
  if (n < 3) return 'flat';
  const xs = values.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  // Scale threshold to the metric's typical range; use a relative threshold.
  if (Math.abs(slope) < 1e-3) return 'flat';
  return slope > 0 ? 'up' : 'down';
}

export function summarizeMetrics(records: RecordingMetric[] = getRecordings()): MetricsSummary {
  const count = records.length;
  if (count === 0) {
    return {
      count: 0,
      samplesLast7d: 0,
      avgPStutter: null,
      latestPStutter: null,
      avgRepetitions: 0,
      avgProlongations: 0,
      avgBlocks: 0,
      pStutterTrend: 'flat',
      headline: 'No recordings yet — record a session so your coach can learn your patterns.',
    };
  }

  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const recent7 = records.filter(r => new Date(r.date).getTime() >= cutoff);

  const pVals = records.map(r => r.pStutter).filter((p): p is number => p !== null);
  const avgP = pVals.length ? pVals.reduce((a, b) => a + b, 0) / pVals.length : null;
  const latestP = pVals.length ? pVals[0] : null; // records are newest-first
  const trend = detectTrend(pVals.slice().reverse()); // chronological order

  const avg = (sel: (r: RecordingMetric) => number) =>
    records.reduce((a, r) => a + sel(r), 0) / count;
  const avgRep = avg(r => r.heuristic.repetitions);
  const avgPro = avg(r => r.heuristic.prolongations);
  const avgBlk = avg(r => r.heuristic.blocks);

  // Build a plain-language headline.
  const bits: string[] = [];
  if (avgP !== null) {
    bits.push(`avg stutter score ${(avgP * 100).toFixed(0)}%`);
  }
  bits.push(`~${avgRep.toFixed(1)} reps, ${avgPro.toFixed(1)} prolongations, ${avgBlk.toFixed(1)} blocks per recording`);
  if (trend !== 'flat' && avgP !== null) {
    bits.push(`stutter score trending ${trend === 'up' ? 'up ⚠️' : 'down ✅'}`);
  }
  const headline = `Over ${count} recording${count === 1 ? '' : 's'} (${recent7.length} in last 7 days): ${bits.join('; ')}.`;

  return {
    count,
    samplesLast7d: recent7.length,
    avgPStutter: avgP,
    latestPStutter: latestP,
    avgRepetitions: avgRep,
    avgProlongations: avgPro,
    avgBlocks: avgBlk,
    pStutterTrend: trend,
    headline,
  };
}
