/**
 * Recording analysis orchestrator — ties together ONNX inference, the heuristic
 * fluency analyzer, and the shared `IngestMetrics` payload shape.
 *
 * Flow:
 *   1. Load PCM from the recorded file URI (at the recorder's sample rate).
 *   2. Resample to 16 kHz mono Float32 (required by the ONNX model).
 *   3. Run `predictStutter` (on-device ONNX). Guard with try/catch — if the
 *      model asset isn't bundled or the runtime fails, fall back to
 *      `pStutter = null` (the schema allows it) and keep the heuristic.
 *   4. If a transcript is available, run `analyzeFluency` for surface
 *      disfluency counts. Without STT we can't auto-transcribe, so the
 *      heuristic path produces zero counts (pStutter still works).
 *   5. Assemble one `RecordingMetric` + `IngestMetrics` payload.
 */
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { predictStutter, isModelAvailable } from './stutterModelRN';
import { analyzeFluency, type FluencyReport } from './fluency';
import { getIdentity } from './identity';
import type { IngestMetrics, RecordingMetric } from '@fluentpath/shared';

/** Result of analyzing one recording. */
export interface AnalysisResult {
  metric: RecordingMetric;
  /** Whether the on-device model actually ran. */
  usedModel: boolean;
  /** Heuristic fluency summary, if a transcript was provided. */
  fluencySummary: string | null;
  /** Communication-ease self-rating [0,100], or null if not provided. */
  easeRating: number | null;
}

export interface AnalysisInput {
  /** URI of the recorded audio file (file://...). */
  recordingUri: string;
  /** Duration from the recorder, used when compressed audio cannot be decoded. */
  durationSec?: number;
  /** Optional transcript (from on-device STT in Phase 2, or typed by the user). */
  transcript?: string;
  /** Optional self-reported communication-ease rating 0–100. */
  easeRating?: number;
}

/** Load a WAV file as 16 kHz mono Float32 PCM. */
async function loadMonoFloat(uri: string): Promise<{ pcm: Float32Array; sr: number }> {
  // expo-av HIGH_QUALITY preset records at 44100 Hz. We use Audio.Sound to
  // create the sound object (validates the file), then decode WAV directly.
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: false, volume: 0 },
  );
  await sound.unloadAsync();

  if (uri.toLowerCase().endsWith('.wav')) {
    const pcm = await readWav(uri);
    return { pcm: pcm.data, sr: pcm.sampleRate };
  }

  // For non-WAV (M4A/AAC from expo-av), we can't decode raw PCM without a
  // native decoder in Phase 1. Return an empty buffer so pStutter stays null
  // and only the heuristic path can produce results (when a transcript exists).
  return { pcm: new Float32Array(0), sr: 44100 };
}

interface WavResult {
  data: Float32Array;
  sampleRate: number;
}

/** Decode base64 string to binary string (works in both web and React Native). */
function b64ToBinary(b64: string): string {
  // In RN, global `atob` may not exist. Fall back to a manual decoder.
  if (typeof atob === 'function') {
    return atob(b64);
  }
  // Minimal base64 decoder (handles standard + URL-safe alphabet)
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = table.indexOf(clean[i] ?? '');
    const e2 = table.indexOf(clean[i + 1] ?? '');
    const e3 = table.indexOf(clean[i + 2] ?? '');
    const e4 = table.indexOf(clean[i + 3] ?? '');
    const c1 = (e1 << 2) | (e2 >> 4);
    const c2 = ((e2 & 0xf) << 4) | (e3 >> 2);
    const c3 = ((e3 & 0x3) << 6) | e4;
    out += String.fromCharCode(c1);
    if (e3 !== 64 && clean[i + 2]) out += String.fromCharCode(c2);
    if (e3 !== 64 && clean[i + 3] && e4 !== 64) out += String.fromCharCode(c3);
  }
  return out;
}

/** Minimal WAV (16-bit PCM, mono/stereo) reader. */
function readWav(uri: string): Promise<WavResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = b64ToBinary(base64);
      const header = binary.slice(0, 44);
      // Parse fmt chunk (little-endian)
      const sampleRate =
        (header.charCodeAt(24) & 0xff) |
        ((header.charCodeAt(25) & 0xff) << 8) |
        ((header.charCodeAt(26) & 0xff) << 16) |
        ((header.charCodeAt(27) & 0xff) << 24);

      const dataSize =
        (header.charCodeAt(42) & 0xff) |
        ((header.charCodeAt(43) & 0xff) << 8) |
        ((header.charCodeAt(44) & 0xff) << 16) |
        ((header.charCodeAt(45) & 0xff) << 24);

      const samples: number[] = [];
      const offset = 44;
      for (let i = 0; i < dataSize && offset + i * 2 + 1 < binary.length; i += 2) {
        const lo = binary.charCodeAt(offset + i) & 0xff;
        const hi = binary.charCodeAt(offset + i + 1) & 0xff;
        const sample = (hi << 8) | lo;
        // Sign-extend 16-bit
        const signed = sample >= 0x8000 ? sample - 0x10000 : sample;
        samples.push(signed / 32768); // normalize to [-1, 1]
        i++; // skip the byte we manually consumed
      }

      resolve({ data: new Float32Array(samples), sampleRate });
    } catch (e) {
      reject(e);
    }
  });
}

/** Empty heuristic report used when no transcript is available. */
const EMPTY_REPORT: FluencyReport = {
  wordCount: 0,
  repetitions: 0,
  prolongations: 0,
  blocks: 0,
  disfluencies: 0,
  ratePerMin: 0,
  highlights: [],
  summary: 'Record a session to see analysis.',
};

/**
 * Main entry: analyze a recording and produce an `AnalysisResult`.
 */
export async function analyzeRecording(
  input: AnalysisInput,
): Promise<AnalysisResult> {
  const { clientId, deviceId } = await getIdentity();

  // Load + resample audio
  let pcm: Float32Array = new Float32Array(0);
  let sr = 16000;
  try {
    const loaded = await loadMonoFloat(input.recordingUri);
    pcm = loaded.pcm;
    sr = loaded.sr;
  } catch (e) {
    console.warn('Could not load audio PCM for analysis', e);
  }

  // ONNX inference (best-effort)
  let pStutter: number | null = null;
  let usedModel = false;
  if (pcm.length > 0 && (await isModelAvailable())) {
    try {
      const result = await predictStutter(pcm, sr);
      pStutter = Math.round(result.probability * 1000) / 1000; // 3dp
      usedModel = true;
    } catch (e) {
      console.warn('ONNX inference failed, falling back to heuristic', e);
    }
  }

  // Heuristic analysis (if we have a transcript)
  const report: FluencyReport = input.transcript
    ? analyzeFluency(input.transcript, 0) // durationSec could be added
    : EMPTY_REPORT;

  const durationSec = input.durationSec ?? (pcm.length > 0 ? pcm.length / sr : 0);

  const metric: RecordingMetric = {
    id: `${clientId}-${Date.now()}`,
    recordedAt: new Date().toISOString(),
    durationSec: Math.round(durationSec),
    pStutter,
    heuristic: {
      repetitions: report.repetitions,
      prolongations: report.prolongations,
      blocks: report.blocks,
      wordCount: report.wordCount,
      ratePerMin: report.ratePerMin,
      disfluencies: report.disfluencies,
    },
  };

  return {
    metric,
    usedModel,
    fluencySummary: input.transcript ? report.summary : null,
    easeRating: input.easeRating ?? null,
  };
}

/** Build the `IngestMetrics` payload from an analysis result. */
export function buildIngestPayload(
  result: AnalysisResult,
  identity: Awaited<ReturnType<typeof getIdentity>>,
): IngestMetrics {
  return {
    userId: identity.userId,
    deviceId: identity.deviceId,
    metrics: [result.metric],
  };
}
