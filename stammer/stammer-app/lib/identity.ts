/**
 * Per-device identity for the FluentPath mobile client.
 *
 * SpeechPal does not require a login — it syncs metrics to the backend as an
 * anonymous client identified by a stable UUID generated on first launch. The
 * same `clientId` is reused forever (unless the user resets data), so metrics
 * are attributable across sessions on the same device/clinician account.
 *
 * Stored in AsyncStorage so it survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { registerClient } from './backend';

const CLIENT_ID_KEY = 'fluentpath_client_id';

export interface Identity {
  /** Stable local UUID used to derive the registration email and device id. */
  clientId: string;
  /** Backend user id. Falls back to clientId until registration succeeds. */
  userId: string;
  /** `${Platform.OS}-${clientId}-1` — helps the clinician tell clients apart. */
  deviceId: string;
}

/** Simple RFC4122 v4 UUID (no dependency needed). */
function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: manual v4 from Math.random (non-crypto, fine for a client id).
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Resolve (or create) the persisted device identity. */
export async function getIdentity(): Promise<Identity> {
  const stored = await AsyncStorage.getItem(CLIENT_ID_KEY);
  if (stored) {
    const parsed = JSON.parse(stored) as Identity;
    if (parsed.clientId && parsed.deviceId) {
      if (!parsed.userId) parsed.userId = parsed.clientId;
      if (parsed.userId === parsed.clientId) {
        try {
          const user = await registerClient({
            email: `${parsed.clientId}@users.speechpal.local`,
            displayName: 'SpeechPal User',
          });
          parsed.userId = user.id;
          await AsyncStorage.setItem(CLIENT_ID_KEY, JSON.stringify(parsed));
        } catch {
          // The sync queue will retry registration when the backend is reachable.
        }
      }
      return parsed;
    }
  }
  const clientId = uuid();
  const identity: Identity = {
    clientId,
    userId: clientId,
    deviceId: `${Platform.OS}-${clientId}-1`,
  };
  await AsyncStorage.setItem(CLIENT_ID_KEY, JSON.stringify(identity));
  try {
    const user = await registerClient({
      email: `${clientId}@users.speechpal.local`,
      displayName: 'SpeechPal User',
    });
    identity.userId = user.id;
    await AsyncStorage.setItem(CLIENT_ID_KEY, JSON.stringify(identity));
  } catch {
    // Keep the local identity usable offline; registration is retried on sync.
  }
  return identity;
}

/** Wipe the identity so the next launch gets a fresh one (dev / reset). */
export async function clearIdentity(): Promise<void> {
  await AsyncStorage.removeItem(CLIENT_ID_KEY);
}
