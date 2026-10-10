import { describe, test, expect } from 'vitest';
import { parseIngestPayload } from './adapters.js';

const now = () => new Date('2026-10-10T12:00:00.000Z');
const flat = {
  speech_rate: 117,
  pauses: 12,
  repetitions: 5,
  prolongations: 2,
  blocks: 3,
  confidence: 0.87,
};

describe('parseIngestPayload', () => {
  test('converts a flat snake_case metric', () => {
    const res = parseIngestPayload({ user_id: 'u1', device_id: 'd1', ...flat, duration_sec: 60 }, now);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual({
      userId: 'u1',
      deviceId: 'd1',
      metrics: [
        {
          id: 'd1:2026-10-10T12:00:00.000Z',
          recordedAt: '2026-10-10T12:00:00.000Z',
          durationSec: 60,
          pStutter: 0.87,
          heuristic: {
            repetitions: 5,
            prolongations: 2,
            blocks: 3,
            wordCount: 117,
            ratePerMin: 117,
            disfluencies: 10,
          },
        },
      ],
    });
  });

  test('converts a snake_case batch and keeps explicit ids', () => {
    const res = parseIngestPayload(
      { user_id: 'u1', device_id: 'd1', metrics: [{ ...flat, id: 'a' }, { ...flat, id: 'b', confidence: null }] },
      now,
    );
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.metrics.map((m) => [m.id, m.pStutter])).toEqual([
      ['a', 0.87],
      ['b', null],
    ]);
  });

  test('rejects snake_case without user/device ids', () => {
    expect(parseIngestPayload(flat).success).toBe(false);
  });

  test('rejects out-of-range confidence', () => {
    expect(parseIngestPayload({ user_id: 'u', device_id: 'd', ...flat, confidence: 1.5 }).success).toBe(false);
  });
});
