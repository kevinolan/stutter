import { describe, test, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRenderPerf, dumpPerfMeasures } from '../utils/perf';

describe('useRenderPerf', () => {
  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
    // jsdom doesn't implement rAF timing — drive it synchronously so the
    // measure is created deterministically within the test.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
  });

  test('creates a Performance measure on render', () => {
    renderHook(() => useRenderPerf('TestComp'));

    const measures = performance.getEntriesByType('measure');
    expect(measures.length).toBeGreaterThan(0);
    expect(measures[0].name).toBe('TestComp-render');
  });

  test('dumpPerfMeasures prints a summary without throwing', () => {
    renderHook(() => useRenderPerf('TestComp'));
    expect(() => dumpPerfMeasures()).not.toThrow();
  });
});
