# Real Content — Operate an AI Inference Platform Under Load

Finished, real content for all five artifact types, matching the specs in [`../artifacts/`](../artifacts/). This is the first fully-produced experience in the catalog — the template for producing the other 14.

| Artifact | Real content | Status |
|---|---|---|
| Material | [`material.md`](material.md) | ✅ Finished text (~2,600 words) |
| Video | [`video-script.md`](video-script.md) (narration/shot list) + [`/video-studio`](../../../video-studio/) (Remotion composition `inference-under-load-video`, renders to `.mp4` with a real local-TTS voiceover) | ✅ Finished script + voiceover; rendered video (4:07) in `video-studio/out/` |
| Source Code / Lab | [`lab/`](lab/) — real KEDA ScaledObject, real Gateway rate-limit policy, real Terraform overflow-node-pool module, each with a starter + solution + hints | ✅ Finished, both starter and solution files |
| Quiz | [`quiz.yaml`](quiz.yaml) — 10 real multiple-choice/scenario-judgment questions with answers and explanations | ✅ Finished |
| Skill Evaluator | [`/skill-evaluator/instances/se-inference-under-load.yaml`](../../../skill-evaluator/instances/se-inference-under-load.yaml) | ✅ Already complete — this *is* the finished artifact; per repo-wide constraints there's no further "real content" to add beyond the spec until ASTRA exists to actually hold the conversation it describes |

## Rendering the video yourself

```bash
cd video-studio
npm install
powershell -ExecutionPolicy Bypass -File scripts/generate-audio.ps1   # generates the voiceover .wav files (Windows only)
npx remotion render src/index.ts inference-under-load-video out/inference-under-load-video.mp4
```

The voiceover is generated locally with Windows' built-in SAPI text-to-speech — no cloud service, no API key. See the "Production notes" section of [`video-script.md`](video-script.md) for how beat durations are derived from the actual generated audio length.

