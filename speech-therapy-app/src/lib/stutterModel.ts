/**
 * In-browser inference for the fine-tuned stutter-detection ONNX model.
 *
 * Uses onnxruntime-web (WASM) to run `cnn_stutter_pcm.onnx`, which takes RAW 16 kHz
 * mono PCM and internally performs the exact librosa feature extraction (log-Mel +
 * deltas) the model was trained on — see training/export_onnx_featured.py. No JS DSP
 * reimplementation is needed; the browser feeds the same waveform the Python pipeline
 * was trained and validated against (PyTorch vs ONNX logit diff < 1e-6).
 *
 * onnxruntime-web is dynamically imported so the ~2 MB WASM bundle only loads when the
 * user actually records — keeping the initial app payload small.
 */
export const STUTTER_MODEL_URL = '/models/cnn_stutter_pcm.onnx';

let sessionPromise: Promise<import('onnxruntime-web').InferenceSession> | null = null;

async function getSession() {
  if (!sessionPromise) {
    const ort = await import('onnxruntime-web');
    sessionPromise = ort.InferenceSession.create(STUTTER_MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  }
  return sessionPromise;
}

/** Run inference on raw mono PCM at `sr` Hz. Returns P(stutter) in [0,1]. */
export async function predictStutter(
  pcm: Float32Array,
  sr: number,
): Promise<{ probability: number; logit: number }> {
  if (sr !== 16000) {
    pcm = await resample(pcm, sr, 16000);
  }
  const session = await getSession();
  const ort = await import('onnxruntime-web');
  const tensor = new ort.Tensor('float32', pcm, [1, pcm.length]);
  const out = await session.run({ pcm: tensor });
  const logit = (out.logit.data as Float32Array | Float64Array)[0];
  const probability = 1 / (1 + Math.exp(-logit)); // sigmoid
  return { probability, logit };
}

/** Simple linear-interpolation resampler (good enough for 44.1k -> 16k). */
function resample(x: Float32Array, from: number, to: number): Float32Array {
  const ratio = to / from;
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
