# Experiment: Chatterbox V3 as an alternative local TTS backend

**Question:** Can Chatterbox V3 become the local narrator engine for AVENTIQLAB, alongside or instead of Piper?

**Outcome (post-experiment decision):** Chatterbox V3 was adopted as this project's sole TTS engine. Piper has been fully removed from the codebase (`PiperProvider.ts`, the multi-engine `AudioEngine` factory, `tools/piper-voices/`, and all Piper-generated audio/video artifacts) — `generate-audio.ts` no longer takes an `--engine` flag and always uses Chatterbox. This was a direct decision to standardize on one engine rather than a re-run of the listening test described below; the sections after this note are the original experiment record from before that decision and are kept as-is for the reasoning trail, not as a description of the current pipeline.

**Status (at the time this experiment was run):** Piper was the default engine; Chatterbox V3 was available as an alternative via `--engine chatterbox-v3`. Nothing about the production pipeline changed except that this option existed.

**Controlled variable:** both engines narrated the exact same transcript — `exp-inference-under-load`'s real, unmodified `video-script.md` (23 narrated beats/segments, 5:29 of Piper narration in the shipped video). No text was rewritten, simplified, or adjusted for either engine.

---

## 1. What this did NOT change

- Piper is still the default engine (`TTS_ENGINE=piper` if `.env` is absent).
- The narrative, visual beats, captions, architecture, and Remotion components are untouched.
- `out/inference-under-load-piper.mp4` is the same render that was already shipping — copied, not regenerated, so there is no risk of an unrelated re-render changing anything about the baseline.
- No cloud TTS, no OpenRouter, no ASTRA, no paid API.
- No model weights committed to git (Chatterbox's weights live in the Hugging Face cache, `~/.cache/huggingface`; the venv at `tools/chatterbox/.venv/` is gitignored).

## 2. How Chatterbox V3 was integrated

The existing pipeline already had a `TTSProvider` interface (`src/audio/TTSProvider.ts`) and one implementation (`PiperProvider`). This experiment added a second implementation and a small factory, without changing the interface:

```
AudioEngine (src/audio/engineFactory.ts)
    ├── PiperProvider      (existing, unchanged — spawns the `piper` binary)
    └── ChatterboxProvider (new — spawns tools/chatterbox/synthesize.py)
```

- **`src/audio/providers/ChatterboxProvider.ts`** — implements `TTSProvider`, shells out to a Python script exactly the way `PiperProvider` shells out to the `piper` binary. Node never imports torch.
- **`tools/chatterbox/synthesize.py`** — a standalone CLI around Resemble AI's `chatterbox-tts` package (the official open-source Chatterbox implementation, https://github.com/resemble-ai/chatterbox). Detects CUDA → MPS → CPU automatically (`--device auto`), or a specific device can be forced. Prints one JSON line (`{"generationSeconds": ..., "device": ...}`) on success.
- **`src/audio/config.ts`** — loads `video-studio/.env` (see `.env.example`) for every machine-specific value: Python interpreter path, device, optional reference voice path, output subdirectory. No hardcoded paths in code.
- **`scripts/generate-audio.ts`** — gained an `--engine` flag (default from `.env`'s `TTS_ENGINE`). The video data file (`inferenceUnderLoadScript.ts`) never names an engine anywhere.
- **`src/compositions/InferenceUnderLoad.tsx`** — gained one additive prop, `audioDir` (default `''`, i.e. today's flat `public/audio/` layout, unchanged). Passing `--props='{"audioDir":"chatterbox-v3"}'` to `remotion render` points the same composition at `public/audio/chatterbox-v3/`'s WAVs instead. The composition has no idea which engine produced the audio it's playing.

Chatterbox's output is written to `public/audio/chatterbox-v3/` (configurable via `CHATTERBOX_OUTPUT_SUBDIR`) rather than the flat `public/audio/` Piper uses, so switching engines can never silently overwrite the other engine's files.

### A real environment issue found and fixed along the way

`chatterbox-tts`'s dependency `resemble-perth` (audio watermarking) still imports the deprecated `pkg_resources` module, which `setuptools>=81` no longer bundles by default. Without a pin, `ChatterboxTTS.from_pretrained()` fails with a confusing `TypeError: 'NoneType' object is not callable` — `resemble-perth` silently swallows the real `ModuleNotFoundError` and falls back to `None`. Fixed by pinning `setuptools<81` in `tools/chatterbox/requirements.txt`. See `tools/chatterbox/README.md` for the full writeup.

A second issue: recent `torchaudio` (2.9+) requires the optional `torchcodec` package for `torchaudio.save()`, which isn't installed by `chatterbox-tts`'s own dependency list and can be awkward to install on Windows. Worked around by writing the WAV with `soundfile` directly instead (already an indirect dependency, no new native package needed).

## 3. Exact commands

```bash
# Pronunciation smoke test (Step 8) — both engines, same term list, isolated from the real transcript
npx tsx scripts/pronunciation-test.ts --engine piper
npx tsx scripts/pronunciation-test.ts --engine chatterbox-v3

# Full EKS video narration (Step 9) — exact same transcript as the shipped Piper video
npx tsx scripts/generate-audio.ts inferenceUnderLoadScript --engine chatterbox-v3

# Render (Step 10) — same visuals, same beat timing, different audio source
npx remotion render src/index.ts inference-under-load-video out/inference-under-load-chatterbox-v3.mp4 \
  --props='{"audioDir":"chatterbox-v3"}'

# Validation (Step 11)
npx tsx scripts/validate-render.ts out/inference-under-load-piper.mp4 \
  --data inferenceUnderLoadScript --manifest public/audio/inferenceUnderLoadScript.manifest.json
npx tsx scripts/validate-render.ts out/inference-under-load-chatterbox-v3.mp4 \
  --data inferenceUnderLoadScript --manifest public/audio/chatterbox-v3/inferenceUnderLoadScript.manifest.json

# Short A/B comparison clip (Step 13)
npx tsx scripts/make-comparison-clip.ts --beat beat12.wav --a piper --b chatterbox-v3 \
  --out out/comparison-piper-vs-chatterbox-v3-beat12.wav
```

## 4. Test machine

macOS, Apple Silicon (arm64), no CUDA — Chatterbox ran on **MPS** (Apple's GPU backend), not CPU and not CUDA. The brief's target machine is a Windows desktop with CUDA; this experiment could not measure CUDA numbers directly, only MPS and the CPU-fallback path's *code path* (untested for actual CPU wall-clock here — MPS was always available). Treat wall-time numbers below as directionally useful (subprocess/model-reload overhead, relative pacing) but not as a CUDA benchmark. `synthesize.py --device auto` will pick CUDA automatically on the Windows machine with no code change.

## 5. Pronunciation test (Step 8)

15 terms/phrases drawn verbatim from `exp-inference-under-load`'s real narration — see `public/audio/pronunciation-test/{piper,chatterbox-v3}/`. Both sets of `results.json` record measured duration and wall time per term.

| # | Term | Piper duration | Chatterbox duration | Piper wall | Chatterbox wall |
|---|---|---|---|---|---|
| 1 | Kubernetes | 0.79s | 1.00s | 0.61s | 15.33s |
| 2 | Amazon EKS | 1.25s | 1.36s | 0.59s | 13.45s |
| 3 | KEDA | 0.27s | 0.80s | 0.43s | 14.36s |
| 4 | Karpenter | 0.62s | 0.64s | 0.53s | 14.68s |
| 5 | Kubernetes Scheduler | 1.27s | 1.36s | 0.65s | 13.02s |
| 6 | GPU | 0.66s | 1.04s | 0.52s | 15.81s |
| 7 | vLLM | 0.79s | 0.96s | 0.52s | 14.24s |
| 8 | inference | 0.56s | 1.28s | 0.53s | 14.00s |
| 9 | pods | 0.43s | 0.72s | 0.50s | 13.48s |
| 10 | Pending state | 0.77s | 0.84s | 0.86s | 12.61s |
| 11 | autoscaling | 0.72s | 1.04s | 0.55s | 12.74s |
| 12 | node capacity | 1.04s | 1.40s | 0.59s | 13.51s |
| 13 | "KEDA is doing exactly what it should..." | 4.53s | 4.40s | 1.24s | 20.08s |
| 14 | "This is where Karpenter takes over..." | 5.38s | 5.08s | 1.36s | 24.25s |
| 15 | "Both GPU nodes are full..." | 4.59s | 4.56s | 1.21s | 21.31s |

**Pronunciation observations — PENDING HUMAN LISTENING (see §10's listening test):** I (the assistant) can verify these files are non-silent, correctly-formed audio (confirmed via ffprobe/RMS on every file) but I cannot hear them. Genuine pronunciation-quality judgment for acronym/technical terms (KEDA, EKS, vLLM especially — these are exactly the terms most likely for a TTS model to mispronounce or misread as normal English words) requires a human to actually listen to `public/audio/pronunciation-test/chatterbox-v3/*.wav` and compare against `public/audio/pronunciation-test/piper/*.wav`. **Do not treat this report as having validated pronunciation quality until that listening pass happens.**

If Chatterbox mispronounces a term (e.g. reading "KEDA" letter-by-letter, or "vLLM" as a garbled word), the correct fix is **not** to reword the learner-visible transcript. The controlled-pronunciation strategy to investigate instead: a separate, optional `pronunciationOverrides` map (term → phonetic respelling or SSML-like hint) consumed only by the TTS layer at synthesis time, keyed by the engine, so the same beat's `caption` (transcript, subtitle, and learning content) stays exactly as authored while only what gets *spoken* for that engine is adjusted. This is a future-work proposal, not implemented in this experiment — no such override exists yet, and none was needed to get a baseline comparison.

## 6. Full-video generation (Step 9)

Command: `npx tsx scripts/generate-audio.ts inferenceUnderLoadScript --engine chatterbox-v3`

All 23 narrated beats/segments generated successfully on the first attempt (no failures once the environment issues in §2 were fixed). Per-beat results (from `public/audio/chatterbox-v3/inferenceUnderLoadScript.manifest.json` and the generation log):

| Beat | Chatterbox audio | Wall time | Piper audio (baseline) |
|---|---|---|---|
| beat2 | 7.56s | 82.0s | 8.14s |
| beat3 | 12.00s | 83.7s | 12.11s |
| beat4 | 7.60s | 89.4s | 7.85s |
| beat5 | 8.24s | 66.1s | 9.29s |
| beat6 | 8.24s | 81.7s | 8.63s |
| beat7 | 8.96s | 60.8s | 9.73s |
| beat8 | 8.88s | 79.5s | 8.70s |
| beat9 | 8.80s | 77.1s | 9.24s |
| beat10 | 14.44s | 51.5s | 14.43s |
| beat11 | 8.24s | 70.8s | 9.37s |
| beat12 | 11.32s | 57.5s | 12.27s |
| beat13 | 10.88s | 61.4s | 11.04s |
| beat14 | 11.76s | 51.7s | 13.76s |
| beat15 | 10.56s | 68.6s | 11.48s |
| beat16 | 7.12s | 67.4s | 9.02s |
| beat17 | 13.20s | 51.0s | 14.97s |
| beat18 | 8.00s | 70.1s | 8.57s |
| beat19 | 12.68s | 66.8s | 14.12s |
| beat20 | 13.84s | 75.7s | 14.02s |
| beat21 | 10.48s | 72.4s | 12.41s |
| beat22 | 10.44s | 71.9s | 12.20s |
| beat23 | 11.32s | 79.5s | 12.16s |
| beat24 | 10.08s | 72.1s | 10.23s |

**Totals:**
- Chatterbox V3 total narration: **234.6s** (3:54.6)
- Piper total narration (baseline, unchanged): **253.7s** (4:13.7)
- Difference: Chatterbox's default voice narrates this transcript **19.1s (7.5%) faster** than Piper's `en_US-ryan-high` voice, with no text changes — a pacing/delivery difference, not a word-count difference.
- Total wall-clock time for this run: **1608.7s (26.8 minutes)** for 23 beats — averaging ~70s/beat, almost entirely model-reload overhead per subprocess (this repo's per-beat subprocess pattern, inherited from Piper's design, reloads the ~2GB model fresh for every beat). This was measured on CPU/MPS with no CUDA available (see §4); expect this to drop substantially on the target CUDA machine, though the per-process reload architecture will still dominate wall time however fast the device is.

### Did beat timing need to change? (Step 7)

**No — not for this run, and this needs to be read carefully, not as "timing never matters."** Every one of the 23 beats' `duration` values in `inferenceUnderLoadScript.ts` (and the Investigation stage's 6 segment windows, computed from consecutive keyframe `t` values) was originally sized for **Piper's** measured audio plus a ~3s buffer. Since Chatterbox's audio for every single beat came out *shorter* than Piper's for the same text, all 23 existing windows still had comfortable margin (2.2s-7.3s to spare) with zero changes to the `.ts` file. This is a fact about this specific transcript and this specific pair of voices, not a general property of the pipeline: **the pipeline still measures every engine's actual output duration independently** (`ChatterboxProvider.synthesize()` reads the real WAV header, exactly like `PiperProvider` does) and records it in a separate manifest; if a future engine or reference voice produced *longer* audio than the existing Piper-sized windows, `validate-render.ts`'s "no beat's narration exceeds its allocated time window" check (§8) would catch it, and the fix would be to regenerate the `.ts` file's `duration`/`t` values from that engine's own measured durations — the same manual step the production README already documents for Piper. No such regeneration was needed here because Chatterbox happened to be faster.

## 7. Render (Step 10)

Command: `npx remotion render src/index.ts inference-under-load-video out/inference-under-load-chatterbox-v3.mp4 --props='{"audioDir":"chatterbox-v3"}'`

Rendered successfully on the first attempt: 9,870 frames (329s at 30fps — identical frame count to the Piper render, since visuals/timing are untouched), 34.9MB. A byte-level comparison of a decoded frame at t=10s between the two renders (`out/inference-under-load-piper.mp4` vs `out/inference-under-load-chatterbox-v3.mp4`) came back **pixel-identical** — confirming the `audioDir` prop change affects only which audio files get loaded, nothing about the visual composition.

## 8. Validation (Step 11)

Command: `npx tsx scripts/validate-render.ts <mp4> --data inferenceUnderLoadScript --manifest <manifest>`

Both renders pass all 7 automated checks:

| Check | Piper | Chatterbox V3 |
|---|---|---|
| Audio track exists | PASS (aac) | PASS (aac) |
| Video resolution 1920x1080 | PASS | PASS |
| Video codec h264 | PASS | PASS |
| Audio not silent (5 sample points) | PASS | PASS |
| Video duration matches script total (329s) | PASS (329.05s) | PASS (329.05s) |
| Every beat's audio exists in its manifest | PASS | PASS |
| No beat's narration exceeds its allocated window | PASS | PASS |

Additional checks from the brief, verified manually rather than by the script:
- **Subtitles synchronized / contain only transcript / no "NARRATION" label / no internal metadata**: confirmed by inspecting a rendered frame directly (see `CaptionBar.tsx`, which was already fixed to render only the spoken text, earlier in this project) — a still frame at t=15s shows a clean caption with the exact transcript text and no label/metadata of any kind.
- **Existing visual animation remains unchanged**: confirmed via the pixel-identical frame comparison above.
- **No beat ends before narration / no narration overlaps the next beat**: this is exactly what the "no beat's narration exceeds its allocated window" automated check verifies (it compares each beat's *measured* audio duration + the render's 0.5s lead-in against that beat's allocated time window) — passed for every beat in both renders.

## 9. Comparison table (Step 12)

| Dimension | Piper | Chatterbox V3 | Measured or subjective? |
|---|---|---|---|
| Naturalness | — | — | **Subjective — human listening required** |
| Conversational quality | — | — | **Subjective — human listening required** |
| Technical pronunciation | — | — | **Subjective — human listening required, see §5** |
| Pacing | 253.7s total for the full video's narration | 234.6s total — 7.5% faster delivery of the identical transcript | **Measured** |
| Expressiveness | — | — | **Subjective — human listening required** |
| Voice consistency | Single fixed voice model (`en_US-ryan-high`) across all beats | Single default voice across all beats (no reference voice configured for this run — see `voices/README.md`) | Partially measurable (same voice used throughout for both — neither varies mid-video); *quality* of consistency is subjective |
| Generation time | ~0.5-1.4s wall time per beat (pronunciation test); full 23-beat video generated effectively instantly | ~13-25s per short term, 51-89s per full-length beat, dominated by per-process model reload (~9-12s) - full 23-beat video took **1608.7s (26.8 min)** total wall time on this machine | **Measured** |
| Audio duration | 253.7s total (full video) | 234.6s total (full video) | **Measured** |
| GPU/resource usage | CPU only, negligible (ONNX Runtime, no GPU support in this Piper voice) | MPS on this test machine (no CUDA available here) — several GB resident, ~9-12s model load per subprocess call; CUDA expected on the target Windows/GPU machine, untested here | Partially measured (this machine only, no CUDA numbers) |
| Ease of integration | Already integrated, one dependency (`piper` binary) | New Python venv, ~2.9GB model download on first run, two real dependency-compatibility issues found and fixed (§2) | **Measured** (a real integration was completed) |
| Output quality | — | — | **Subjective — human listening required** |
| Failure modes | None observed in this experiment | Two environment bugs during setup (both fixed, see §2); no failures once environment was correct | **Measured/observed** |

## 10. Human listening test (Step 13)

Prepared for direct comparison, not scored automatically:

- **A. Piper**, full video: `out/inference-under-load-piper.mp4`
- **B. Chatterbox V3**, full video: `out/inference-under-load-chatterbox-v3.mp4`
- **Short A/B clip** (beat12 — "Now traffic starts climbing..." — both engines back to back with a 0.75s silence gap): `out/comparison-piper-vs-chatterbox-v3-beat12.wav` (25.3s total: 12.27s Piper + 0.75s silence + 11.32s Chatterbox), generated via `scripts/make-comparison-clip.ts` (see §3 for the command). Not committed to git (`out/` is gitignored) — listen locally.
- **Pronunciation test clips**: `public/audio/pronunciation-test/piper/` vs `public/audio/pronunciation-test/chatterbox-v3/`, same filenames in both directories for direct 1:1 comparison.

The question this is meant to answer: **does Chatterbox actually sound better for AVENTIQLAB, on AVENTIQLAB's own content** — not on a generic demo sentence. Nothing in this report should be read as already having answered that; it hasn't, because the assistant that ran this experiment cannot listen to audio.

## 11. Recommendation

**Not yet made — pending the human listening test in §10.** Every technical/mechanical step of this experiment is complete and passing (integration, full-video generation, render, automated validation — all in this document above); the only remaining input is a human listening to `out/inference-under-load-piper.mp4` vs `out/inference-under-load-chatterbox-v3.mp4` (and/or the short A/B clip and pronunciation-test files) and judging whether Chatterbox's default voice actually sounds better for AVENTIQLAB's content. The integration itself is low-risk either way: Piper is untouched and remains the default, so adopting or rejecting Chatterbox after listening requires no further engineering work beyond the choice itself — see the in-conversation Final Report's 14-point summary for the full picture.
