"""
Self-contained ONNX export for in-browser inference.

Wraps the trained StutterCNN with a faithful librosa-equivalent feature frontend
(torchaudio MelSpectrogram + AmplitudeToDB + ComputeDeltas) so the exported ONNX
graph takes **raw 16 kHz mono PCM** (Float32) and outputs a raw logit. This
guarantees feature parity between Python training and the browser (no fragile
JS DSP reimplementation), so the only browser code needed is an ONNX runtime +
a PCM resampler.

Usage:
  .venv/Scripts/python.exe training/export_onnx_raw.py
Produces: training/onnx/cnn_stutter_raw.onnx
"""
import os
import sys
import torch
import torch.nn as nn
import torchaudio
import torchaudio.transforms as T

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from models import StutterCNN  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, "checkpoints", "cnn_best.pt")
OUT = os.path.join(HERE, "onnx", "cnn_stutter_raw.onnx")

N_MELS = 64
TARGET_FRAMES = 128
SAMPLE_RATE = 16000


class StutterModelRaw(nn.Module):
    """Raw-waveform -> logit. Mirrors dataset.py feature extraction exactly."""

    def __init__(self, cnn: nn.Module):
        super().__init__()
        self.mel = T.MelSpectrogram(
            sample_rate=SAMPLE_RATE, n_fft=400, hop_length=160, n_mels=N_MELS,
            norm="slaney", mel_scale="slaney",
        )
        self.db = T.AmplitudeToDB(stype="power", top_db=80.0)
        # ComputeDeltas expects (channels, freq, time); operate on the 1-channel mel.
        self.delta = T.ComputeDeltas(win_length=5)
        self.cnn = cnn

    def forward(self, wav: torch.Tensor) -> torch.Tensor:
        # wav: (batch, time) float in [-1, 1]
        mel = self.mel(wav)                       # (b, n_mels, time)
        logS = self.db(mel).unsqueeze(1)          # (b, 1, n_mels, time)
        d1 = self.delta(logS)
        d2 = self.delta(d1)
        feat = torch.cat([logS, d1, d2], dim=1)  # (b, 3, n_mels, time)
        Tf = feat.shape[3]
        if Tf < TARGET_FRAMES:
            feat = torch.nn.functional.pad(feat, (0, TARGET_FRAMES - Tf))
        else:
            feat = feat[:, :, :, :TARGET_FRAMES]
        return self.cnn(feat)


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    ckpt = torch.load(CKPT, map_location="cpu")
    cnn = StutterCNN()
    cnn.load_state_dict(ckpt["state_dict"])
    model = StutterModelRaw(cnn).eval()

    dummy = torch.randn(1, SAMPLE_RATE, dtype=torch.float32)  # 1s of audio
    torch.onnx.export(
        model,
        dummy,
        OUT,
        input_names=["pcm"],
        output_names=["logit"],
        dynamic_axes={"pcm": {0: "batch", 1: "time"}, "logit": {0: "batch"}},
        opset_version=17,
        dynamo=False,
        external_data=False,
    )
    print(f"Exported raw-input ONNX model to {OUT}")

    # Parity check against the original PyTorch feature+model path.
    try:
        import numpy as np
        import onnxruntime as ort
        from dataset import StutterDataset

        ds = StutterDataset(os.path.join(HERE, "data", "test", "metadata.csv"))
        wav, sr = torchaudio.load(ds.rows[0][0])
        wav = torchaudio.functional.resample(wav, sr, SAMPLE_RATE).mean(0, keepdim=True)
        x = wav.numpy().astype(np.float32)
        sess = ort.InferenceSession(OUT, providers=["CPUExecutionProvider"])
        onnx_val = float(np.asarray(sess.run(["logit"], {"pcm": x})[0]).item())
        with torch.no_grad():
            pt_val = float(model(wav).numpy().item())
        print(f"PyTorch logit={pt_val:.4f}  ONNX logit={onnx_val:.4f}  "
              f"diff={abs(onnx_val - pt_val):.6f}")
        assert abs(onnx_val - pt_val) < 1e-3, "ONNX/PyTorch diverge"
        print("Parity check PASSED — raw ONNX matches PyTorch feature+model path.")
    except ImportError:
        print("(onnxruntime missing; skipping parity check.)")


if __name__ == "__main__":
    main()
