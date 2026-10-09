/**
 * Runtime configuration for SpeechPal (FluentPath mobile client).
 *
 * Reads `BACKEND_URL` from app config / env. Falls back to localhost:4000
 * for local development. Set this to your deployed backend URL in production.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const configuredBackendUrl =
  (Constants?.expoConfig?.extra?.BACKEND_URL as string | undefined) ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  process.env.BACKEND_URL;

/** Android emulators reach the host machine through 10.0.2.2, not localhost. */
export const BACKEND_URL = (configuredBackendUrl ??
  (Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000')).replace(/\/$/, '');

// App metadata
export const APP_NAME = 'SpeechPal';
export const APP_VERSION = Constants?.expoConfig?.version ?? '1.0.0';

// Feature flags
export const SYNC_ENABLED = true;
