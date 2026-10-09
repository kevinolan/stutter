/**
 * Thin client for the FluentPath backend (speechpal mobile slice).
 *
 * Posts `IngestMetrics` payloads to POST /api/metrics (open endpoint — clients
 * only ever write their own `userId`'s metrics by UUID). Queues failed posts
 * locally for offline retry.
 */
import { BACKEND_URL } from '@/config/env';

/** POST /api/metrics response ack. */
export interface IngestAck {
  accepted: number;
  rejected: number;
  serverTime: string;
}

export type { IngestMetrics } from '@fluentpath/shared';

/** Register the anonymous mobile client and return its server-side user. */
export async function registerClient(input: {
  email: string;
  displayName: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${BACKEND_URL}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, role: 'client' }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      `registration_failed (${res.status}): ${detail?.error ?? detail?.detail ?? 'unknown'}`,
    );
  }
  return (await res.json()) as { id: string };
}

/**
 * POST a batch of metrics. Throws on network/server failure; the caller
 * (syncQueue) is responsible for retrying.
 */
export async function ingestMetrics(
  payload: import('@fluentpath/shared').IngestMetrics,
): Promise<IngestAck> {
  const res = await fetch(`${BACKEND_URL}/api/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(
      `ingest_failed (${res.status}): ${detail?.error ?? detail?.detail ?? 'unknown'}`,
    );
  }

  return (await res.json()) as IngestAck;
}

/** Health check — useful for the sync queue to decide when to flush. */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
