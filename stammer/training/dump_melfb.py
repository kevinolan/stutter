"""Dump the exact librosa mel filterbank for embedding in the JS extractor."""
import json
import os
import numpy as np
import librosa

SR = 16000
N_MELS = 64
N_FFT = 400
HERE = os.path.dirname(os.path.abspath(__file__))
fb = librosa.filters.mel(sr=SR, n_fft=N_FFT, n_mels=N_MELS, htk=False, norm="slaney")
out = {
    "n_mels": N_MELS,
    "n_fft": N_FFT,
    "sr": SR,
    "matrix": fb.astype(np.float32).tolist(),  # (64, 201)
}
with open(os.path.join(HERE, "onnx", "mel_filterbank.json"), "w") as f:
    json.dump(out, f)
print("Wrote mel_filterbank.json", fb.shape, "row sums:", np.round(fb.sum(axis=1)[:3], 4))
