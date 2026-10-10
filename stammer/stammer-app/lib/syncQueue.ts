/**
 * Offline-first sync queue for metrics ingestion.
 *
 * Payloads are persisted to AsyncStorage and flushed when the backend is
 * reachable and this device is registered. Each item is keyed by
 * `deviceId/firstMetricId` to deduplicate retries; the backend also upserts
 * metrics by id, so a re-post after a lost ack is harmless.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { IngestMetrics } from '@fluentpath/shared';
import { ingestMetrics, checkBackendHealth } from './backend';
import { getIdentity, isRegistered } from './identity';

const QUEUE_KEY = 'fluentpath_metrics_queue';
const MAX_ATTEMPTS = 20;

interface QueuedItem {
  key: string;
  payload: IngestMetrics;
  enqueuedAt: number;
  attempts: number;
}

export interface FlushResult {
  posted: number;
  failed: number;
  errors: string[];
}

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

async function saveQueue(items: QueuedItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-500)));
}

export async function pendingCount(): Promise<number> {
  return (await loadQueue()).length;
}

export async function enqueueMetrics(payload: IngestMetrics): Promise<void> {
  const items = await loadQueue();
  const key = `${payload.deviceId}/${payload.metrics[0]?.id ?? 'batch'}`;
  if (items.some((item) => item.key === key)) return;
  items.push({ key, payload, enqueuedAt: Date.now(), attempts: 0 });
  await saveQueue(items);
}

let flushing: Promise<FlushResult> | null = null;

/**
 * Attempt to flush every pending item. Safe to call concurrently (callers share
 * one in-flight flush) and on every app foreground.
 */
export function flushQueue(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush(): Promise<FlushResult> {
  if (!(await checkBackendHealth())) {
    return { posted: 0, failed: await pendingCount(), errors: ['backend_unreachable'] };
  }

  // Posting under the local clientId would be rejected (unknown user), so wait
  // until registration has gone through.
  const identity = await getIdentity();
  if (!isRegistered(identity)) {
    return { posted: 0, failed: await pendingCount(), errors: ['not_registered'] };
  }

  const items = await loadQueue();
  const errors: string[] = [];
  const remaining: QueuedItem[] = [];
  let posted = 0;

  for (const item of items) {
    try {
      // Items recorded before registration carry the local clientId.
      const payload =
        item.payload.userId === identity.clientId ? { ...item.payload, userId: identity.userId } : item.payload;
      await ingestMetrics(payload);
      posted++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
      item.attempts += 1;
      if (item.attempts < MAX_ATTEMPTS) remaining.push(item);
    }
  }

  // Items enqueued while this flush was running must not be overwritten.
  const processed = new Set(items.map((i) => i.key));
  const added = (await loadQueue()).filter((i) => !processed.has(i.key));
  await saveQueue([...remaining, ...added]);
  return { posted, failed: remaining.length + added.length, errors };
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}
