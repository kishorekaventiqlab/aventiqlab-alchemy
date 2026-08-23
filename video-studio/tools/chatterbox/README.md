# Chatterbox V3 setup

Local, offline TTS via [Resemble AI's Chatterbox](https://github.com/resemble-ai/chatterbox) (`chatterbox-tts` on PyPI) — the sole TTS backend for `video-studio`'s narration pipeline. See `docs/experiments/chatterbox-v3-tts.md` for the comparison against Piper that led to standardizing on it (Piper has been fully removed).

No paid API, no per-minute billing — weights are pulled once from the Hugging Face Hub on first run and cached locally (`~/.cache/huggingface` on macOS/Linux, `%USERPROFILE%\.cache\huggingface` on Windows).

## One-time setup

**1. Create a Python 3.10+ virtual environment** (Chatterbox requires >=3.10; this repo's scripts assume the venv lives at `tools/chatterbox/.venv`, but the path is fully configurable via `CHATTERBOX_PYTHON` — see below):

macOS/Linux:
```bash
cd video-studio/tools/chatterbox
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

Windows (PowerShell):
```powershell
cd video-studio/tools/chatterbox
py -3.10 -m venv .venv
.venv\Scripts\pip install --upgrade pip
.venv\Scripts\pip install -r requirements.txt
```

**2. GPU (optional but recommended on the Windows desktop this is meant to run on).** The `requirements.txt` install above pulls whatever `torch` build pip resolves by default, which is normally CPU-only on Windows. For CUDA acceleration, install a CUDA-enabled torch build *before* installing chatterbox-tts, matching your installed CUDA version (check with `nvidia-smi`) — e.g. for CUDA 12.1:
```powershell
.venv\Scripts\pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
.venv\Scripts\pip install -r requirements.txt
```
See https://pytorch.org/get-started/locally/ for the correct index URL for your CUDA version. `synthesize.py --device auto` detects CUDA automatically at runtime and falls back to CPU if it isn't available — no code change needed either way.

**3. Point the video-studio config at this environment.** Copy `video-studio/.env.example` to `video-studio/.env` and set:
```
CHATTERBOX_PYTHON=tools/chatterbox/.venv/bin/python      # or tools\chatterbox\.venv\Scripts\python.exe on Windows
```
(Paths are read relative to `video-studio/` if not absolute.)

## Reference voice (optional)

Chatterbox can clone a voice from a short reference clip (Resemble calls this "voice conditioning"/`audio_prompt_path`) instead of using its built-in default voice. To use one for AVENTIQLAB's narrator:

1. Place a clean, mono, 10-30 second WAV of the desired voice at `video-studio/voices/aventiqlab-narrator/reference.wav` (create the folder — it's gitignored, nothing here is committed).
2. Set `CHATTERBOX_VOICE_REF=voices/aventiqlab-narrator/reference.wav` in `video-studio/.env`.

If no reference voice is configured, `synthesize.py` omits `--voice-ref` and Chatterbox uses its own built-in default voice — this is what the pronunciation test and first full-video experiment used, since no AVENTIQLAB reference recording exists yet. Do not commit a personal or private voice recording — `voices/` is gitignored for exactly this reason.

## Known environment issue: `pkg_resources` / setuptools

`chatterbox-tts` depends on `resemble-perth` (audio watermarking) which still imports the deprecated `pkg_resources` module. Recent `setuptools` versions (81+) no longer bundle it, which makes `ChatterboxTTS.from_pretrained()` fail with `TypeError: 'NoneType' object is not callable` the first time it constructs the watermarker — `resemble-perth` swallows the real `ModuleNotFoundError: No module named 'pkg_resources'` internally and silently falls back to `None`. `requirements.txt` pins `setuptools<81` to avoid this; if you install packages in a different order and hit this error, run `pip install "setuptools<81"` in the venv.

## Sanity check

```bash
video-studio/tools/chatterbox/.venv/bin/python video-studio/tools/chatterbox/synthesize.py \
  --text "Testing the Chatterbox integration." \
  --output /tmp/chatterbox-test.wav \
  --device auto
```

First run downloads the model (a few GB) and will be slow; subsequent runs reuse the Hugging Face cache. On success this prints one JSON line to stdout: `{"generationSeconds": ..., "device": "..."}`.
