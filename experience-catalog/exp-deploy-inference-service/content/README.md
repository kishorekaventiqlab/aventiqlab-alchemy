# Real Content — Deploy an AI Inference Service

Finished, real content for all five artifact types, matching the specs in [`../artifacts/`](../artifacts/). This is the second fully-produced experience in the catalog, following the pattern established by `exp-inference-under-load`.

| Artifact | Real content | Status |
|---|---|---|
| Material | [`material.md`](material.md) | ✅ Finished text (~2,000 words) |
| Video | [`video-script.md`](video-script.md) (narration/shot list) + [`/video-studio`](../../../video-studio/) (Remotion composition `deploy-inference-service-video`, renders to Full HD `.mp4` with a real local-TTS voiceover) | ✅ Finished script + voiceover; rendered video (2:52, 1920×1080, H.264) in `video-studio/out/` |
| Source Code / Lab | [`lab/`](lab/) — a real Helm `values.yaml` with node selector, toleration, GPU resource limit, and readiness probe gaps, each with a starter + solution + hints | ✅ Finished, both starter and solution files |
| Quiz | [`quiz.yaml`](quiz.yaml) — 8 real multiple-choice/scenario-judgment questions with answers and explanations | ✅ Finished |
| Skill Evaluator | [`/skill-evaluator/instances/se-deploy-inference-service.yaml`](../../../skill-evaluator/instances/se-deploy-inference-service.yaml) | ✅ Already complete — this *is* the finished artifact; per repo-wide constraints there's no further "real content" to add beyond the spec until ASTRA exists to actually hold the conversation it describes |

## Rendering the video yourself

```bash
cd video-studio
npm install
npm run generate:audio -- deployInferenceServiceScript   # generates the voiceover .wav files (Chatterbox V3, local/offline)
npx remotion render src/index.ts deploy-inference-service-video out/deploy-inference-service-video.mp4
```

The voiceover is generated locally with [Chatterbox V3](https://github.com/resemble-ai/chatterbox) (Resemble AI's open-source TTS package) — a fully offline neural TTS engine, no cloud service, no API key, no per-minute billing. This supersedes this repo's earlier platform-specific attempts (`generate-audio.ps1` for Windows SAPI, a since-removed macOS-`say`-based script, and Piper — see [`docs/experiments/chatterbox-v3-tts.md`](../../../docs/experiments/chatterbox-v3-tts.md) for the comparison that led to standardizing on Chatterbox V3).

Setup (one-time): see `video-studio/tools/chatterbox/README.md` for the Python environment, and `video-studio/voices/README.md` if you want to configure a reference voice. See `src/audio/providers/ChatterboxProvider.ts` for the provider implementation — it's built behind a generic `TTSProvider` interface (`src/audio/TTSProvider.ts`).

### Visual/render-quality pass (this session)

The whole `/video-studio` toolchain got a quality pass alongside building this video, applied to both compositions:
- **Theme**: replaced the dark navy canvas (`#0b1220` everywhere) with a light, high-contrast blue-accented theme — better legibility, no longer "too dark."
- **Render config**: `remotion.config.ts` now explicitly sets H.264, CRF 16 (near-lossless for UI/text content vs. the default 23), `yuv420p`, JPEG intermediate quality 95.
- **Camera movement**: added a reusable `CameraFocus` component providing an eased push-in toward a focal point, wired into `DashboardMock`, `TerminalMock`, and the new `EditorMock` via an optional `focusPanelIndex`/`focusLineIndex` prop — beats can now zoom in on the one metric/line/diff the narration is pointing at, instead of a flat static shot. Scale is deliberately conservative (1.08–1.22x depending on how much margin the target panel has) since these panels are near-full-width; a larger zoom clips content off-screen.
