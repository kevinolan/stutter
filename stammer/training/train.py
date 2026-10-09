"""
Training + fine-tuning driver.

Usage:
  python train.py --model cnn          # librosa-feature CNN baseline
  python train.py --model wav2vec2     # torchaudio Wav2Vec2 fine-tune
  python train.py --model cnn --epochs 10 --resume checkpoints/cnn_best.pt

Outputs:
  - checkpoints/<model>_best.pt  (state_dict + config, the fine-tuned weights)
  - metrics.json                 (per-epoch loss/acc/auroc)
"""
import argparse
import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import roc_auc_score

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dataset import get_loaders, get_raw_loaders  # noqa: E402
from models import build_model  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
CKPT_DIR = os.path.join(HERE, "checkpoints")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def train_one_epoch(model, loader, optimizer, criterion, is_raw: bool):
    model.train()
    running_loss, correct, total = 0.0, 0, 0
    for x, y in loader:
        if is_raw:
            x = x.to(DEVICE)
        else:
            x = x.to(DEVICE)
        y = y.to(DEVICE)
        optimizer.zero_grad()
        logits = model(x)
        loss = criterion(logits, y)
        loss.backward()
        optimizer.step()
        running_loss += loss.item() * x.size(0)
        preds = (torch.sigmoid(logits) > 0.5).float()
        correct += (preds == y).sum().item()
        total += y.size(0)
    return running_loss / max(total, 1), correct / max(total, 1)


@torch.no_grad()
def evaluate(model, loader, criterion, is_raw: bool):
    model.eval()
    running_loss, correct, total = 0.0, 0, 0
    all_y, all_p = [], []
    for x, y in loader:
        x = x.to(DEVICE)
        y = y.to(DEVICE)
        logits = model(x)
        loss = criterion(logits, y)
        running_loss += loss.item() * x.size(0)
        probs = torch.sigmoid(logits)
        preds = (probs > 0.5).float()
        correct += (preds == y).sum().item()
        total += y.size(0)
        all_y.append(y.cpu().numpy())
        all_p.append(probs.cpu().numpy())
    auroc = 0.0
    try:
        auroc = float(roc_auc_score(np.concatenate(all_y), np.concatenate(all_p)))
    except ValueError:
        pass
    return running_loss / max(total, 1), correct / max(total, 1), auroc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["cnn", "wav2vec2"], default="cnn")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--resume", type=str, default=None)
    ap.add_argument("--data_root", type=str, default=DATA_DIR,
                    help="dataset root containing train/val/test metadata.csv")
    ap.add_argument("--no-synth", action="store_true", help="skip dataset generation")
    args = ap.parse_args()

    os.makedirs(CKPT_DIR, exist_ok=True)
    is_raw = args.model == "wav2vec2"
    data_dir = os.path.abspath(args.data_root)

    # Ensure a dataset exists.
    meta = os.path.join(data_dir, "train", "metadata.csv")
    if not os.path.exists(meta) and data_dir == os.path.abspath(DATA_DIR) and not args.no_synth:
        print("Synthetic dataset missing — generating now...")
        import generate_data
        generate_data.main()

    if is_raw:
        train_loader, val_loader = get_raw_loaders(data_dir, batch_size=args.batch_size)
    else:
        train_loader, val_loader, _ = get_loaders(data_dir, batch_size=args.batch_size)

    model = build_model(args.model).to(DEVICE)
    if args.resume and os.path.exists(args.resume):
        model.load_state_dict(torch.load(args.resume, map_location=DEVICE))
        print(f"Resumed weights from {args.resume}")

    criterion = nn.BCEWithLogitsLoss()
    optimizer = torch.optim.AdamW(
        [p for p in model.parameters() if p.requires_grad], lr=args.lr
    )

    print(f"Training '{args.model}' on {DEVICE} for {args.epochs} epochs "
          f"({len(train_loader.dataset)} train / {len(val_loader.dataset)} val)")
    history = []
    best_acc = 0.0
    for epoch in range(1, args.epochs + 1):
        tr_loss, tr_acc = train_one_epoch(model, train_loader, optimizer, criterion, is_raw)
        vl_loss, vl_acc, vl_auc = evaluate(model, val_loader, criterion, is_raw)
        print(f"epoch {epoch:02d} | train loss {tr_loss:.4f} acc {tr_acc:.3f} | "
              f"val loss {vl_loss:.4f} acc {vl_acc:.3f} auroc {vl_auc:.3f}")
        history.append({
            "epoch": epoch, "train_loss": tr_loss, "train_acc": tr_acc,
            "val_loss": vl_loss, "val_acc": vl_acc, "val_auroc": vl_auc,
        })
        if vl_acc >= best_acc:
            best_acc = vl_acc
            ckpt = os.path.join(CKPT_DIR, f"{args.model}_best.pt")
            torch.save({"model": args.model, "state_dict": model.state_dict()}, ckpt)
            print(f"  -> saved best checkpoint to {ckpt}")

    with open(os.path.join(HERE, "metrics.json"), "w") as f:
        json.dump(history, f, indent=2)
    print("Done. Wrote metrics.json")


if __name__ == "__main__":
    main()
