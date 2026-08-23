#!/usr/bin/env python3
"""
Generates a simple, license-free ambient instrumental loop for use as
background music under narration - no samples, no copyrighted material,
just synthesized sine/triangle tones in a slow chord progression. Not part
of the TTS pipeline; reuses the Chatterbox venv purely because numpy/
soundfile already live there (see tools/chatterbox/README.md for setup).

Usage:
    tools/chatterbox/.venv/bin/python tools/music/generate-bed.py \
        --output public/audio/music/ambient-bed.wav --duration 32 --seed 7

Produces a seamlessly loopable WAV (fades are avoided at the loop point by
using an integer number of full chord-progression cycles and matching phase
at start/end) at a quiet, background-appropriate level (peak well below
narration level - designed to be ducked further at render time, not to be
the loudest thing in the mix).
"""
import argparse
import numpy as np
import soundfile as sf

SAMPLE_RATE = 44100

# A slow, calm four-chord loop (Am - F - C - G, in Hz for each voice) -
# deliberately simple and consonant so it stays unobtrusive under speech.
# Each chord is a list of (frequency, relative_amplitude) pairs.
CHORDS = [
    [(220.00, 1.0), (261.63, 0.7), (329.63, 0.5)],  # A3, C4, E4 (Am)
    [(174.61, 1.0), (220.00, 0.7), (261.63, 0.5)],  # F3, A3, C4 (F)
    [(130.81, 1.0), (164.81, 0.7), (196.00, 0.5)],  # C3, E3, G3 (C)
    [(196.00, 1.0), (246.94, 0.7), (293.66, 0.5)],  # G3, B3, D4 (G)
]


def adsr_envelope(n_samples: int, attack: float, release: float, sr: int) -> np.ndarray:
    env = np.ones(n_samples)
    a = int(attack * sr)
    r = int(release * sr)
    if a > 0:
        env[:a] = np.linspace(0, 1, a)
    if r > 0:
        env[-r:] = np.linspace(1, 0, r)
    return env


def render_chord(freqs_amps, chord_seconds: float, sr: int) -> np.ndarray:
    n = int(chord_seconds * sr)
    t = np.arange(n) / sr
    voice = np.zeros(n)
    for freq, amp in freqs_amps:
        # A soft triangle-ish tone (sine + a touch of its own third harmonic
        # at low amplitude) reads as warmer/less "beepy" than a pure sine.
        voice += amp * (np.sin(2 * np.pi * freq * t) + 0.15 * np.sin(2 * np.pi * freq * 3 * t))
    voice *= adsr_envelope(n, attack=1.2, release=1.2, sr=sr)
    return voice


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a simple ambient background-music loop.")
    parser.add_argument("--output", required=True, help="Output WAV path.")
    parser.add_argument("--duration", type=float, default=32.0, help="Loop duration in seconds (one full 4-chord cycle by default at 8s/chord).")
    parser.add_argument("--chord-seconds", type=float, default=8.0, help="Seconds per chord (default 8s -> 32s for a 4-chord loop).")
    parser.add_argument("--seed", type=int, default=7, help="Unused (deterministic synthesis) - kept for interface stability.")
    args = parser.parse_args()

    chords_needed = max(1, round(args.duration / args.chord_seconds))
    voices = [render_chord(CHORDS[i % len(CHORDS)], args.chord_seconds, SAMPLE_RATE) for i in range(chords_needed)]
    mono = np.concatenate(voices)

    # A very light stereo width (tiny delay + detune on one channel) so it
    # doesn't sit dead-center/mono under the (also roughly centered) narration.
    delay_samples = int(0.006 * SAMPLE_RATE)
    right = np.concatenate([np.zeros(delay_samples), mono[:-delay_samples] if delay_samples else mono])
    stereo = np.stack([mono, right], axis=1)

    # Normalize to a quiet background level - peak around -18dBFS so it
    # reads as "bed", not as competing with narration even before ducking.
    peak = np.max(np.abs(stereo))
    if peak > 0:
        target_peak = 10 ** (-18 / 20)
        stereo = stereo * (target_peak / peak)

    sf.write(args.output, stereo.astype(np.float32), SAMPLE_RATE, subtype="PCM_16")
    print(f"Wrote {args.output}: {len(mono) / SAMPLE_RATE:.1f}s loop, {chords_needed} chords at {args.chord_seconds}s each")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
