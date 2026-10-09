/**
 * Offline-first sync queue for metrics ingestion.
 *
 * When the backend is unreachable (or returns a non-5xx error), payloads are
 * persisted to AsyncStorage and flushed when the app regains connectivity.
 * Each item is a self-contained `IngestMetrics` payload keyed by its
 * `deviceId + firstMetricId` to deduplicate retries.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ingestMetrics, checkBackendHealth } from './backend';
import { getIdentity } from './identity';
import type { IngestMetrics } from '@fluentpath/shared';

const QUEUE_KEY = 'fluentpath_metrics_queue';

interface QueuedItem {
  key: string;
  payload: IngestMetrics;
  enqueuedAt: number;
  attempts: number;
}

/** Load the pending queue (oldest-first). */
async function loadQueue(): Promise<QueuedItem[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

/** Persist the queue (capped — drop oldest if absurdly large). */
async function saveQueue(items: QueuedItem[]): Promise<void> {
  const trimmed = items.slice(-500); // hard cap
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
}

/** Enqueue a payload for later sync. */
export async function enqueueMetrics(payload: IngestMetrics): Promise<void> {
  const items = await loadQueue();
  const identity = await getIdentity();
  const key = `${payload.deviceId}/${payload.metrics[0]?.id ?? 'batch'}`;
  if (items.some((item) => item.key === key)) return;
  items.push({ key, payload, enqueuedAt: Date.now(), attempts: 0 });
  await saveQueue(items);
}

/**
 * Attempt to flush every pending item. Returns a summary of outcomes.
 * Safe to call on app foreground / AppState change / timer tick.
 */
export async function flushQueue(): Promise<{
  posted: number;
  failed: number;
  errors: string[];
}> {
  if (!(await checkBackendHealth())) {
    return { posted: 0, failed: 0, errors: ['backend_unreachable'] };
  }

  const items = await loadQueue();
  const identity = await getIdentity();
  const errors: string[] = [];
  let posted = 0;
  const remaining: QueuedItem[] = [];

  for (const item of items) {
    try {
      const payload = item.payload.userId === identity.clientId
        ? { ...item.payload, userId: identity.userId }
        : item.payload;
      await ingestMetrics(payload);
      posted++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      // Keep retrying (up to a sane cap) so we don't loop forever on a bad payload.
      item.attempts += 1;
      if (item.attempts < 20) remaining.push(item);
    }
  }

  await saveQueue(remaining);
  return { posted, failed: remaining.length, errors };
}

/** Drop everything — used by dev reset flows. */
export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
