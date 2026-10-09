/**
 * FluentPath AI Agent — v1, fully offline.
 *
 * The agent turns raw ingested metrics (src/lib/metricsStore.ts) into a
 * data-aware coaching turn. It does NOT call any model itself: it assembles a
 * context payload from the user's measured fluency signal and hands it to the
 * existing coach (src/lib/coach.ts). The coach's local rule-based brain is the
 * default offline engine; an LLM is purely optional enrichment (and never
 * required, never sends metrics off-device unless the user configures an endpoint).
 *
 * Design: ingestion -> store -> agent reads snapshot -> coach reply. No network
 * is touched by this module unless the operator has explicitly configured an LLM
 * endpoint in .env.local. Even then, only the text message + a short summary are
 * sent, never the raw audio.
 */
import { getCoaching, type CoachContext, type CoachResult } from './coach';
import { summarizeMetrics, type MetricsSummary } from './metricsStore';

export interface AgentRequest {
  message: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface AgentResult extends CoachResult {
  /** The metrics snapshot the agent reasoned over (for UI display). */
  metrics: MetricsSummary;
  /** Short data summary appended to the coach context. */
  dataContext: string;
}

function buildDataContext(sum: MetricsSummary): string {
  if (sum.count === 0) return 'No fluency measurements recorded yet.';
  const trendNote =
    sum.pStutterTrend !== 'flat' && sum.avgPStutter !== null
      ? ` Stutter score trending ${sum.pStutterTrend === 'up' ? 'up' : 'down'}.`
      : '';
  return (
    `Measured fluency signal (last ${sum.count} recording(s)): ` +
    `${sum.headline.replace(/^Over \d+ recordings? \([^)]*\): /, '')}${trendNote}`
  );
}

/**
 * Run the agent on a user message. Always works offline: if no LLM is configured
 * the coach uses its built-in local brain; this module only enriches that with
 * the user's own metrics. Returns the reply + the snapshot used.
 */
export async function runAgent(req: AgentRequest): Promise<AgentResult> {
  const metrics = summarizeMetrics();
  const dataContext = buildDataContext(metrics);
  const context: CoachContext = {
    recentActivity: dataContext,
    focus: 'measured fluency signal from my recordings',
  };

  const result = await getCoaching({
    message: req.message,
    history: req.history,
    context,
  });

  return { ...result, metrics, dataContext };
}
