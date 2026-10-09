"""
UCLASS stuttering corpus download + prep scaffold.

UCLASS (University College London Archive of Stuttered Speech) is NOT openly
downloadable via a public API — access requires a data-request form at
https://uclass.psychol.ucl.ac.uk/ . This script is a scaffold you run AFTER you
have downloaded and extracted the corpus locally.

Flow:
  1. Submit the UCLASS data request; once approved, download + unzip to e.g. ~/UCLASS.
  2. Map each clip to fluent(0)/stutter(1). UCLASS ships with XML per-speech-sample
     annotations; you can either:
       - use its `speaker/session` structure and label whole clips by diagnosis, or
       - parse the XML to label only stuttered vs fluent segments (recommended).
  3. Run this script to resample + emit metadata.csv, then train:
         python training/prepare_real_corpus.py --in_root ~/UCLASS/prepared --out_root training/data/real
         python training/train.py --data_root training/data/real --model cnn --epochs 40 --batch-size 32

This file intentionally does NOT auto-download (license/ToS). Fill in `UCLASS_ROOT`
and the label-mapping logic for your approved copy.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prepare_real_corpus import from_split_folders  # reuse the resampler


def main() -> None:
    UCLASS_ROOT = os.environ.get("UCLASS_ROOT", "")
    if not UCLASS_ROOT or not os.path.isdir(UCLASS_ROOT):
        print("Set UCLASS_ROOT to the extracted corpus root (with fluent/ and stutter/ folders).")
        print("See the module docstring for the data-request + labelling steps.")
        return
    out = from_split_folders(UCLASS_ROOT, os.path.join(os.path.dirname(__file__), "data", "real"))
    print("Prepared real corpus at", out)


if __name__ == "__main__":
    main()
