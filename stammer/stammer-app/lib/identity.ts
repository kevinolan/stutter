/**
 * Per-device identity for the FluentPath mobile client.
 *
 * SpeechPal does not require a login — it syncs metrics to the backend as an
 * anonymous client identified by a stable UUID generated on first launch. The
 * backend registers it as `<clientId>@users.speechpal.local`; that registration
 * is idempotent, so retrying after a lost response returns the same user.
 *
 * Stored in AsyncStorage so it survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { DEVICE_EMAIL_DOMAIN } from '@fluentpath/shared';
import { registerClient } from './backend';

const CLIENT_ID_KEY = 'fluentpath_client_id';

export interface Identity {
  /** Stable local UUID used to derive the registration email and device id. */
  clientId: string;
  /** Backend user id. Equals clientId until registration succeeds. */
  userId: string;
  /** `${Platform.OS}-${clientId}-1` — helps the clinician tell devices apart. */
  deviceId: string;
}

/** Simple RFC4122 v4 UUID (no dependency needed). */
function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isRegistered(identity: Identity): boolean {
  return identity.userId !== identity.clientId;
}

async function loadOrCreate(): Promise<Identity> {
  const stored = await AsyncStorage.getItem(CLIENT_ID_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<Identity>;
      if (parsed.clientId && parsed.deviceId) {
        return { clientId: parsed.clientId, deviceId: parsed.deviceId, userId: parsed.userId || parsed.clientId };
      }
    } catch {
      // Corrupt entry: fall through and mint a new identity.
    }
  }
  const clientId = uuid();
  const identity: Identity = { clientId, userId: clientId, deviceId: `${Platform.OS}-${clientId}-1` };
  await AsyncStorage.setItem(CLIENT_ID_KEY, JSON.stringify(identity));
  return identity;
}

let registering: Promise<Identity> | null = null;

/**
 * Resolve the persisted identity, registering with the backend if that hasn't
 * succeeded yet. Never throws for network errors — the returned identity is
 * simply unregistered (check with `isRegistered`). Concurrent callers share
 * one registration request.
 */
export function getIdentity(): Promise<Identity> {
  if (registering) return registering;
  registering = (async () => {
    const identity = await loadOrCreate();
    if (isRegistered(identity)) return identity;
    try {
      const user = await registerClient({
        email: `${identity.clientId}${DEVICE_EMAIL_DOMAIN}`,
        displayName: 'SpeechPal User',
      });
      identity.userId = user.id;
      await AsyncStorage.setItem(CLIENT_ID_KEY, JSON.stringify(identity));
    } catch {
      // Offline or backend down — the sync queue retries on the next flush.
    }
    return identity;
  })().finally(() => {
    registering = null;
  });
  return registering;
}

/** Wipe the identity so the next launch gets a fresh one (dev / reset). */
export async function clearIdentity(): Promise<void> {
  await AsyncStorage.removeItem(CLIENT_ID_KEY);
}
