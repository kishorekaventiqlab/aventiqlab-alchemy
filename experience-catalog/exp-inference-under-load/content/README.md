# Real Content — Operate an AI Inference Platform Under Load

Finished, real content for six artifact types, matching the specs in [`../artifacts/`](../artifacts/). This is the first fully-produced experience in the catalog — the template for producing the others.

**Note on the rework:** the video has gone through three restructurings. First, from a cold-open "expert diagnosis" into a 6-act teach-first sequence. Second, into the full ten-stage reasoning spine from `docs/video-artifact-constitution.md` (Problem → Stakes → Curiosity → Context/Mental Model → Options → Trade-offs → Investigation/Demonstration → Decision → Best Practice → Takeaway), all ten stages treated as REQUIRED per the reference-build decision recorded in [`video-narrative-plan.md`](video-narrative-plan.md). Third — this pass — the Investigation/Demonstration stage's six discrete beats were collapsed into one continuous, camera-choreographed scene (`InvestigationScene.tsx`) with live-tweening numbers, an animated SQS queue, and pods that spawn/despawn instead of swapping between static snapshots; see [`video-narrative-plan.md`](video-narrative-plan.md)'s "Post-launch fix" section. See that plan for the stage-by-stage rationale, and `experience.yaml`'s `learner_problem`/`core_concept`/`mental_model`/`learning_sequence` fields for the underlying pedagogical content.

| Artifact | Real content | Status |
|---|---|---|
| Material | [`material.md`](material.md) | ✅ Finished text (~2,600 words) |
| Video | [`video-narrative-plan.md`](video-narrative-plan.md) (informal narrative spec, written before any beat was animated, per the constitution's spec-first workflow) + [`video-script.md`](video-script.md) (10-stage narration/shot list) + [`/video-studio`](../../../video-studio/) (Remotion composition `inference-under-load-video`, renders to Full HD `.mp4` with a real local-TTS voiceover and clean, unlabeled subtitles) | ✅ Finished plan + script + voiceover; rendered video (5:29, 1920×1080, H.264) in `video-studio/out/` |
| Source Code / Lab | [`lab/`](lab/) — real KEDA ScaledObject, real Gateway rate-limit policy, real Terraform overflow-node-pool module, each with a starter + solution + hints | ✅ Finished, both starter and solution files |
| Battleground | [`art-inference-under-load-battleground.yaml`](../artifacts/art-inference-under-load-battleground.yaml) | ✅ Spec complete — an interactive, timed operation of the experience's own incident; no executable environment implemented yet (the spec defines `success_conditions` and `environment_requirements` for a future sandboxed cluster) |
| Quiz | [`quiz.yaml`](quiz.yaml) — 10 real multiple-choice/scenario-judgment questions with answers and explanations | ✅ Finished |
| Skill Evaluator | [`/skill-evaluator/instances/se-inference-under-load.yaml`](../../../skill-evaluator/instances/se-inference-under-load.yaml) | ✅ Already complete — this *is* the finished artifact; per repo-wide constraints there's no further "real content" to add beyond the spec until ASTRA exists to actually hold the conversation it describes |

## Rendering the video yourself

```bash
cd video-studio
npm install
npm run generate:audio -- inferenceUnderLoadScript   # generates the voiceover .wav files (Chatterbox V3, local/offline)
npx remotion render src/index.ts inference-under-load-video out/inference-under-load-video.mp4
```

The voiceover is generated locally with [Chatterbox V3](https://github.com/resemble-ai/chatterbox) (Resemble AI's open-source TTS package) — a fully offline neural TTS engine, no cloud service, no API key, no per-minute billing. This experience originally used Windows' built-in SAPI text-to-speech via a PowerShell script (Windows-only), then Piper (see [`docs/experiments/chatterbox-v3-tts.md`](../../../docs/experiments/chatterbox-v3-tts.md) for the comparison that led to standardizing on Chatterbox V3 as the sole engine). See the "Production notes" section of [`video-script.md`](video-script.md) for how beat durations are derived from the actual generated audio length, and `video-studio/tools/chatterbox/README.md` for the one-time environment setup.

### Background music

The rendered video includes a looping ambient instrumental bed (`public/audio/music/ambient-bed.wav`), automatically ducked in volume under narration and raised during silent stretches (e.g. the title card) — see [`BackgroundMusic.tsx`](../../../video-studio/src/components/BackgroundMusic.tsx). The bed is synthesized, not a licensed sample (no copyrighted material, no attribution required); regenerate it with:

```bash
video-studio/tools/chatterbox/.venv/bin/python video-studio/tools/music/generate-bed.py \
  --output video-studio/public/audio/music/ambient-bed.wav --duration 32 --chord-seconds 8
```

(Reuses the Chatterbox venv purely because numpy/soundfile already live there — see `video-studio/tools/chatterbox/README.md` for that one-time setup. Music is unrelated to which TTS engine is selected.) Pass `musicEnabled={false}` as a composition prop (`--props='{"musicEnabled":false}'`) to render without it.

