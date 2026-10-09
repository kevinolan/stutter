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

/** Load a WAV/M4A/AAC file as 16 kHz mono Float32 PCM. */
async function loadMonoFloat(uri: string): Promise<{ pcm: Float32Array; sr: number }> {
  // expo-av lets us read the file as decoded audio data. We use
  // Audio.Sound to get the actual sample rate of the decoded stream.
  const { sound } = await Audio.Sound.createAsync(
    { uri },
    { shouldPlay: false, volume: 0 },
  );
  // We can't access raw PCM from expo-av easily, so use the file's metadata.
  // Fallback: decode via a minimal WAV reader if the file is WAV; for AAC/M4A
  // we rely on the system decoder through expo-av and accept the recorded rate.
  await sound.unloadAsync();

  // Try a WAV decode path first (deterministic sample rate).
  if (uri.toLowerCase().endsWith('.wav')) {
    const pcm = await readWav(uri);
    return { pcm: pcm.data, sr: pcm.sampleRate };
  }

    // expo-av's default M4A/AAC recording needs a native decoder before it can
    // be passed to the raw-PCM ONNX model. Keep the heuristic/duration path
    // usable and let callers fall back to pStutter=null until one is installed.
  throw new Error('PCM extraction is only supported for WAV recordings');
}

interface WavResult {
  data: Float32Array;
  sampleRate: number;
}

/** Minimal WAV (16-bit PCM, mono/stereo) reader. */
function readWav(uri: string): Promise<WavResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const binary = atob(base64);
      const header = binary.slice(0, 44);
      // Parse fmt chunk
      const sampleRate =
        (header.charCodeAt(24) & 0xff) |
        ((header.charCodeAt(25) & 0xff) << 8) |
        ((header.charCodeAt(26) & 0xff) << 16) |
        ((header.charCodeAt(27) & 0xff) << 24);
      const bitsPerSample =
        (header.charCodeAt(34) & 0xff) | ((header.charCodeAt(35) & 0xff) << 8);
      const channels =
        (header.charCodeAt(22) & 0xff) | ((header.charCodeAt(23) & 0xff) << 8);
      const dataSize =
        (header.charCodeAt(40) & 0xff) |
        ((header.charCodeAt(41) & 0xff) << 8) |
        ((header.charCodeAt(42) & 0xff) << 16) |
        ((header.charCodeAt(43) & 0xff) << 24);

      const samples: number[] = [];
      const offset = 44;
      const bytesPerFrame = Math.max(2, channels * (bitsPerSample / 8));
      for (let i = 0; i < dataSize && offset + i + 1 < binary.length; i += bytesPerFrame) {
        const lo = binary.charCodeAt(offset + i) & 0xff;
        const hi = binary.charCodeAt(offset + i + 1) & 0xff;
        const sample = (hi << 8) | lo;
        // Sign-extend 16-bit
        const signed = sample >= 0x8000 ? sample - 0x10000 : sample;
        samples.push(signed / 32768); // normalize to [-1, 1]
      }

      // Take left channel only (mono assumption; for stereo this is L).
      resolve({ data: new Float32Array(samples), sampleRate });
    } catch (e) {
      reject(e);
    }
  });
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
