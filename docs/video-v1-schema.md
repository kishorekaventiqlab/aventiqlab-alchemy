# `video/v1` — the Video Specification schema

**Status: DRAFT for joint alchemy + astra review.** Phase 2 task AL8.
alchemy owns this file (`video-studio` is alchemy's); astra co-authors via the
platform coordinator. This is the unblocker for AL3's video path, AL4, and AL5.

**Contract references:** v1.3 §7.2 (`/v1/generate` video `content`), §7.4
(`/v1/render` `video_spec`), §5.5 (Gate-1 preview), §3.8 (`video/v1` tag), CD-5
(the three are one artifact), CD-10 (`script_outline` stays flat — see §2).

---

## 0. What this is, and what it is not (CD-5, CD-10)

There are **two distinct things**. Conflating them was the original v1.0 mistake.

| Thing | Shape | Where it lives | Who reads it |
|---|---|---|---|
| **`script_outline`** | `string[]` — flat, human summary | the §5.5 Gate-1 `preview` and the `artifact-spec.schema.json` video branch | an instructor at Gate 1 |
| **`video_spec`** | a structured per-beat object (this doc) | `/v1/generate` response `content`; `/v1/render` request `video_spec`; astra's render-cycle snapshots | alchemy's renderer, alchemy's TTS, astra's Vision QA |

**`script_outline` is *derived from* `video_spec`** (§2) — `/v1/generate` produces
both from one model call. The contract's §5.5 / `artifact-spec` shape for
`script_outline` is **unchanged**.

`video_spec` is what AL8 defines. It is simultaneously:
- the `content` returned by `POST /v1/generate` for `artifact_type: "video"`
  (§7.2), stored in `generated/{experience_id}/video/attempt-N.json` (CD-1),
- the `video_spec` field in the `POST /v1/render` request body (§7.4),
- the object astra's render sub-flow (A5) passes between states and snapshots
  per cycle at `s3://astra-content-studio/qa-reports/{experience_id}/render-cycle-{N}/video_spec.json`.

**One object, three names, no mutation between them.** `/v1/render` invocation
params (`cycle`, `vision_qa_feedback`) are passed **alongside** the spec, never
merged into it — so the identical spec renders at cycle 1 and cycle 2.

---

## 1. The schema

### 1.1 Top level

```jsonc
{
  "schema_version": "video/v1",          // REQUIRED. astra validates this tag; mismatch -> validation_failed
  "experience_id": "cexp_01J9Z8...",     // REQUIRED. echoed in — a spec file in S3 is self-identifying
  "title": "Why Pod Autoscaling Can Still Leave You Stuck",   // REQUIRED
  "format": "animated-explainer",         // REQUIRED. "screencast" | "talking-head" | "animated-explainer"
  "central_question": "Why can pod autoscaling still fail when a GPU workload needs additional node capacity?",  // REQUIRED (constitution §3)
  "estimated_duration_minutes": 6,        // REQUIRED. matches §5.5 preview; Vision QA sanity-checks total runtime vs this
  "target_duration_class": "standard",    // REQUIRED. "short" | "standard" | "deep-dive" (constitution §B)
  "spec_hash": "sha256:...",              // REQUIRED. content hash over this object with spec_hash itself excluded — §5
  "voice": {                              // REQUIRED. global TTS params; per-beat narration_hash folds these in
    "provider": "chatterbox-v3",
    "voice_id": "default",
    "params": { "exaggeration": 0.5, "cfg_weight": 0.5 }
  },
  "beats": [ /* §1.2 — ordered, >= 1 */ ]
}
```

| Field | Req | Notes |
|---|---|---|
| `schema_version` | ✅ | Literal `"video/v1"`. §3.8. |
| `experience_id` | ✅ | astra's `cexp_<ulid>`. Not an `exp-*` slug. |
| `title` | ✅ | The video's display title. Feeds §5.5 preview `title`. |
| `format` | ✅ | `artifact-spec` video enum. Drives which renderer composition family is used. `animated-explainer` is the only one fully built today (see §6 OQ-1). |
| `central_question` | ✅ | Constitution §3 — one primary engineering question, phrased as a question. Feeds Vision QA's "does the video answer one question" judgment. |
| `estimated_duration_minutes` | ✅ | Estimate. The **authoritative** final duration is `render.output.duration_sec` (§5.5), timed to the real voiceover. Vision QA flags if actual runtime is ~2x or ~0.5x this. |
| `target_duration_class` | ✅ | Governs which stages Vision QA expects (constitution §F check 2). |
| `spec_hash` | ✅ | §5. astra's dedup: a Gate-2 reject that regenerates a byte-identical spec → astra escalates instead of re-rendering. |
| `voice` | ✅ | Global TTS config. `provider` currently only `chatterbox-v3`. Per-beat `narration_hash` (§1.2) folds `voice` in, so a global voice change busts every beat's TTS cache. |
| `beats` | ✅ | Ordered array, `minItems: 1`. §1.2. |

### 1.2 `beats[]` — the common envelope

Every beat, regardless of type, carries astra's required fields **plus** a typed
visual payload for the renderer:

```jsonc
{
  "id": "beat-07-investigation",         // REQUIRED. STABLE slug-or-id. §1.3
  "stage": "investigation_demonstration", // OPTIONAL but wanted. §3 enum
  "narration": "Here's the moment that matters. Both GPU nodes are full...",  // REQUIRED. verbatim spoken text. §1.4
  "narration_hash": "sha256:...",        // REQUIRED. hash(narration + resolved voice params) — the TTS cache key. §1.5
  "on_screen": "Two GPU node capacity meters both at 100%/FULL (red). Two new pods appear with dashed amber 'Pending' outlines. A queue-depth counter keeps climbing.",  // REQUIRED. PROSE description, Vision-QA-facing. §1.6
  "target_duration_sec": 14.6,           // REQUIRED. INTENDED length — a target/hint, not authoritative. §1.7
  "visual": { /* §4 — the typed, per-`kind` renderer payload */
    "kind": "investigation",
    "...": "kind-specific structured props"
  }
}
```

| Field | Req | Consumed by | Notes |
|---|---|---|---|
| `id` | ✅ | Vision QA (`evidence.beat_id`), alchemy per-beat regen | §1.3 — stable across re-renders; adding/removing a beat must not renumber others. |
| `stage` | ⭘ | Vision QA routing, constitution §F validator | §3. Omit only if genuinely ambiguous. |
| `narration` | ✅ | alchemy TTS, Vision QA transcript compare | §1.4 — the single source of truth for spoken text. |
| `narration_hash` | ✅ | alchemy's content-hash TTS cache | §1.5 — skip re-synth when unchanged across cycles. |
| `on_screen` | ✅ | Vision QA frame analysis | §1.6 — prose, describes *intent*. Distinct from `visual`. |
| `target_duration_sec` | ✅ | Vision QA pacing check | §1.7 — target, not a hard value; the render times to the voiceover. |
| `visual` | ✅ | alchemy's Remotion renderer | §4 — the typed props the composition actually needs. `visual.kind` selects the renderer branch. |

### 1.3 `id` — stability contract

- Format: `^beat-[0-9]{2,}(-[a-z0-9-]+)?$` — a zero-padded ordinal, optionally
  a slug (`beat-07`, `beat-07-investigation`). The ordinal is for humans reading
  a diff; **the full string is the identity**.
- **Stable across render cycles.** When Vision QA returns
  `{ category: "narration_flaw", evidence: { beat_id: "beat-07-investigation" } }`,
  alchemy regenerates the narration for *that beat only*, re-synthesizes its
  audio (its `narration_hash` changed), and re-renders. Every other beat's
  `id`, `narration`, `narration_hash`, and cached audio are untouched.
- **Adding/removing a beat does not renumber.** If cycle 2 inserts a beat
  between `beat-04` and `beat-05`, it is `beat-04b` or `beat-045` — never a
  renumber that shifts `beat-05`→`beat-06`. (The ordinal stops being globally
  sequential; that's fine — `id` is an identifier, `beats[]` array order is the
  play order.)
- `id`s are unique within a spec (schema + self-check).

### 1.4 `narration` — verbatim

- The exact words to be spoken, plain prose, no SSML, no markup, no stage
  directions, no `"CAPTION:"` / speaker labels (constitution §7).
- This string is: (a) synthesized 1:1 to one audio file by
  `scripts/generate-audio.ts` (Chatterbox V3), (b) rendered as the on-screen
  subtitle by `CaptionBar`, (c) the reference transcript Vision QA compares the
  rendered MP4's extracted speech against.
- **Vision QA routing on a mismatch:**
  - extracted transcript ≠ `narration` (words dropped, reordered, mangled) →
    `narration_flaw` → alchemy regenerates that beat's script + re-synths.
  - `narration` itself states something factually wrong → `content_flaw` →
    0 retries, astra escalates (the spec's source text is the problem).

### 1.5 `narration_hash` — the TTS cache key

- `narration_hash = sha256(narration_text + " " + canonical_json(resolved_voice))`
  where `resolved_voice` = the top-level `voice` object (a per-beat voice
  override, if we ever add one, folds in here).
- This is the key for the content-hash TTS cache the pipeline architecture
  already specifies (astra's architecture HTML). On render cycle N+1: for each
  beat, if `narration_hash` matches a cached entry, **reuse the wav** — skip the
  Chatterbox call. Only beats whose narration (or the global voice) changed get
  re-synthesized.
- alchemy computes it; astra treats it as opaque. It is part of the spec so a
  cache lookup needs nothing but the spec.

### 1.6 `on_screen` vs `visual` — the reconciliation

astra asked for a description Vision QA can check a frame against. The renderer
needs structured data. **The spec carries both, and they must not drift:**

- **`on_screen`** — a prose sentence or two describing what a viewer *should
  see* during the beat: the elements, their state, what's emphasized. Written
  for a human (or a multimodal model) to compare against a rendered frame.
  Vision QA `layout_bug` = the frame doesn't match this (overflow, missing
  element, wrong diagram, unreadable text).
- **`visual`** — §4. The typed props alchemy's Remotion composition consumes:
  node coordinates, keyframe timelines, terminal lines, dashboard series. The
  renderer never reads `on_screen`.
- **Consistency rule:** `on_screen` must be a faithful natural-language
  rendering of `visual`. AL3's generator produces `visual` first, then writes
  `on_screen` to describe it (not the reverse). A self-check (§ AL3 update)
  spot-verifies key nouns in `on_screen` appear in `visual` (e.g. `on_screen`
  mentions "terminal" ⟺ `visual.kind == "terminal"`; mentions a node label ⟺
  that label is in `visual.nodes`).
- If Vision QA passes frames but `on_screen` and `visual` disagree, that's an
  alchemy bug, not a pipeline state — caught by the self-check, not by astra.

### 1.7 `target_duration_sec`

- The intended beat length, in seconds. Used by AL3 as the initial
  `beat.duration` and by the renderer to lay out `<Sequence>` windows **before**
  audio is synthesized.
- After `/v1/render` synthesizes narration, alchemy rewrites each beat's actual
  duration to `max(target_duration_sec, measured_audio_sec + lead_in + buffer)`
  and the video's real total is `render.output.duration_sec` — **authoritative**
  per §5.5.
- Vision QA `pacing_issue` = actual beat duration deviates *hard* from
  `target_duration_sec` (e.g. narration ran 2x long), OR on-screen content
  visibly outlasts the narration (dead air).
- Sum of `target_duration_sec` across beats should be within ~15% of
  `estimated_duration_minutes * 60` (self-check).

---

## 2. Deriving `script_outline: string[]` from `beats[]` (CD-10)

`/v1/generate` returns **both** `content` (the full `video_spec`) and, for the
§5.5 preview, a flat `script_outline`. The outline is derived, not separately
authored:

```
script_outline = beats
  .filter(b => b.stage !== undefined)            // stage-less beats (e.g. a bare title card) are skipped
  .map(b => `${humanStageLabel(b.stage)}: ${oneLineSummary(b)}`)
```

- `humanStageLabel("investigation_demonstration")` → `"Investigation/Demonstration"`.
- `oneLineSummary(b)` — the first sentence of `narration`, trimmed to ~140 chars,
  or a hand-authored `b.outline_hint` if the generator provides one (optional
  per-beat field, see §1.2 note — **not** required, purely to make the preview
  read better than a truncated narration).
- Result matches the existing `artifact-spec.schema.json` video-branch
  `script_outline: string[]` and the §5.5 preview shape **exactly** — no
  contract change.
- Multiple beats sharing a `stage` (a 4-beat Context/Mental-Model run) collapse
  to one outline line (the stage's first beat), so the preview stays a summary.

Worked (from §7's example): the 24-beat `video_spec` → a ~10-line
`script_outline`, one line per narrative stage.

---

## 3. The `stage` enum

Pulled verbatim from
[`docs/video-artifact-constitution.md`](video-artifact-constitution.md) §B
(`video-narrative.schema.json`) — **this is where that enum lands.** Ten values,
canonical order:

| `stage` | Constitution tier | What it means for the RENDERER | What it means for Vision QA ROUTING |
|---|---|---|---|
| `problem` | REQUIRED | usually a `statement` visual (eyebrow "The problem", danger color) | narration mismatch → `narration_flaw` (it's a spoken hook, not a demo) |
| `stakes` | RECOMMENDED | `statement` (eyebrow "What breaks…", warning color) | `narration_flaw` lean |
| `curiosity` | REQUIRED | `statement` (eyebrow "The question", accent color) | `narration_flaw` lean |
| `context_mental_model` | REQUIRED | `architecture` visual — the component chain, node highlight per beat | mismatch could be either; frame-vs-`on_screen` diagram check is the primary signal → `layout_bug` if the diagram is wrong, else `narration_flaw` |
| `options` | RECOMMENDED | `optionsCompare` visual — named approaches, no favorite yet | `narration_flaw` lean (comparison is verbal) |
| `trade_offs` | RECOMMENDED | `optionsCompare` visual — `solves`/`doesNotSolve` columns, `favored` set | `narration_flaw` lean |
| `investigation_demonstration` | REQUIRED | `investigation` (keyframe timeline) OR `dashboard`/`terminal` — cause/effect changing on screen | mismatch → **`content_flaw` lean** (the demo is showing the wrong thing) |
| `decision` | REQUIRED | `statement` (eyebrow "The decision", accent color) | `narration_flaw` lean, but a decision that contradicts the shown demo → `content_flaw` |
| `best_practice` | REQUIRED | `statement` (eyebrow "Best practice", success color) | `narration_flaw` lean |
| `takeaway` | OPTIONAL | `recap` visual — 3–5 bullet items | `narration_flaw` lean |

- A beat's `stage` does **not** dictate its `visual.kind` — a
  `context_mental_model` beat is *usually* `architecture` but a screencast video
  might do it as `terminal`. The renderer keys off `visual.kind`, not `stage`.
  `stage` is a routing/validation hint only.
- `investigation_demonstration` legitimately spans **many** beats (the
  reference video has ~11) — some `investigation`, some `dashboard`, some
  `terminal`.
- Validator (constitution §F, astra-side or a shared lib): for
  `target_duration_class: "standard"|"deep-dive"`, every REQUIRED-tier stage
  must appear in `beats[].stage`; `"short"` needs only the §3a minimum
  signature. Missing RECOMMENDED → warning, not failure.

---

## 4. Per-beat `visual` payloads (what the renderer actually needs)

`visual.kind` is one of the 9 beat renderer branches that
`video-studio/src/compositions/*` currently pattern-match on. Each has a typed
payload. **These are the real props from the current `Beat[]` types in
`video-studio/src/data/*Script.ts` and the component signatures** — AL8 lifts
them into the contract-visible schema.

### 4.1 `visual.kind: "title"`
```jsonc
{ "kind": "title", "title": "Why Pod Autoscaling…", "subtitle": "Why can pod autoscaling still fail…?" }
```
Renders `TitleCard`. Usually the only beat with no `stage` and no `narration`
(a silent 7s open) — in which case `narration` is `""` and `narration_hash` is
the hash of the empty string (still required, keeps the cache uniform).
*(OQ-3: should a silent title beat be allowed to omit `narration`/`narration_hash`?)*

### 4.2 `visual.kind: "statement"`
```jsonc
{
  "kind": "statement",
  "eyebrow": "The problem",
  "eyebrow_color": "danger",       // "accent" | "danger" | "warning" | "success"
  "statement": "Users of your GPU inference service are seeing slow responses.",
  "support": "Traffic climbed. Pods are scaling. Latency keeps getting worse anyway."   // optional
}
```
Renders `StatementCard` + `CaptionBar`. The `problem/stakes/curiosity/decision/
best_practice` stages all use this.

### 4.3 `visual.kind: "architecture"`
```jsonc
{
  "kind": "architecture",
  "nodes": [
    { "node_kind": "users", "label": "Users", "sublabel": null, "x": 220, "y": 160 },
    { "node_kind": "keda", "label": "KEDA", "sublabel": "controls replica count", "x": 740, "y": 420 }
    // node_kind ∈ users|alb|service|pod|gpu|keda|scheduler|karpenter|node
  ],
  "edges": [
    { "from_index": 0, "to_index": 1, "flowing": true }
  ],
  "highlight_index": 5              // optional — which node is emphasized this beat
}
```
Renders `ArchitectureDiagram`. Coordinates are in a 1920×1080 frame. A
multi-beat mental-model run reuses one `nodes` layout and varies
`highlight_index` + which `edges` are shown per beat.
*(OQ-2: node layout is hand-authored today. Can a model reliably place nodes on
a 1920×1080 canvas, or does alchemy need a layout helper / a fixed library of
named layouts the model picks from?)*

### 4.4 `visual.kind: "optionsCompare"`
```jsonc
{
  "kind": "optionsCompare",
  "options": [
    {
      "name": "KEDA (queue-depth)",
      "solves": "Scales replica count from a signal that reflects real demand.",
      "does_not_solve": "Cannot create GPU node capacity.",
      "favored": true              // optional; absent/false for the Options stage, set for Trade-offs
    }
  ]
}
```
Renders `OptionsCompare`. 1 option for the `options` stage (the rejected first
instinct), 2–3 for `trade_offs`.

### 4.5 `visual.kind: "investigation"`
The most complex — a continuous scene with a keyframe timeline and narration
sub-segments (see `InvestigationScene.tsx`, constitution §5 "Fixed").
```jsonc
{
  "kind": "investigation",
  "keyframes": [
    {
      "t": 0,                       // seconds, scene-relative
      "traffic": 100, "pod_count": 4, "gpu_pct": 45, "queue_depth": 0,
      "nodes": [ { "id": "n1", "label": "GPU Node 1", "fill_percent": 45, "full": false, "incoming": false } ],
      "pending_pods": [], "resolved_pods": [],
      "traffic_color": null, "gpu_color": null   // null | "accent" | "danger" | "warning" | "success"
    }
  ],
  "segments": [
    { "t": 0, "narration_ref": "beat-11", "highlight_index": null }
    // each segment's narration is the beat whose id == narration_ref (see §4.5 note)
  ],
  "camera_keyframes": [             // optional; a sensible default is used if absent
    { "t": 0, "focal_x": 960, "focal_y": 540, "scale": 1 }
  ]
}
```
**`investigation` is special:** the current renderer models it as ONE beat
containing multiple narration `segments`, each with its own audio. In `video/v1`
we keep the outer beat as one `beats[]` entry (`stage:
investigation_demonstration`), and each segment references a **child narration
unit**. Two options, needs an astra call — see OQ-4:
- **(a)** the `segments[].narration_ref` points at sibling `beats[]` entries
  that carry the actual `narration`/`narration_hash`/`target_duration_sec` and a
  `visual.kind: "investigation_segment"` marker, and the `investigation` beat
  just owns the shared keyframe timeline; **or**
- **(b)** `segments[]` inline their own `{ narration, narration_hash,
  target_duration_sec }` and the `investigation` beat is genuinely a nested
  structure (breaks the "flat `beats[]` with stable ids" model slightly —
  segment ids would be `beat-07.seg-2`).

alchemy leans **(a)** — keeps every narration unit a first-class beat with a
stable id, so Vision QA can still say `beat_id: "beat-13"` and alchemy regens
just that segment's audio. The `investigation` "container" beat then has
`narration: ""`.

### 4.6 `visual.kind: "dashboard"`
```jsonc
{
  "kind": "dashboard",
  "service_name": "doc-search-summarizer",
  "alert": "P2 — Latency SLO burn rate elevated",   // optional
  "panels": [
    { "label": "p99 latency", "unit": "ms", "color": "#f97066", "points": [220, 230, 240, 260, 300, 360, 430, 520], "flat": false }
  ],
  "focus_panel_index": 0            // optional
}
```
Renders `DashboardMock`. `points` is the series; `flat: true` hints a
steady-state panel.

### 4.7 `visual.kind: "terminal"`
```jsonc
{
  "kind": "terminal",
  "lines": [
    { "kind": "prompt", "text": "kubectl get scaledobject doc-search-summarizer -n inference" },
    { "kind": "output", "text": "NAME  READY  ACTIVE  MIN  MAX  TRIGGERS" }
  ],
  "focus_line_index": 5            // optional
}
```
Renders `TerminalMock`. `line.kind ∈ prompt | output`.

### 4.8 `visual.kind: "editor"`
```jsonc
{
  "kind": "editor",
  "filename": "fraud-scoring-api/values.yaml",
  "lines": [
    { "kind": "existing", "text": "replicaCount: 2" },
    { "kind": "added", "text": "    nvidia.com/gpu: 1" }
  ],
  "focus_line_index": 15           // optional
}
```
Renders `EditorMock` (used by `DeployInferenceService`). `line.kind ∈ existing |
added | comment | placeholder`.

### 4.9 `visual.kind: "recap"`
```jsonc
{ "kind": "recap", "items": ["KEDA — \"How many replicas do I need?\"", "Karpenter — \"Do I have the capacity?\"", "Scheduler — \"Where do they run?\""] }
```
Renders `RecapCard`. 3–5 short items.

### 4.10 Not in v1
`GenerationLoopScene`, `LatencyContrastScene`, `PipelineDiagram`,
`SqsQueueMeter` (used *inside* `investigation`), `LineChart`, `CameraFocus` —
these are either sub-components of the above or specific to the
`HowLlmsGenerateText` video, which is not a Content-Studio-generated artifact.
If a generated video needs a genuinely new visual, that's a `video/v1.1`
schema + renderer change (contract §3.8: tracked by hand between astra and
alchemy).

---

## 5. `spec_hash`

```
spec_hash = "sha256:" + hex(sha256(canonical_json(spec_without_spec_hash_field)))
```
- `canonical_json` = keys sorted recursively, no insignificant whitespace,
  UTF-8.
- Computed by alchemy in `/v1/generate`, **excluding** the `spec_hash` field
  itself.
- **astra's use (A5 dedup):** on a Gate-2 reject → re-generate. If the new
  spec's `spec_hash` equals the previous cycle's, the regeneration was a no-op
  (the model produced byte-identical output) — astra escalates
  (`needs_review`, reason ~`render_no_progress`) rather than burning a render
  cycle. Also lets astra skip a redundant `/v1/render` if a retry produced an
  identical spec.
- `narration_hash` values are *inputs* to `spec_hash` (they're fields in the
  spec), so a narration change moves both.

---

## 6. Worked example — `exp-inference-under-load`

The real rendered video is 24 beats / 329s (`video-studio/src/data/inferenceUnderLoadScript.ts`,
narrative plan `experience-catalog/exp-inference-under-load/content/video-narrative-plan.md`).
Its `video/v1` `video_spec` (abbreviated — 6 of 24 beats shown):

```jsonc
{
  "schema_version": "video/v1",
  "experience_id": "cexp_01J9Z8EXAMPLE",
  "title": "Why Pod Autoscaling Can Still Leave You Stuck",
  "format": "animated-explainer",
  "central_question": "Why can pod autoscaling still fail when a GPU workload needs additional node capacity?",
  "estimated_duration_minutes": 6,
  "target_duration_class": "standard",
  "spec_hash": "sha256:PLACEHOLDER",
  "voice": { "provider": "chatterbox-v3", "voice_id": "default", "params": { "exaggeration": 0.5, "cfg_weight": 0.5 } },
  "beats": [
    {
      "id": "beat-01-title",
      "stage": null,
      "narration": "",
      "narration_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "on_screen": "Title card: 'Why Pod Autoscaling Can Still Leave You Stuck' with the central question as a subtitle.",
      "target_duration_sec": 7,
      "visual": { "kind": "title", "title": "Why Pod Autoscaling Can Still Leave You Stuck", "subtitle": "Why can pod autoscaling still fail when a GPU workload needs additional node capacity?" }
    },
    {
      "id": "beat-02-problem",
      "stage": "problem",
      "narration": "Your GPU inference service is falling behind. Traffic climbed a while ago, the pods have been scaling the whole time, and responses are still getting slower.",
      "narration_hash": "sha256:...",
      "on_screen": "A single statement card, red 'The problem' eyebrow: 'Users of your GPU inference service are seeing slow responses.' with a supporting line below.",
      "target_duration_sec": 11.3,
      "visual": {
        "kind": "statement", "eyebrow": "The problem", "eyebrow_color": "danger",
        "statement": "Users of your GPU inference service are seeing slow responses.",
        "support": "Traffic climbed. Pods are scaling. Latency keeps getting worse anyway."
      }
    },
    {
      "id": "beat-05-context-1",
      "stage": "context_mental_model",
      "narration": "To answer that, let's look at what's actually inside the cluster. A request arrives through a load balancer, hits a Kubernetes Service, and gets forwarded to one of the inference pods.",
      "narration_hash": "sha256:...",
      "on_screen": "Architecture diagram: Users -> ALB -> Service -> Inference Pod, with the flow arrows animating left to right. GPU, KEDA, Scheduler, Karpenter present but not yet highlighted.",
      "target_duration_sec": 12.5,
      "visual": {
        "kind": "architecture",
        "nodes": [
          { "node_kind": "users", "label": "Users", "sublabel": null, "x": 220, "y": 160 },
          { "node_kind": "alb", "label": "ALB", "sublabel": "ingress", "x": 480, "y": 160 },
          { "node_kind": "service", "label": "Service", "sublabel": "load-balances pods", "x": 740, "y": 160 },
          { "node_kind": "pod", "label": "Inference Pod", "sublabel": "vLLM", "x": 1000, "y": 160 },
          { "node_kind": "gpu", "label": "GPU", "sublabel": null, "x": 1260, "y": 160 },
          { "node_kind": "keda", "label": "KEDA", "sublabel": "controls replica count", "x": 740, "y": 420 },
          { "node_kind": "scheduler", "label": "Scheduler", "sublabel": "places pods on nodes", "x": 1000, "y": 420 },
          { "node_kind": "karpenter", "label": "Karpenter", "sublabel": "provisions node capacity", "x": 1260, "y": 420 }
        ],
        "edges": [
          { "from_index": 0, "to_index": 1, "flowing": true },
          { "from_index": 1, "to_index": 2, "flowing": true },
          { "from_index": 2, "to_index": 3, "flowing": true }
        ],
        "highlight_index": null
      }
    },
    {
      "id": "beat-09-options",
      "stage": "options",
      "narration": "Before going further - the obvious first instinct here is a CPU-based HPA. It's the default, well-known mechanism for pod autoscaling. So why isn't that the answer?",
      "narration_hash": "sha256:...",
      "on_screen": "A single comparison column titled 'HPA (CPU-based)' with a 'solves' line and a 'does not solve' line. No option marked favored yet.",
      "target_duration_sec": 12.3,
      "visual": {
        "kind": "optionsCompare",
        "options": [
          { "name": "HPA (CPU-based)", "solves": "Scales replica count based on CPU utilization - the default, well-known mechanism.", "does_not_solve": "Doesn't reflect demand for this workload - CPU stays low even while the queue backs up.", "favored": false }
        ]
      }
    },
    {
      "id": "beat-11-investigation-seg-1",
      "stage": "investigation_demonstration",
      "narration": "Here's the system running normally. A hundred requests a second, four pods, two nodes. GPU utilization is comfortable, and there's no queue. Nothing is under pressure.",
      "narration_hash": "sha256:...",
      "on_screen": "Wide shot of the cluster: 2 GPU node capacity meters near half-full (calm/green), 4 pod dots, a traffic counter reading ~100 req/s, a queue-depth counter at 0.",
      "target_duration_sec": 12.5,
      "visual": { "kind": "investigation_segment", "of_container": "beat-10-investigation", "segment_index": 0, "highlight_index": null }
    },
    {
      "id": "beat-10-investigation",
      "stage": "investigation_demonstration",
      "narration": "",
      "narration_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "on_screen": "Continuous investigation scene: traffic climbs 100->980 req/s, KEDA scales pods 4->14, both GPU nodes fill to 100%, 2 pods go Pending, a 3rd GPU node fades in (Karpenter), pending pods schedule, queue drains, system settles.",
      "target_duration_sec": 83.7,
      "visual": {
        "kind": "investigation",
        "keyframes": [
          { "t": 0, "traffic": 100, "pod_count": 4, "gpu_pct": 45, "queue_depth": 0, "nodes": [ { "id": "n1", "label": "GPU Node 1", "fill_percent": 45, "full": false, "incoming": false }, { "id": "n2", "label": "GPU Node 2", "fill_percent": 40, "full": false, "incoming": false } ], "pending_pods": [], "resolved_pods": [], "traffic_color": null, "gpu_color": null },
          { "t": 42.3, "traffic": 980, "pod_count": 14, "gpu_pct": 99, "queue_depth": 44, "nodes": [ { "id": "n1", "label": "GPU Node 1", "fill_percent": 100, "full": true, "incoming": false }, { "id": "n2", "label": "GPU Node 2", "fill_percent": 100, "full": true, "incoming": false } ], "pending_pods": ["pod-13", "pod-14"], "resolved_pods": [], "traffic_color": "danger", "gpu_color": "danger" },
          { "t": 56.9, "traffic": 980, "pod_count": 14, "gpu_pct": 99, "queue_depth": 44, "nodes": [ { "id": "n1", "label": "GPU Node 1", "fill_percent": 100, "full": true, "incoming": false }, { "id": "n2", "label": "GPU Node 2", "fill_percent": 100, "full": true, "incoming": false }, { "id": "n3", "label": "GPU Node 3", "fill_percent": 40, "full": false, "incoming": true } ], "pending_pods": [], "resolved_pods": ["pod-13", "pod-14"], "traffic_color": "danger", "gpu_color": "danger" }
        ],
        "segments": [
          { "t": 0, "narration_ref": "beat-11-investigation-seg-1", "highlight_index": null },
          { "t": 42.3, "narration_ref": "beat-14-investigation-seg-4", "highlight_index": null },
          { "t": 56.9, "narration_ref": "beat-15-investigation-seg-5", "highlight_index": 7 }
        ],
        "camera_keyframes": []
      }
    }
  ]
}
```

Its derived `script_outline` (the flat §5.5 preview):
```json
[
  "Problem: a GPU inference service's users see slow responses despite pods scaling.",
  "Stakes: queue -> latency -> timeouts -> user-visible failure, against a paid-tier SLA.",
  "Curiosity: CPU is at 35%, nowhere near saturated - so why is the service still falling behind?",
  "Context/Mental Model: the request path and the three control components (KEDA/Scheduler/Karpenter).",
  "Options: CPU-based HPA named as the obvious but insufficient first instinct.",
  "Trade-offs: HPA vs KEDA vs Karpenter, each showing what it solves and what it does not.",
  "Investigation/Demonstration: traffic climb -> KEDA scales -> Pending pods -> Karpenter -> recovery.",
  "Decision: why KEDA and Karpenter run together, not one instead of the other.",
  "Best Practice: if replicas are increasing but pods stay Pending, check node capacity first.",
  "Takeaway: KEDA / Karpenter / Scheduler distinguished by the question each answers."
]
```

---

## 7. Open questions (astra + alchemy)

| # | Question | alchemy's lean |
|---|---|---|
| **OQ-1** | `format` has 3 values but only `animated-explainer` has a full renderer. Does Content Studio v1 generate only `animated-explainer` (and `screencast`/`talking-head` are `video/v1.1`), or must AL5 render all three? | **v1 = `animated-explainer` only.** `screencast` is close (`terminal`+`editor`+`dashboard` beats already exist); `talking-head` needs an avatar/footage pipeline that doesn't exist. AL3 should reject non-`animated-explainer` `format` as `unsupported_type` for now. |
| **OQ-2** | `architecture` node coordinates are hand-authored in the reference. Can a model place nodes on a 1920×1080 canvas reliably, or does alchemy need a layout engine / named-layout library? | Provide the model a **small library of named layouts** (`request-path-horizontal`, `control-plane-split`, …) it picks from + per-node label/highlight, rather than raw coordinates. Reduces `layout_bug` risk. Needs a v1.1 field `visual.layout_ref` — or ship v1 with raw coords + a strong self-check on bounds. |
| **OQ-3** | Silent `title` beat: allow `narration`/`narration_hash` to be omitted, or require `""` + the empty-string hash? | Require `""` + empty hash — keeps every beat uniform for the TTS cache and Vision QA transcript alignment (a silent beat contributes an empty transcript window). |
| **OQ-4** | `investigation` segments: sibling beats with `narration_ref` (alchemy's lean (a)), or nested `segments[]` with inline narration (b)? Affects whether Vision QA's `beat_id` can address a segment. | **(a)** — every narration unit is a first-class beat with a stable id; the `investigation` container beat has `narration: ""` and owns only the keyframe timeline. Vision QA addresses `beat-13` directly. Costs: `beats[]` isn't purely "one visual each" — a container beat + N segment beats. Flag if astra's A5 state machine assumes 1 beat = 1 renderable unit. |
| **OQ-5** | Who runs the constitution §F stage-coverage validator — astra (as part of its schema check), alchemy (in `/v1/generate` self-check), or a shared lib? | **Shared lib**, published from the alchemy repo (it's the constitution's rule, and alchemy owns the constitution). astra imports it for its §7.2 cross-check; alchemy runs it in the self-check. Avoids drift. |
| **OQ-6** | `spec_hash` stability: `estimated_duration_minutes` and `target_duration_sec` are model estimates that could jitter between otherwise-identical regenerations, defeating the dedup. Exclude them from the hash? | Hash **only the semantically-load-bearing fields**: `beats[].{id, stage, narration, on_screen, visual}` + top-level `{central_question, title, format}`. Exclude all duration estimates and `narration_hash` (derivable). A "same spec" is same *content*, not same timing guess. Needs astra sign-off since astra owns the dedup semantics. |
| **OQ-7** | Does astra's Vision QA need the `voice` params per beat, or is the global object enough? | Global is enough for v1 (one voice per video). Per-beat override is a v1.1 concern. |

---

## 8. Summary

- **`video_spec` (this schema) ≠ `script_outline`.** The latter is a flat
  `string[]` preview *derived from* the former (§2). Contract §5.5 unchanged
  (CD-10).
- **One object, three consumers** (`/v1/generate` content, `/v1/render`
  `video_spec`, astra's cycle snapshots), never mutated between them (CD-5).
  `cycle` / `vision_qa_feedback` ride alongside, not inside.
- **Every beat carries** a stable `id`, verbatim `narration`, `narration_hash`
  (TTS cache key), prose `on_screen` (Vision QA), `target_duration_sec` (a
  hint — real duration is voiceover-timed), an optional `stage`, and a typed
  `visual` payload for the renderer.
- **`on_screen` (prose, Vision-QA-facing) and `visual` (structured,
  renderer-facing) both live in the spec** and must stay consistent — AL3
  generates `visual` first, derives `on_screen`, self-checks the pair.
- **9 `visual.kind` values** map 1:1 to the renderer branches
  `video-studio/src/compositions/*` already have. A genuinely new visual is a
  `video/v1.1`.
- **The `stage` enum is the constitution's 10-value list**, finally landing
  here, with a rendering meaning and a Vision-QA-routing meaning per value (§3).
- **7 open questions** for astra — the load-bearing ones are OQ-4 (investigation
  segment addressing, affects A5), OQ-6 (what `spec_hash` covers, affects
  dedup), OQ-5 (who owns the stage validator).
