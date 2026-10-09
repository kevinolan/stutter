import { useEffect, useRef } from 'react';

/**
 * Lightweight render profiler for development.
 * - Logs render counts to the console.
 * - Measures the time each commit takes using the Performance API
 *   (mark → measure) so you can inspect/dump aggregate timing in DevTools.
 *
 * Note: ref mutation happens inside useEffect — never during render — so the
 * component stays a pure function of its props/state.
 */
export function useRenderPerf(name: string) {
  const renders = useRef(0);

  useEffect(() => {
    if (typeof performance === 'undefined') return;

    renders.current += 1;
    const tick = renders.current;
    const startName = `${name}-commit-${tick}-start`;
    const endName = `${name}-commit-${tick}-end`;
    const measureName = `${name}-render`;

    performance.mark(startName);
    // Defer the end mark to the next frame so it brackets the commit's layout/paint.
    const raf = requestAnimationFrame(() => {
      if (typeof performance === 'undefined') return;
      performance.mark(endName);
      try {
        performance.measure(measureName, { start: startName, end: endName });
      } catch {
        // measure can throw if marks were cleared between start and here; ignore.
      }
      performance.clearMarks(startName);
      performance.clearMarks(endName);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (typeof performance !== 'undefined') {
        performance.clearMarks(startName);
        performance.clearMarks(endName);
      }
    };
  });
}

/**
 * Print a compact summary of collected Performance measures to the console.
 * Use it from the browser console or the footer "🧪 Perf" button:
 * `import { dumpPerfMeasures } from './utils/perf'; dumpPerfMeasures();`
 */
export function dumpPerfMeasures(clear = true) {
  try {
    if (typeof performance === 'undefined') return;
    const measures = performance.getEntriesByType('measure') as PerformanceMeasure[];
    if (!measures || measures.length === 0) {
      console.info('[perf] no measures collected');
      return;
    }

    const summary: Record<string, { total: number; count: number }> = {};
    for (const m of measures) {
      const s = summary[m.name] || { total: 0, count: 0 };
      s.total += m.duration;
      s.count += 1;
      summary[m.name] = s;
    }

    const rows = Object.entries(summary).map(([name, v]) => ({
      name,
      avg: (v.total / v.count).toFixed(2) + 'ms',
      total: v.total.toFixed(2) + 'ms',
      count: v.count,
    }));

    console.table(rows);
    if (clear) performance.clearMeasures();
  } catch (err) {
    console.warn('[perf] dumpPerfMeasures failed', err);
  }
}
