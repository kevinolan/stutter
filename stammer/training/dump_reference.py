"""Dump librosa reference features for one clip, for JS parity validation."""
import json
import os
import numpy as np
import librosa

SR = 16000
HERE = os.path.dirname(os.path.abspath(__file__))
clip = os.path.join(HERE, "data", "test", "stutter", "stutter_000.wav")
y, sr = librosa.load(clip, sr=SR, mono=True)
wav = y.astype(np.float32)
S = librosa.feature.melspectrogram(y=y, sr=SR, n_mels=64, n_fft=400, hop_length=160)
logS = librosa.power_to_db(S, ref=np.max)
delta = librosa.feature.delta(logS)
delta2 = librosa.feature.delta(logS, order=2)
T = logS.shape[1]
TARGET = 128
if T < TARGET:
    pad = ((0, 0), (0, TARGET - T))
    logS = np.pad(logS, pad)
    delta = np.pad(delta, pad)
    delta2 = np.pad(delta2, pad)
else:
    logS = logS[:, :TARGET]
    delta = delta[:, :TARGET]
    delta2 = delta2[:, :TARGET]

feat = np.stack([logS, delta, delta2], axis=0).astype(np.float32)  # (3,64,128)
ref = {
    "pcm": wav.tolist(),
    "features": feat.reshape(-1).tolist(),  # (3*64*128)
}
with open(os.path.join(HERE, "onnx", "reference_features.json"), "w") as f:
    json.dump(ref, f)
print("Wrote reference_features.json:", feat.shape, "pcm len", len(wav))
