"""
Prepare a REAL stuttering speech corpus for training.

The training pipeline (train.py / dataset.py) consumes a metadata CSV with columns:
    file,label
where `file` is a path to a 16 kHz mono WAV and `label` is 0 (fluent) or 1 (stutter).

This script takes a raw corpus laid out as:
    <in_root>/fluent/*.wav   (or any audio)
    <in_root>/stutter/*.wav
(or a pre-existing labels.csv with `path,label` columns) and:
  1. resamples every clip to 16 kHz mono WAV,
  2. writes them (or symlinks) under <out_root>/<split>/,
  3. writes <out_root>/metadata.csv (file,label) in the format train.py expects.

Then point training at it:
    python training/train.py --data_root <out_root> --model cnn

Usage:
    # From a fluent/ + stutter/ layout:
    python training/prepare_real_corpus.py --in_root /path/corpus --out_root training/data/real
    # From an existing labels.csv (columns: path,label[,split]):
    python training/prepare_real_corpus.py --labels_csv /path/labels.csv --out_root training/data/real
"""
import argparse
import csv
import os
import random
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

TARGET_SR = 16000


def resample_copy(src: str, dst: str) -> None:
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    y, sr = sf.read(src, dtype="float32", always_2d=False)
    if y.ndim > 1:
        y = y.mean(axis=1)
    if sr != TARGET_SR:
        # Simple linear resample (good enough; librosa resample is higher quality if desired).
        ratio = TARGET_SR / sr
        n = max(1, int(round(len(y) * ratio)))
        idx = np.linspace(0, len(y) - 1, n)
        y = np.interp(idx, np.arange(len(y)), y).astype(np.float32)
    sf.write(dst, y, TARGET_SR)


def from_split_folders(in_root: str, out_root: str) -> str:
    rows = []
    for label_name, label in (("fluent", 0), ("stutter", 1)):
        src_dir = os.path.join(in_root, label_name)
        if not os.path.isdir(src_dir):
            print(f"[warn] no folder {src_dir}; skipping")
            continue
        for fn in sorted(os.listdir(src_dir)):
            if not fn.lower().endswith((".wav", ".flac", ".mp3", ".ogg", ".m4a")):
                continue
            dst = os.path.join(out_root, label_name, f"{len(rows):06d}_{os.path.splitext(fn)[0]}.wav")
            resample_copy(os.path.join(src_dir, fn), dst)
            rows.append((dst, label))
    return write_metadata(rows, out_root)


def from_labels_csv(labels_csv: str, out_root: str) -> str:
    rows = []
    with open(labels_csv, newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            path = r.get("path") or r.get("file")
            label = int(r["label"])
            base = os.path.splitext(os.path.basename(path))[0]
            split = (r.get("split") or ("stutter" if label else "fluent"))
            dst = os.path.join(out_root, split, f"{len(rows):06d}_{base}.wav")
            resample_copy(path, dst)
            rows.append((dst, label))
    return write_metadata(rows, out_root)


def write_metadata(rows, out_root: str) -> str:
    meta = os.path.join(out_root, "metadata.csv")
    with open(meta, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "label"])
        for path, label in rows:
            w.writerow([path, label])
    n_fluent = sum(1 for _, l in rows if l == 0)
    n_stut = sum(1 for _, l in rows if l == 1)
    print(f"Wrote {meta}: {len(rows)} clips ({n_fluent} fluent, {n_stut} stutter)")

    # Keep every split class-balanced so the trainer can consume this output
    # directly without requiring the corpus provider to define splits.
    rng = random.Random(42)
    by_label = {0: [], 1: []}
    for row in rows:
        by_label[row[1]].append(row)
    split_rows = {"train": [], "val": [], "test": []}
    for label_rows in by_label.values():
        rng.shuffle(label_rows)
        n = len(label_rows)
        boundaries = (int(n * 0.8), int(n * 0.9))
        split_rows["train"].extend(label_rows[:boundaries[0]])
        split_rows["val"].extend(label_rows[boundaries[0]:boundaries[1]])
        split_rows["test"].extend(label_rows[boundaries[1]:])
    for split, split_values in split_rows.items():
        split_meta = os.path.join(out_root, split, "metadata.csv")
        os.makedirs(os.path.dirname(split_meta), exist_ok=True)
        with open(split_meta, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["file", "label"])
            w.writerows(split_values)
        print(f"  {split}: {len(split_values)} clips")
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in_root", help="corpus root with fluent/ and stutter/ subfolders")
    ap.add_argument("--labels_csv", help="instead, a CSV with path,label[,split]")
    ap.add_argument("--out_root", required=True)
    args = ap.parse_args()
    if args.labels_csv:
        out = from_labels_csv(args.labels_csv, args.out_root)
    elif args.in_root:
        out = from_split_folders(args.in_root, args.out_root)
    else:
        ap.error("provide --in_root or --labels_csv")
    print("Done ->", out)


if __name__ == "__main__":
    main()
