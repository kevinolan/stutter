"""
Generate a SYNTHETIC stutter-speech dataset for developing and verifying the
training pipeline. This is NOT real clinical data — it only exists so the
train/fine-tune loop can be exercised end-to-end without a corpus.

Acoustic differences are deliberately discriminable:
  - fluent   : harmonic tone with a smooth syllabic amplitude envelope
  - stuttered: same signal + inserted silence "blocks", repeated segments
               ("repetitions"), and stretched segments ("prolongations")

Swap in a real corpus later by replacing data/<split>/metadata.csv with
rows:  absolute_audio_path, label   (label 1 = contains stutter, 0 = fluent)
"""
import os
import math
import random

import numpy as np
import soundfile as sf

SR = 16000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")

N_PER_CLASS = {"train": 80, "val": 20, "test": 20}


def synth_fluent(sr: int, dur: float) -> np.ndarray:
    n = int(sr * dur)
    t = np.linspace(0.0, dur, n, endpoint=False)
    f0 = random.uniform(110.0, 180.0)
    sig = np.zeros(n, dtype=np.float32)
    for k, amp in zip([1, 2, 3, 4, 5], [1.0, 0.6, 0.4, 0.25, 0.15]):
        phase = np.random.uniform(0, 2 * math.pi)
        sig += amp * np.sin(2 * math.pi * f0 * k * t + phase)
    # syllabic (word-like) amplitude envelope
    env = 0.55 + 0.45 * np.sin(2 * math.pi * random.uniform(2.5, 3.5) * t + random.uniform(0, 2 * math.pi))
    sig = sig * env
    sig = sig + 0.01 * np.random.randn(n).astype(np.float32)
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.8
    return sig.astype(np.float32)


def inject_stutter(sig: np.ndarray, sr: int) -> np.ndarray:
    n = len(sig)
    out = list(sig.tolist())

    # 1) Blocks: insert short silence gaps
    for _ in range(random.randint(1, 3)):
        pos = random.randint(int(0.2 * n), int(0.8 * n))
        gap = random.randint(int(0.07 * sr), int(0.16 * sr))
        end = min(pos + gap, n)
        out[pos:end] = [0.0] * (end - pos)

    # 2) Repetitions: paste a segment 2-3x right after itself
    seg = int(0.12 * sr)
    pos = random.randint(int(0.2 * n), int(0.55 * n))
    if pos + seg <= n:
        snippet = out[pos:pos + seg]
        reps = random.choice([2, 3])
        end = min(pos + seg + seg * reps, n)
        out[pos + seg:end] = (snippet * reps)[: end - (pos + seg)]

    # 3) Prolongation: stretch a short region (sustained energy plateau)
    p0 = random.randint(int(0.3 * n), int(0.7 * n))
    pseg = out[p0:p0 + int(0.06 * sr)]
    if len(pseg) > 4:
        stretched = []
        for s in pseg:
            stretched += [s, s]
        out[p0:p0 + len(pseg)] = stretched[: len(pseg)]

    return np.array(out, dtype=np.float32)


def save_wav(path: str, sig: np.ndarray, sr: int) -> None:
    sf.write(path, sig.astype(np.float32), sr)


def main() -> None:
    random.seed(42)
    splits = {}
    for split, per in N_PER_CLASS.items():
        for cls, label in [("fluent", 0), ("stutter", 1)]:
            d = os.path.join(OUT, split, cls)
            os.makedirs(d, exist_ok=True)
            rows = []
            for i in range(per):
                dur = random.uniform(1.2, 1.8)
                sig = synth_fluent(SR, dur)
                if label == 1:
                    sig = inject_stutter(sig, SR)
                fname = f"{cls}_{i:03d}.wav"
                save_wav(os.path.join(d, fname), sig, SR)
                rows.append((os.path.join(d, fname), label))
            splits.setdefault(split, []).extend(rows)

    for sp, rows in splits.items():
        with open(os.path.join(OUT, sp, "metadata.csv"), "w") as f:
            f.write("file,label\n")
            for path, label in rows:
                f.write(f"{path},{label}\n")

    total = sum(len(v) for v in splits.values())
    print(f"Generated {total} synthetic clips under {OUT}")
    for sp, rows in splits.items():
        pos = sum(1 for _, l in rows if l == 1)
        print(f"  {sp}: {len(rows)} clips ({pos} stuttered)")


if __name__ == "__main__":
    main()
