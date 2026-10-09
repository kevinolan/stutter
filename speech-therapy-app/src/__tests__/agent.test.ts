import { describe, test, expect, beforeEach } from 'vitest';
import { runAgent } from '../lib/agent';
import { ingestRecording } from '../lib/metricsStore';
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

describe('agent v1 (offline, metrics-aware)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('returns a local reply and a non-empty metrics snapshot when no LLM is configured', async () => {
    const res = await runAgent({ message: "How do I handle a block?" });
    expect(res.local).toBe(true);
    expect(res.reply.length).toBeGreaterThan(0);
    expect(res.metrics.count).toBe(0);
    expect(res.dataContext).toMatch(/No fluency measurements/);
  });

  test('feeds ingested metrics into the coach context', async () => {
    ingestRecording({ durationSec: 4, pStutter: 0.7, report: makeReport({ blocks: 3, repetitions: 2 }) });
    const res = await runAgent({ message: 'What should I practice today?' });
    expect(res.local).toBe(true);
    expect(res.metrics.count).toBe(1);
    expect(res.metrics.avgPStutter).toBeCloseTo(0.7, 5);
    // The data context should mention the measured signal, not freetext only.
    expect(res.dataContext).toMatch(/Measured fluency signal/);
    expect(res.dataContext).toMatch(/blocks/);
  });

  test('handles a crisis-style message via the local coach safely (offline)', async () => {
    const res = await runAgent({ message: 'I feel like giving up, nothing works' });
    expect(res.local).toBe(true);
    expect(res.reply.toLowerCase()).toMatch(/(kind|friend|988|crisis)/);
  });
});
