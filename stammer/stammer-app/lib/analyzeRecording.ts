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
import { predictStutter, isModelAvailable } from './stutterModelRN';
import { analyzeFluency } from './fluency';
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
  /** Duration from the recorder, used when compressed audio cannot be decoded to PCM. */
  durationSec?: number;
  /** Optional transcript (from on-device STT in Phase 2, or typed by the user). */
  transcript?: string;
  /** Optional self-reported communication-ease rating 0–100. */
  easeRating?: number;
}

/**
 * Load a recording as mono Float32 PCM at its native sample rate.
 *
 * Only WAV (16-bit linear PCM) can be decoded without a native decoder. iOS
 * records WAV (see `RECORDING_OPTIONS` in app/train.tsx); Android's
 * MediaRecorder cannot, so Android recordings throw here and the caller falls
 * back to `pStutter = null`.
 */
async function loadMonoFloat(uri: string): Promise<{ pcm: Float32Array; sr: number }> {
  if (!uri.toLowerCase().endsWith('.wav')) {
    throw new Error('PCM extraction is only supported for WAV recordings');
  }
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { data, sampleRate } = decodeWav(base64ToBytes(base64));
  return { pcm: data, sr: sampleRate };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Decode a 16-bit PCM WAV into mono Float32 (first channel).
 *
 * Walks the RIFF chunk list instead of assuming a 44-byte header: iOS
 * AVAudioRecorder inserts a `FLLR` padding chunk before `data`, so fixed
 * offsets read garbage there.
 */
export function decodeWav(bytes: Uint8Array): { data: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') {
    throw new Error('Not a RIFF/WAVE file');
  }

  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataSize = 0;

  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = tag(pos);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === 'fmt ') {
      const format = view.getUint16(body, true);
      if (format !== 1 && format !== 0xfffe) throw new Error(`Unsupported WAV format ${format}`);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      dataStart = body;
      dataSize = Math.min(size, bytes.length - body);
      break;
    }
    pos = body + size + (size % 2); // chunks are word-aligned
  }

  if (dataStart < 0 || !sampleRate || !channels) throw new Error('WAV missing fmt/data chunk');
  if (bitsPerSample !== 16) throw new Error(`Unsupported WAV bit depth ${bitsPerSample}`);

  const frameBytes = channels * 2;
  const frames = Math.floor(dataSize / frameBytes);
  const data = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    data[f] = view.getInt16(dataStart + f * frameBytes, true) / 32768;
  }
  return { data, sampleRate };
}

/**
 * Main entry: analyze a recording and produce an `IngestMetrics` payload.
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
  if (pcm.length > 0 && await isModelAvailable()) {
    try {
      const result = await predictStutter(pcm, sr);
      pStutter = Math.round(result.probability * 1000) / 1000; // 3dp
      usedModel = true;
    } catch (e) {
      console.warn('ONNX inference failed, falling back to heuristic', e);
    }
  }

  // Heuristic analysis (if we have a transcript)
  const durationSec = input.durationSec ?? (pcm.length > 0 ? pcm.length / sr : 0);
  const report = input.transcript
    ? analyzeFluency(input.transcript, durationSec)
    : {
        repetitions: 0,
        prolongations: 0,
        blocks: 0,
        wordCount: 0,
        ratePerMin: 0,
        disfluencies: 0,
        summary: '',
      };

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
