"""
Export the fine-tuned StutterCNN to ONNX for in-browser inference (onnxruntime-web).

Input:  (1, 3, 64, 128) float32  log-Mel features (librosa: logS, delta, delta2)
Output: (1,) float32              raw logit (apply sigmoid -> P(stutter))

Usage:
  .venv/Scripts/python.exe training/export_onnx.py
"""
import os
import sys

import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from models import StutterCNN  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, "checkpoints", "cnn_best.pt")
OUT = os.path.join(HERE, "onnx", "cnn_stutter.onnx")


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    ckpt = torch.load(CKPT, map_location="cpu")
    model = StutterCNN()
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    dummy = torch.randn(1, 3, 64, 128, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        OUT,
        input_names=["features"],
        output_names=["logit"],
        dynamic_axes={"features": {0: "batch"}, "logit": {0: "batch"}},
        opset_version=13,
        dynamo=False,
        external_data=False,
    )
    print(f"Exported ONNX model to {OUT}")

    # Sanity-check: ONNX Runtime produces the same logit as PyTorch.
    try:
        import onnxruntime as ort
        import numpy as np

        sess = ort.InferenceSession(OUT, providers=["CPUExecutionProvider"])
        x = dummy.numpy().astype(np.float32)
        onnx_out = sess.run(["logit"], {"features": x})[0]
        onnx_val = float(np.asarray(onnx_out).item())
        with torch.no_grad():
            pt_out = float(model(dummy).numpy().item())
        diff = float(np.abs(onnx_val - pt_out).max())
        print(f"PyTorch logit={pt_out:.4f}  ONNX logit={onnx_val:.4f}  max|diff|={diff:.6f}")
        assert diff < 1e-4, "ONNX/PyTorch outputs diverge"
        print("Parity check PASSED — ONNX matches PyTorch.")
    except ImportError:
        print("(onnxruntime not installed yet; skipping parity check.)")


if __name__ == "__main__":
    main()
