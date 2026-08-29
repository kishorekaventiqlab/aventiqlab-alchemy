# AL4 — video-studio made spec-driven

Phase 2 task AL4. The bridge from an AL8 `video/v1` `video_spec` to what
`video-studio`'s Remotion compositions render.

**Status: BUILT on branch `phase2/al4-spec-driven-renderer`.**

---

## What AL4 delivers

| File | Role |
|---|---|
| `video-studio/src/spec/videoSpecTypes.ts` | The `video_spec` shape as the renderer sees it — a hand-kept mirror of `service/src/generate/video-schema.ts` (contract §3.8: no codegen between the service and video-studio). |
| `video-studio/src/spec/loadVideoSpec.ts` | `loadVideoSpec(spec)` → `LoadedVideo` — a `RendererBeat[]` + total duration + `NARRATION_INTERVALS` + an **audio plan**. Plus `retimeBeats(loaded, measured)` for AL5 to call after synthesis. |
| `video-studio/src/compositions/SpecVideo.tsx` | The generic composition: renders a `LoadedVideo` using the same component set (`TitleCard`, `StatementCard`, `ArchitectureDiagram`, `InvestigationScene`, `DashboardMock`, `TerminalMock`, `EditorMock`, `OptionsCompare`, `RecapCard`, `CaptionBar`, `BackgroundMusic`). |
| `video-studio/src/spec/specComposition.tsx` | The `<Composition id="spec-video">` wiring — `calculateMetadata` runs `loadVideoSpec` (+ `retimeBeats`) from `inputProps` to set `durationInFrames`/`fps` from the spec. |
| `video-studio/src/spec/sampleSpec.ts` | A small valid spec so `spec-video` previews in the studio with no inputProps. |

The hand-authored `InferenceUnderLoad` / `DeployInferenceService` /
`HowLlmsGenerateText` compositions are **unchanged** — they stay for the
pre-Content-Studio reference videos. `spec-video` is the one `/v1/render` drives.

---

## How the 10 `visual.kind` values map

| `visual.kind` | Renderer `Beat` type | Component |
|---|---|---|
| `title` | `title` | `TitleCard` |
| `statement` | `statement` | `StatementCard` + `CaptionBar` |
| `optionsCompare` | `optionsCompare` | `OptionsCompare` + `CaptionBar` |
| `architecture` | `architecture` | `ArchitectureDiagram` + `CaptionBar` (`node_kind`→`kind`, `from_index`→`fromIndex`) |
| `investigation` | `investigation` | `InvestigationScene` + per-segment `CaptionBar`/`Audio` |
| `investigation_segment` | *(folded into the container)* | — |
| `dashboard` | `dashboard` | `DashboardMock` + `CaptionBar` |
| `terminal` | `terminal` | `TerminalMock` + `CaptionBar` |
| `editor` | `editor` | `EditorMock` + `CaptionBar` |
| `recap` | `recap` | `RecapCard` + `CaptionBar` |

### The `investigation` fold (AL8 OQ-4 option (a))

The spec has a **container** beat (`visual.kind: "investigation"`,
`narration: ""`, owns the keyframe timeline) plus N **sibling segment** beats
(`visual.kind: "investigation_segment"`, each carrying real
`narration`/`narration_hash`/`target_duration_sec`). The loader folds the
segments back **into** the container as
`segments: [{ t, caption, audioFile, highlightIndex }]` — exactly the shape
`InferenceUnderLoad.tsx` already renders. Segment beats do **not** become
standalone renderer beats. Their stable ids survive in the audio plan so a
Vision-QA `narration_flaw` on `beat-13` still regenerates just that segment.

---

## Timing — two-phase

AL4 runs **before** narration is synthesized, so it can't know real beat
lengths.

1. **`loadVideoSpec`** lays out beats with **provisional** timing from
   `target_duration_sec` (`max(target, floor) + tail_buffer`). Enough to
   preview and to compute a rough `durationInFrames`.
2. **`retimeBeats(loaded, measured)`** — AL5 calls this after
   `scripts/generate-audio.ts` synthesizes each `audioPlan` entry and measures
   the `.wav`. It rewrites every beat's `start`/`duration` to
   `measured_audio + lead_in (0.5s) + tail_buffer (1.0s)`, re-lays the
   investigation segments the same way, and recomputes `NARRATION_INTERVALS`
   and the total. The final `render.output.duration_sec` is this — authoritative
   per contract §5.5.

The renderer is timing-agnostic: it lays out `<Sequence>`s from whatever
`start`/`duration` it's handed.

---

## The audio plan

`loadVideoSpec` returns `audioPlan: [{ audioFile, caption, beatId, allocatedSeconds }]`
— one entry per **narration unit** (a standalone audible beat, or an
investigation segment). Silent `title` beats and investigation *container*
beats contribute nothing. `audioFile` is a stable name derived from the beat id
(`beat-02-problem.wav`). AL5's render flow:

```
video_spec
  -> loadVideoSpec           -> LoadedVideo { beats(provisional), audioPlan, ... }
  -> for each audioPlan entry: generate-audio.ts synthesizes caption -> audioFile.wav, measure it
  -> retimeBeats(loaded, { audioFile: measuredSec, ... })  -> LoadedVideo (final timing)
  -> remotion render, inputProps = { spec, measuredAudio, audioPrefix }
  -> validate-render.ts (mechanical QA, §7.5)
```

---

## Tests

`video-studio/src/spec/loadVideoSpec.test.ts` — 12 cases:
- load produces contiguous, monotonic renderer beats; frame/second totals agree
- investigation segments folded into the container; keyframes remapped to
  renderer casing; no standalone segment beats
- audio plan covers exactly the narration units (not container, not silent
  title); captions are verbatim; filenames stable
- narration intervals: one per audible beat + one per investigation segment
- visual props mapped through (`node_kind`→`kind`, `from_index`→`fromIndex`,
  `narration`→`caption`)
- `retimeBeats` rewrites timing from measured audio, keeps beats contiguous,
  shrinks vs the estimate; re-lays investigation segments
- rejects: non-`video/v1`, non-`animated-explainer`, duplicate ids,
  dangling `investigation_segment.of_container`, empty `beats`

`npm test` / `npm run typecheck` added to `video-studio/package.json`.

---

## Not in AL4

- Running an actual `remotion render` (needs the audio pipeline — AL5).
- `scripts/generate-audio.ts` changes to accept an audio plan instead of a
  checked-in `Beat[]` file — AL5.
- The `/v1/render` HTTP endpoint itself — AL5.
