/**
 * In-browser (on-device) inference for the fine-tuned stutter-detection ONNX
 * model, ported to `onnxruntime-react-native`.
 *
 * `cnn_stutter_pcm.onnx` takes RAW 16 kHz mono PCM and internally performs the
 * exact librosa feature extraction (log-Mel + deltas) the model was trained on.
 * The mobile client just needs to feed a resampled waveform — same contract as
 * `speech-therapy-app/src/lib/stutterModel.ts` (onnxruntime-web).
 *
 * The model is **not** committed to git (377 MB) — it is shipped as a bundle
 * asset. If the model fails to load or is absent, callers should treat the
 * result as `pStutter = null` (the shared schema allows nullable).
 */
import { InferenceSession, Tensor } from 'onnxruntime-react-native';

// On RN, the model asset is placed in the app bundle via `require`. We resolve
// it lazily so a failed bundle inclusion doesn't crash import time.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const MODEL_URI = require('../assets/models/cnn_stutter_pcm.onnx');

let session: InferenceSession | null = null;

async function getSession(): Promise<InferenceSession> {
  if (!session) {
    session = await InferenceSession.create(MODEL_URI, {
      executionProviders: ['cpu'], // RN CPU EP
      graphOptimizationLevel: 'all',
    });
  }
  return session;
}

/**
 * Run inference on raw mono PCM at `sr` Hz. Returns P(stutter) in [0,1].
 *
 * @throws if the model can't load — callers MUST catch and fall back to
 * `pStutter = null` (heuristic-only mode).
 */
export async function predictStutter(
  pcm: Float32Array,
  sr: number,
): Promise<{ probability: number; logit: number }> {
  const mono = sr !== 16000 ? resample16k(pcm, sr) : pcm;
  const s = await getSession();
  const tensor = new Tensor('float32', mono, [1, mono.length]);
  const out = await s.run({ pcm: tensor });
  const logit = (out.logit.data as Float32Array | Float64Array)[0] as number;
  const probability = 1 / (1 + Math.exp(-logit)); // sigmoid
  return { probability, logit };
}

/** Linear-interpolation resample to 16 kHz (same algo as the PWA). */
function resample16k(x: Float32Array, from: number): Float32Array {
  if (from === 16000) return x;
  const ratio = 16000 / from;
  const n = Math.max(1, Math.round(x.length * ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const src = i / ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(x.length - 1, i0 + 1);
    const frac = src - i0;
    out[i] = x[i0] * (1 - frac) + x[i1] * frac;
  }
  return out;
}

/**
 * Whether the model asset is present in the bundle. We probe the session
 * lazily — if `require` failed at build time the import itself throws, so we
 * expose this as a guard for UI to decide whether to attempt inference.
 */
export async function isModelAvailable(): Promise<boolean> {
  try {
    await getSession();
    return true;
  } catch {
    return false;
  }
}
