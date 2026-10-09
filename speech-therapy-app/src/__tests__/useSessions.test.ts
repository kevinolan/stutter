import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessions } from '../hooks/useSessions';
import { summarize } from '../utils/stats';
import type { Session } from '../hooks/useSessions';

function makeLocalStorage() {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  } as unknown as Storage;
  return store;
}

describe('useSessions', () => {
  test('addSession adds a session and persists to localStorage', () => {
    const store = makeLocalStorage();

    const { result } = renderHook(() => useSessions());
    act(() => {
      result.current.addSession({ type: 'tips', label: 't', icon: 'i', durationSec: 5 });
    });

    expect(result.current.sessions.length).toBeGreaterThanOrEqual(1);
    expect(store['stt_sessions']).toBeDefined();
  });

  test('loads only well-formed sessions and ignores corrupt/legacy data', () => {
    const store = makeLocalStorage();
    const valid: Session = {
      id: 'abc', type: 'breathing', label: 'B', icon: '🌬️',
      date: new Date().toISOString(), durationSec: 10,
    };
    // A malformed entry (missing fields) and a non-array value must be dropped.
    store['stt_sessions'] = JSON.stringify([valid, { foo: 'bar' }, 'garbage']);

    const { result } = renderHook(() => useSessions());

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]).toEqual(valid);
  });
});

describe('summarize', () => {
  test('computes totals, streak, and per-type counts', () => {
    const sessions: Session[] = [
      { id: '1', type: 'breathing', label: 'B', icon: '🌬️', date: new Date().toISOString(), durationSec: 120 },
      { id: '2', type: 'exercises', label: 'E', icon: '🗣️', date: new Date().toISOString(), durationSec: 60 },
    ];
    const stats = summarize(sessions);
    expect(stats.totalSessions).toBe(2);
    expect(stats.totalMinutes).toBe(3);
    expect(stats.byType.breathing).toBe(1);
    expect(stats.byType.exercises).toBe(1);
    expect(stats.uniqueTypes).toBe(2);
  });
});
