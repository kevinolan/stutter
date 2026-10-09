import { describe, test, expect } from 'vitest';
import { analyzeFluency } from '../lib/fluency';
import { buildMessages, getCoaching, coachConfigFromEnv } from '../lib/coach';

describe('analyzeFluency', () => {
  test('flags repetitions, prolongations, and blocks', () => {
    const r = analyzeFluency('I-I-I went to the sssstore and then — kept going');
    expect(r.repetitions).toBeGreaterThanOrEqual(1);
    expect(r.prolongations).toBeGreaterThanOrEqual(1);
    expect(r.blocks).toBeGreaterThanOrEqual(1);
    expect(r.disfluencies).toBe(r.repetitions + r.prolongations + r.blocks);
  });

  test('empty transcript yields a friendly summary and zero counts', () => {
    const r = analyzeFluency('');
    expect(r.wordCount).toBe(0);
    expect(r.disfluencies).toBe(0);
    expect(r.summary).toMatch(/few words/i);
  });

  test('computes a per-minute rate from duration', () => {
    const r = analyzeFluency('one two three four five six', 3);
    // 6 words / 3s * 60 = 120/min
    expect(r.ratePerMin).toBe(120);
  });
});

describe('coach', () => {
  test('without API config the local coach replies', async () => {
    const res = await getCoaching({ message: "I'm really nervous about presenting" }, { apiBase: '', apiKey: '', model: '' });
    expect(res.local).toBe(true);
    expect(res.reply.length).toBeGreaterThan(0);
  });

  test('buildMessages injects system prompt and user context', () => {
    const msgs = buildMessages(
      { message: 'hi', context: { streak: 4, recentActivity: 'breathing ×3' } },
    );
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toMatch(/FluentPath Coach/);
    expect(msgs[0].content).toMatch(/streak: 4/);
    expect(msgs[msgs.length - 1].content).toBe('hi');
  });

  test('coachConfigFromEnv reads empty values when unset', () => {
    const cfg = coachConfigFromEnv();
    // In the test env no VITE_ vars are set, so this should be an empty config.
    expect(cfg.apiKey).toBe('');
  });
});
