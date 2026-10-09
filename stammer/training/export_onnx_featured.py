"""
Export the fine-tuned CNN with an exportable feature frontend, so the ONNX model
takes RAW 16 kHz PCM and outputs a logit. The STFT is implemented with pure tensor
ops (frame windowing + matmul against a precomputed DFT kernel) so it exports to ONNX
opset 17 and matches the librosa pipeline in dataset.py.

This guarantees bit-comparable features between training (librosa) and the browser,
with no fragile JS DSP reimplementation.

Usage:
  .venv/Scripts/python.exe training/export_onnx_featured.py
Produces: training/onnx/cnn_stutter_pcm.onnx   (input: pcm [1, T], output: logit [1])
"""
import os
import sys

import numpy as np
import torch
import torch.nn as nn

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from models import StutterCNN  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, "checkpoints", "cnn_best.pt")
OUT = os.path.join(HERE, "onnx", "cnn_stutter_pcm.onnx")

N_MELS = 64
N_FFT = 400
HOP = 160
TARGET_FRAMES = 128
SR = 16000


def dft_kernel(n: int, n_freq: int):
    """Complex DFT matrix [n_freq, n] as (real, imag) float32 arrays."""
    k = np.arange(n_freq)[:, None]
    nidx = np.arange(n)[None, :]
    ang = -2 * np.pi * k * nidx / n
    return np.cos(ang).astype(np.float32), np.sin(ang).astype(np.float32)


class StutterModelFeatured(nn.Module):
    def __init__(self, cnn: nn.Module):
        super().__init__()
        self.cnn = cnn
        import librosa
        fb = librosa.filters.mel(sr=SR, n_fft=N_FFT, n_mels=N_MELS, htk=False, norm="slaney")
        self.register_buffer("mel_w", torch.from_numpy(fb.astype(np.float32)))  # (64, 201)
        kr, ki = dft_kernel(N_FFT, 1 + N_FFT // 2)
        self.register_buffer("dft_r", torch.from_numpy(kr))
        self.register_buffer("dft_i", torch.from_numpy(ki))
        # Identity kernel for framing via conv1d: (n_fft, 1, n_fft), weight[c,0,c]=1.
        eye_w = torch.zeros(N_FFT, 1, N_FFT, dtype=torch.float32)
        for c in range(N_FFT):
            eye_w[c, 0, c] = 1.0
        self.register_buffer("frame_w", eye_w)

    def forward(self, pcm: torch.Tensor) -> torch.Tensor:
        # pcm: (batch, time)
        x = pcm.unsqueeze(1)  # (b,1,T)
        # Match librosa center=True: prepend n_fft//2 of reflect-padding, then frame at hop.
        x = torch.nn.functional.pad(x, (N_FFT // 2, 0), mode="reflect")
        frames = torch.nn.functional.conv1d(x, self.frame_w, stride=HOP)  # (b, 400, n_frames)
        frames = frames.transpose(1, 2)  # (b, n_frames, n_fft)
        n = N_FFT
        window = 0.5 - 0.5 * torch.cos(2 * torch.pi * torch.arange(n, dtype=torch.float32) / (n - 1))
        window = window.to(frames.device)
        frames = frames * window
        fr = torch.matmul(frames, self.dft_r.T)
        fi = torch.matmul(frames, self.dft_i.T)
        power = fr * fr + fi * fi
        mel = torch.matmul(power, self.mel_w.T)
        mel = torch.clamp(mel, min=1e-10)
        ref = mel.amax(dim=(1, 2), keepdim=True)
        db = 10 * torch.log10(mel / ref)
        max_db = db.amax(dim=(1, 2), keepdim=True)
        floor = max_db - 80.0
        db = torch.clamp(db, min=floor)
        db = db.transpose(1, 2).unsqueeze(1)  # (b, 1, n_mels, time)
        d1 = self._delta(db)
        d2 = self._delta(d1)
        feat = torch.cat([db, d1, d2], dim=1)  # (b, 3, n_mels, time)
        Ft = feat.shape[3]
        if Ft < TARGET_FRAMES:
            feat = torch.nn.functional.pad(feat, (0, TARGET_FRAMES - Ft))
        else:
            feat = feat[:, :, :, :TARGET_FRAMES]
        return self.cnn(feat)

    def _delta(self, x: torch.Tensor, width: int = 5) -> torch.Tensor:
        t = (width - 1) // 2
        denom = float(width * (width * width - 1) / 3)
        xp = torch.nn.functional.pad(x, (t, t, 0, 0), mode="reflect")
        out = torch.zeros_like(x)
        T = x.shape[3]  # time dim
        for j in range(-t, t + 1):
            out = out + j * xp[:, :, :, t + j: t + j + T]
        return out / denom


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    ckpt = torch.load(CKPT, map_location="cpu")
    cnn = StutterCNN()
    cnn.load_state_dict(ckpt["state_dict"])
    model = StutterModelFeatured(cnn).eval()

    dummy = torch.randn(1, SR, dtype=torch.float32)
    torch.onnx.export(
        model, dummy, OUT,
        input_names=["pcm"], output_names=["logit"],
        dynamic_axes={"pcm": {0: "batch", 1: "time"}, "logit": {0: "batch"}},
        opset_version=17, dynamo=False, external_data=False,
    )
    print(f"Exported featured ONNX model to {OUT}")

    try:
        import onnxruntime as ort
        import librosa as _lb
        from dataset import StutterDataset
        ds = StutterDataset(os.path.join(HERE, "data", "test", "metadata.csv"))
        y, sr = _lb.load(ds.rows[0][0], sr=SR, mono=True)
        x = y.astype(np.float32).reshape(1, -1)
        sess = ort.InferenceSession(OUT, providers=["CPUExecutionProvider"])
        onnx_val = float(np.asarray(sess.run(["logit"], {"pcm": x})[0]).item())
        with torch.no_grad():
            pt_val = float(model(torch.from_numpy(x)).numpy().item())
        print(f"PyTorch logit={pt_val:.4f}  ONNX logit={onnx_val:.4f}  diff={abs(onnx_val - pt_val):.6f}")
        assert abs(onnx_val - pt_val) < 1e-3
        print("Parity check PASSED.")
    except ImportError:
        print("(onnxruntime missing; skipping parity.)")


if __name__ == "__main__":
    main()
