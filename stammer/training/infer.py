"""
Inference: load a fine-tuned checkpoint and score an audio file.

Usage:
  python infer.py checkpoints/cnn_best.pt path/to/audio.wav
"""
import argparse
import os
import sys

import numpy as np
import soundfile as sf
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dataset import N_MELS, TARGET_FRAMES  # noqa: E402
from models import build_model  # noqa: E402

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def mel_features(path: str) -> torch.Tensor:
    import librosa
    y, sr = librosa.load(path, sr=16000, mono=True)
    S = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=N_MELS, n_fft=400, hop_length=160)
    logS = librosa.power_to_db(S, ref=np.max)
    delta = librosa.feature.delta(logS)
    delta2 = librosa.feature.delta(logS, order=2)
    feat = np.stack([logS, delta, delta2], axis=0).astype(np.float32)
    T = feat.shape[2]
    if T < TARGET_FRAMES:
        feat = np.pad(feat, ((0, 0), (0, 0), (0, TARGET_FRAMES - T)))
    else:
        feat = feat[:, :, :TARGET_FRAMES]
    return torch.from_numpy(feat).unsqueeze(0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("audio")
    args = ap.parse_args()

    ckpt = torch.load(args.checkpoint, map_location=DEVICE)
    model = build_model(ckpt["model"]).to(DEVICE)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    with torch.no_grad():
        if ckpt["model"] == "wav2vec2":
            wav, _ = sf.read(args.audio, dtype="float32")
            if wav.ndim > 1:
                wav = wav.mean(axis=1)
            wav = torch.from_numpy(wav).unsqueeze(0).to(DEVICE)  # (1, time)
            logit = model(wav)
        else:
            x = mel_features(args.audio).to(DEVICE)
            logit = model(x)
        prob = torch.sigmoid(logit).item()
    print(f"P(stutter) = {prob:.3f}  -> {'STUTTERED' if prob > 0.5 else 'fluent'}")


if __name__ == "__main__":
    main()
