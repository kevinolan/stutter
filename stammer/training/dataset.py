"""
Datasets for stutter detection.

Features are extracted with **librosa** (log-Mel spectrogram + deltas) and the
model is built/trained with **torchaudio**. Two dataset variants are provided:
  - StutterDataset     : returns mel-spectrogram tensors for the CNN baseline
  - RawStutterDataset  : returns raw waveforms for the Wav2Vec2 fine-tune path
"""
import csv
import os

import librosa
import numpy as np
import torch
from torch.utils.data import Dataset

N_MELS = 64
TARGET_FRAMES = 128
SAMPLE_RATE = 16000
RAW_LENGTH = int(SAMPLE_RATE * 1.6)  # fixed-length waveform for Wav2Vec2


def _load_metadata(meta_csv: str):
    rows = []
    with open(meta_csv, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append((row["file"], int(row["label"])))
    return rows


class StutterDataset(Dataset):
    """Returns (3, N_MELS, TARGET_FRAMES) log-Mel tensors with delta/delta2."""

    def __init__(self, meta_csv: str, augment: bool = False):
        self.rows = _load_metadata(meta_csv)
        self.augment = augment

    def __len__(self):
        return len(self.rows)

    def _features(self, path: str) -> np.ndarray:
        y, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
        if y.size == 0:
            y = np.zeros(SAMPLE_RATE, dtype=np.float32)
        if self.augment and np.random.rand() < 0.5:
            y = y * np.random.uniform(0.8, 1.2)
        S = librosa.feature.melspectrogram(
            y=y, sr=sr, n_mels=N_MELS, n_fft=400, hop_length=160
        )
        logS = librosa.power_to_db(S, ref=np.max)
        delta = librosa.feature.delta(logS)
        delta2 = librosa.feature.delta(logS, order=2)
        feat = np.stack([logS, delta, delta2], axis=0).astype(np.float32)
        T = feat.shape[2]
        if T < TARGET_FRAMES:
            feat = np.pad(feat, ((0, 0), (0, 0), (0, TARGET_FRAMES - T)))
        else:
            feat = feat[:, :, :TARGET_FRAMES]
        return feat

    def __getitem__(self, idx):
        path, label = self.rows[idx]
        return torch.from_numpy(self._features(path)), torch.tensor(label, dtype=torch.float32)


class RawStutterDataset(Dataset):
    """Returns (1, RAW_LENGTH) raw waveforms for the Wav2Vec2 fine-tune path."""

    def __init__(self, meta_csv: str):
        self.rows = _load_metadata(meta_csv)

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, idx):
        path, label = self.rows[idx]
        y, sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
        if y.size == 0:
            y = np.zeros(SAMPLE_RATE, dtype=np.float32)
        if len(y) < RAW_LENGTH:
            y = np.pad(y, (0, RAW_LENGTH - len(y)))
        else:
            y = y[:RAW_LENGTH]
        wav = torch.from_numpy(y.astype(np.float32)).unsqueeze(0)
        return wav, torch.tensor(label, dtype=torch.float32)


def get_loaders(data_dir: str, batch_size: int = 16):
    train = StutterDataset(os.path.join(data_dir, "train", "metadata.csv"), augment=True)
    val = StutterDataset(os.path.join(data_dir, "val", "metadata.csv"))
    test = StutterDataset(os.path.join(data_dir, "test", "metadata.csv"))
    return (
        torch.utils.data.DataLoader(train, batch_size=batch_size, shuffle=True),
        torch.utils.data.DataLoader(val, batch_size=batch_size),
        torch.utils.data.DataLoader(test, batch_size=batch_size),
    )


def get_raw_loaders(data_dir: str, batch_size: int = 8):
    train = RawStutterDataset(os.path.join(data_dir, "train", "metadata.csv"))
    val = RawStutterDataset(os.path.join(data_dir, "val", "metadata.csv"))
    return (
        torch.utils.data.DataLoader(train, batch_size=batch_size, shuffle=True),
        torch.utils.data.DataLoader(val, batch_size=batch_size),
    )
