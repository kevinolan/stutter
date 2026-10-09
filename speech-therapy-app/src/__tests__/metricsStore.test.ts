import { describe, test, expect, beforeEach } from 'vitest';
import {
  ingestRecording,
  getRecordings,
  summarizeMetrics,
  detectTrend,
  type RecordingMetric,
} from '../lib/metricsStore';
import type { FluencyReport } from '../lib/fluency';

function makeReport(over: Partial<FluencyReport> = {}): FluencyReport {
  return {
    wordCount: 10,
    ratePerMin: 200,
    repetitions: 1,
    prolongations: 0,
    blocks: 0,
    disfluencies: 1,
    highlights: [],
    summary: 'ok',
    ...over,
  };
}

describe('metricsStore (offline ingestion)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('ingestRecording stores a record and getRecordings returns it newest-first', () => {
    ingestRecording({ durationSec: 4, pStutter: 0.2, report: makeReport({ repetitions: 2 }) });
    ingestRecording({ durationSec: 5, pStutter: 0.8, report: makeReport({ blocks: 3 }) });
    const recs = getRecordings();
    expect(recs).toHaveLength(2);
    // newest first
    expect(recs[0].pStutter).toBe(0.8);
    expect(recs[0].heuristic.blocks).toBe(3);
    expect(recs[1].pStutter).toBe(0.2);
  });

  test('summarizeMetrics returns empty-state headline with no data', () => {
    const s = summarizeMetrics([]);
    expect(s.count).toBe(0);
    expect(s.avgPStutter).toBeNull();
    expect(s.latestPStutter).toBeNull();
    expect(s.headline).toMatch(/No recordings yet/);
  });

  test('summarizeMetrics averages pStutter and heuristic counts', () => {
    ingestRecording({ durationSec: 4, pStutter: 0.2, report: makeReport({ repetitions: 2 }) });
    ingestRecording({ durationSec: 5, pStutter: 0.4, report: makeReport({ repetitions: 4 }) });
    const s = summarizeMetrics();
    expect(s.count).toBe(2);
    expect(s.avgPStutter).toBeCloseTo(0.3, 5);
    expect(s.latestPStutter).toBeCloseTo(0.4, 5);
    expect(s.avgRepetitions).toBeCloseTo(3, 5);
  });

  test('detectTrend classifies rising vs falling vs flat series', () => {
    expect(detectTrend([0.1, 0.3, 0.5, 0.7])).toBe('up');
    expect(detectTrend([0.8, 0.5, 0.3, 0.1])).toBe('down');
    expect(detectTrend([0.4, 0.4, 0.4])).toBe('flat');
    expect(detectTrend([0.3])).toBe('flat'); // too few points
  });

  test('summary trend reflects a rising stutter score over time', () => {
    // Store contract: records are newest-first. Build newest-first (high pStutter newest).
    const ps = [0.9, 0.6, 0.3, 0.2, 0.1]; // index 0 = newest
    const recs: RecordingMetric[] = ps.map((p, i) => ({
      id: `m${i}`,
      date: new Date(Date.now() - i * 1000).toISOString(), // newest has latest date
      durationSec: 3,
      pStutter: p,
      heuristic: { repetitions: 0, prolongations: 0, blocks: 0, wordCount: 5, ratePerMin: 100 },
    }));
    const s = summarizeMetrics(recs);
    expect(s.pStutterTrend).toBe('up');
  });

  test('records are capped at 200', () => {
    for (let i = 0; i < 250; i++) {
      ingestRecording({ durationSec: 1, pStutter: 0.1, report: makeReport() });
    }
    expect(getRecordings()).toHaveLength(200);
  });
});
