#!/usr/bin/env python3
"""
Single-shot Chatterbox TTS synthesis CLI, invoked as a subprocess by
ChatterboxProvider.ts — mirrors how the existing pipeline shells out to the
`piper` binary, so the Node side never imports torch directly.

Usage:
    python synthesize.py --text "..." --output out.wav [--voice-ref ref.wav]
                          [--device auto|cuda|mps|cpu] [--voice-name NAME]

On success, prints exactly one JSON line to stdout:
    {"generationSeconds": <float>, "device": "<resolved device>"}

Model weights are downloaded once (via huggingface_hub) and cached in the
standard HF cache directory (~/.cache/huggingface on Linux/macOS,
%USERPROFILE%\\.cache\\huggingface on Windows) — no repo-local model files,
no paid API calls.

This process reloads the model on every invocation, same cost profile as
the per-beat subprocess pattern this repo already uses for Piper. Model
load dominates single-beat wall time (Piper's equivalent load is
near-instant; Chatterbox's is not) — see docs/experiments/chatterbox-v3-tts.md
for measured numbers. A batch mode (one process, many beats) would remove
this cost but is not needed for this experiment and would change the
calling convention ChatterboxProvider.ts uses to mirror PiperProvider.
"""
import argparse
import json
import sys
import time
from pathlib import Path


def resolve_device(requested: str) -> str:
    import torch

    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return "mps"
    return "cpu"


def main() -> int:
    parser = argparse.ArgumentParser(description="Synthesize one WAV file with Chatterbox TTS.")
    parser.add_argument("--text", required=True, help="Text to synthesize.")
    parser.add_argument("--output", required=True, help="Output WAV path.")
    parser.add_argument(
        "--voice-ref",
        default=None,
        help="Reference voice WAV for voice conditioning (Chatterbox's audio_prompt_path). "
        "If omitted, uses the library's built-in default voice.",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cuda", "mps", "cpu"],
        help="Inference device. 'auto' picks CUDA if available, else MPS (macOS), else CPU.",
    )
    parser.add_argument("--voice-name", default=None, help="Informational only — logged, not used for selection.")
    parser.add_argument("--exaggeration", type=float, default=0.5, help="Chatterbox emotion/exaggeration control (0-1, default 0.5).")
    parser.add_argument("--cfg-weight", type=float, default=0.5, help="Chatterbox classifier-free-guidance weight (default 0.5).")
    args = parser.parse_args()

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if args.voice_ref and not Path(args.voice_ref).exists():
        print(f"Reference voice file not found: {args.voice_ref}", file=sys.stderr)
        return 1

    try:
        import torch
        import soundfile as sf
        from chatterbox.tts import ChatterboxTTS
    except ImportError as exc:
        print(
            "chatterbox-tts is not installed in this Python environment.\n"
            "Set up: python -m venv tools/chatterbox/.venv && "
            "tools/chatterbox/.venv/bin/pip install -r tools/chatterbox/requirements.txt\n"
            f"Import error: {exc}",
            file=sys.stderr,
        )
        return 1

    device = resolve_device(args.device)
    print(f"[chatterbox] device={device} voice_ref={args.voice_ref or '(built-in default)'}", file=sys.stderr)

    load_start = time.time()
    model = ChatterboxTTS.from_pretrained(device=device)
    load_seconds = time.time() - load_start
    print(f"[chatterbox] model load took {load_seconds:.2f}s", file=sys.stderr)

    gen_start = time.time()
    with torch.inference_mode():
        wav = model.generate(
            args.text,
            audio_prompt_path=args.voice_ref,
            exaggeration=args.exaggeration,
            cfg_weight=args.cfg_weight,
        )
    generation_seconds = time.time() - gen_start

    # torchaudio.save() now requires the optional `torchcodec` package on
    # recent torchaudio versions (2.9+) - avoiding that extra native
    # dependency (which can be finicky to install on Windows) by writing the
    # WAV directly with soundfile instead, matching how the rest of this
    # pipeline (Piper) also just produces a plain WAV file.
    wav_numpy = wav.squeeze(0).cpu().numpy() if wav.dim() > 1 else wav.cpu().numpy()
    sf.write(str(output_path), wav_numpy, model.sr, subtype="PCM_16")

    print(json.dumps({"generationSeconds": round(generation_seconds, 3), "device": device}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
