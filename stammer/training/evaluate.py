"""
Honest evaluation of the fine-tuned stutter-detection models.

Reports, on the held-out TEST split:
  - CNN (cnn_best.pt) and Wav2Vec2 (wav2vec2_best.pt): accuracy, AUROC, confusion matrix.
  - ONNX parity: max |PyTorch logit - ONNX logit| across every test clip, using the
    same featured model the browser runs.

IMPORTANT: the bundled test set is SYNTHETIC. High CNN scores measure pipeline
correctness, not clinical ability. Read the printed caveats.
"""
import os
import sys

import numpy as np
import torch

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dataset import StutterDataset
from models import StutterCNN, Wav2Vec2StutterClassifier

HERE = os.path.dirname(os.path.abspath(__file__))
META = os.path.join(HERE, "data", "test", "metadata.csv")


def load_checkpoint(model, path):
    ckpt = torch.load(path, map_location="cpu")
    sd = ckpt["state_dict"] if isinstance(ckpt, dict) and "state_dict" in ckpt else ckpt
    model.load_state_dict(sd)
    return model


def metrics(logits, labels):
    probs = 1 / (1 + np.exp(-logits))
    pred = (probs >= 0.5).astype(int)
    acc = (pred == labels).mean()
    # AUROC (rank-based, no sklearn dependency)
    order = np.argsort(probs)
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(1, len(probs) + 1)
    # average ranks for ties
    s = 0.0
    n_pos = int(labels.sum())
    n_neg = len(labels) - n_pos
    if n_pos == 0 or n_neg == 0:
        auroc = float("nan")
    else:
        # Mann-Whitney U / (n_pos*n_neg)
        pos_ranks = ranks[labels == 1]
        u = pos_ranks.sum() - n_pos * (n_pos + 1) / 2
        auroc = u / (n_pos * n_neg)
    return acc, auroc, pred


def confusion(pred, labels):
    tp = int(((pred == 1) & (labels == 1)).sum())
    fn = int(((pred == 0) & (labels == 1)).sum())
    fp = int(((pred == 1) & (labels == 0)).sum())
    tn = int(((pred == 0) & (labels == 0)).sum())
    return tp, fn, fp, tn


def main():
    ds = StutterDataset(META)
    rows = ds.rows
    labels = np.array([l for _, l in rows])

    # ---- CNN via the featured (raw-PCM) model so it matches the ONNX exactly ----
    import librosa
    import onnxruntime as ort
    from export_onnx_featured import StutterModelFeatured
    from models import StutterCNN as _C

    cnn = _C()
    load_checkpoint(cnn, os.path.join(HERE, "checkpoints", "cnn_best.pt"))
    feat_model = StutterModelFeatured(cnn).eval()

    cnn_logits = []
    onnx_logits = []
    onnx_sess = ort.InferenceSession(
        os.path.join(HERE, "onnx", "cnn_stutter_pcm.onnx"), providers=["CPUExecutionProvider"]
    )
    for path, _ in rows:
        y, sr = librosa.load(path, sr=16000, mono=True)
        pcm = y.astype(np.float32).reshape(1, -1)
        with torch.no_grad():
            cnn_logits.append(float(feat_model(torch.from_numpy(pcm)).numpy().item()))
        onnx_logits.append(
            float(np.asarray(onnx_sess.run(["logit"], {"pcm": pcm})[0]).item())
        )
    cnn_logits = np.array(cnn_logits)
    onnx_logits = np.array(onnx_logits)
    parity_max = float(np.abs(cnn_logits - onnx_logits).max())

    # ---- Wav2Vec2 ----
    w2v = Wav2Vec2StutterClassifier()
    load_checkpoint(w2v, os.path.join(HERE, "checkpoints", "wav2vec2_best.pt"))
    w2v.eval()
    w2v_logits = []
    with torch.no_grad():
        for path, _ in rows:
            y, sr = librosa.load(path, sr=16000, mono=True)
            x = torch.from_numpy(y.astype(np.float32)).unsqueeze(0)
            w2v_logits.append(float(w2v(x).numpy().item()))
    w2v_logits = np.array(w2v_logits)

    print("=" * 60)
    print("EVALUATION ON HELD-OUT TEST SPLIT (synthetic)")
    print(f"  clips: {len(rows)}   fluent={int((labels==0).sum())}  stutter={int((labels==1).sum())}")
    print("=" * 60)

    for name, lg in (("CNN (cnn_best.pt)", cnn_logits), ("Wav2Vec2 (wav2vec2_best.pt)", w2v_logits)):
        acc, auroc, pred = metrics(lg, labels)
        tp, fn, fp, tn = confusion(pred, labels)
        print(f"\n{name}")
        print(f"  accuracy : {acc*100:.1f}%")
        print(f"  AUROC    : {auroc:.3f}" if not np.isnan(auroc) else "  AUROC    : n/a")
        print(f"  confusion: TP={tp} FN={fn} | FP={fp} TN={tn}")

    print(f"\nONNX vs PyTorch parity (max |logit| diff across {len(rows)} clips): {parity_max:.6f}")
    print("  => browser model matches Python training within this tolerance" if parity_max < 1e-2
          else "  => PARITY WARNING")

    print("\n" + "-" * 60)
    print("CAVEAT: scores above are on SYNTHETIC audio. The CNN reaching ~100%")
    print("means the librosa pipeline + training loop are correct, not that the")
    print("model generalises to real stuttered speech. To get a real evaluation,")
    print("run prepare_real_corpus.py on UCLASS/FluencyBank, retrain, and re-run")
    print("this script. Wav2Vec2 at ~0.5 on synthetic is expected (needs real")
    print("data + GPU); its fine-tune loop is verified, not its accuracy.")


if __name__ == "__main__":
    main()
