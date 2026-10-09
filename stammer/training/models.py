"""
Models for stutter detection.

1) StutterCNN   — a small CNN over librosa log-Mel features. Baseline / fast path.
2) Wav2Vec2StutterClassifier — fine-tunes a torchaudio Wav2Vec2 checkpoint on raw
   waveforms for the higher-accuracy path.
"""
import torch
import torch.nn as nn


class StutterCNN(nn.Module):
    """Lightweight CNN over (3, N_MELS, T) log-Mel inputs."""

    def __init__(self, n_mels: int = 64, target_frames: int = 128, dropout: float = 0.3):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
<<<<<<< Updated upstream
            nn.AdaptiveAvgPool2d((4, 4)),
=======
            nn.AvgPool2d((4, 8)),  # 16x32 -> 4x4 (fixed, ONNX-exportable)
>>>>>>> Stashed changes
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Linear(128 * 4 * 4, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(dropout),
            nn.Linear(128, 1),
        )

    def forward(self, x):
        x = self.features(x)
        return self.classifier(x).squeeze(1)


class Wav2Vec2StutterClassifier(nn.Module):
    """Fine-tunes torchaudio's Wav2Vec2 on raw waveforms."""

    def __init__(self, pretrained: bool = True, freeze_feature_extractor: bool = True):
        super().__init__()
        try:
            from torchaudio.models import wav2vec2_base
            self.encoder = wav2vec2_base(weights="WAV2VEC2_BASE" if pretrained else None)
        except Exception:
            # Fallback for torchaudio versions lacking bundled weights.
            from torchaudio.pipelines import WAV2VEC2_BASE
            bundle = WAV2VEC2_BASE
            self.encoder = bundle.get_model()
            self._bundle = bundle
        hidden = 768
        self.head = nn.Sequential(nn.Dropout(0.1), nn.Linear(hidden, 1))
        if freeze_feature_extractor:
            for p in self.encoder.feature_extractor.parameters():
                p.requires_grad = False

    def forward(self, wav):
        # wav2vec2 expects (batch, time); datasets emit (batch, 1, time).
        if wav.dim() == 3:
            wav = wav.squeeze(1)
        # encoder returns (batch, time, hidden)
        features, _ = self.encoder(wav)
        pooled = features.mean(dim=1)
        return self.head(pooled).squeeze(1)


def build_model(name: str = "cnn") -> nn.Module:
    if name == "cnn":
        return StutterCNN()
    if name == "wav2vec2":
        return Wav2Vec2StutterClassifier()
    raise ValueError(f"unknown model {name}")
