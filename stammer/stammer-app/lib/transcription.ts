import * as FileSystem from 'expo-file-system';
import { BACKEND_URL } from '@/config/env';

/**
 * Sends a recording to the app backend for transcription only when the user
 * explicitly enables the speech-to-text switch. The provider key stays server-side.
 */
export async function transcribeRecording(uri: string): Promise<string> {
  const extension = uri.split('?')[0].split('.').pop()?.toLowerCase();
  const contentType =
    extension === 'wav' ? 'audio/wav'
    : extension === 'mp3' ? 'audio/mpeg'
    : extension === 'ogg' ? 'audio/ogg'
    : extension === 'webm' ? 'audio/webm'
    : extension === 'flac' ? 'audio/flac'
    : 'audio/mp4';

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const response = await fetch(`${BACKEND_URL}/api/transcribe`, {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body: bytes.buffer as ArrayBuffer,
  });

  if (!response.ok) {
    if (response.status === 503) throw new Error('Speech-to-text is not configured on the server yet.');
    if (response.status === 429) throw new Error('Too many transcription requests. Please wait a little and try again.');
    if (response.status === 415) throw new Error('This recording format is not supported for transcription.');
    throw new Error('Could not transcribe this recording.');
  }

  const result = await response.json() as { text?: unknown };
  if (typeof result.text !== 'string' || !result.text.trim()) {
    throw new Error('No transcript was returned. Try speaking a little closer to the microphone.');
  }
  return result.text.trim();
}
