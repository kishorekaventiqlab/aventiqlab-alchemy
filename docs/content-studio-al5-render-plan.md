# AL5 — `POST /v1/render` (async) + AL9 TTS host — design/plan

Phase 2 task AL5 (+ AL9). alchemy's **last** Phase 2 task. See
`aventiqlab-platform/docs/content-studio-phase2-tracker.md`.
Authorized by [ADR-0001](adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md).
Builds on [AL2](content-studio-service-foundation-plan.md) (service),
[AL4](content-studio-al4-spec-driven-renderer.md) (`loadVideoSpec` / `retimeBeats`),
[AL7](content-studio-al7-bucket-plan.md) (bucket + grants), and
[AL8](video-v1-schema.md) (`video_spec`).

**Status: BUILT on branch `phase2/al5-render`.** All of F1–F4 confirmed by
astra's A10/A11 plan. Contract references: v1.3 §7.4, §7.5, §1.1, CD-1, CD-11,
and the AL5-round decisions **CD-17** (async 202+poll), **CD-18**
(`/v1/artifacts/promote`), **CD-20** (astra edits the spec for layout/pacing),
**CD-21** (`tts-cache/` prefix).

**As-built:** `service/src/render/` (the Lambda side — `POST /v1/render`,
`GET /v1/render/{id}`, `POST /v1/artifacts/promote`, the DynamoDB job store,
the `ecs:RunTask` launcher, `planReRender`, the TTS cache-key logic) +
`video-studio/src/render/` (the Fargate worker — `runRenderJob` orchestration
with every I/O step injected, the worker entrypoint, the S3-backed TTS cache,
the single-beat `narration_flaw` OpenRouter regen, the pinned hash formulas) +
`video-studio/src/audio/synthesize.ts` (the reusable audio core,
`generate-audio.ts` is now a thin wrapper) + `video-studio/scripts/
validate-render.ts`'s new `--beats` mode + `video-studio/Dockerfile.render`
(AL9 — Chatterbox V3 CPU, weights pre-pulled at build) + the CDK
`RenderCompute` construct (DynamoDB table + GSI, Fargate task def, all the new
IAM). 157 tests total across the three packages (117 service + 18 video-studio
+ 22 infra); typecheck + build + `cdk synth` clean.

**Rev 2 changes** (user decisions + coordinator F1–F4):
- The API **stays on Lambda**. `/v1/render` is **async**: `POST` → `202
  { render_job_id }`; astra polls `GET /v1/render/{render_job_id}`. The render
  runs in a **separate Fargate task** (CD-17). A small job store tracks it.
- `GET .../{job_id}` "done" response includes **`rendered_spec_pointer`** (F3) —
  astra signs+fetches it via AL6, no cross-account S3 read.
- `vision_qa_feedback` for `layout_bug`/`pacing_issue`: the `video_spec` arrives
  **already edited by astra** (CD-20); alchemy renders what it's given
  (+ an optional `pacing_issue` tail-buffer bump). `narration_flaw` beat-regen
  stays alchemy's.

---

## 1. The two endpoints

Both behind `requireServiceAuth` (same `ALCHEMY_SERVICE_JWT_SECRET`; `sub` =
`experience_id`, checked like AL6). Both on the **AL2 Lambda** — no service
move.

### 1.1 `POST /v1/render` — start a render job

**Request** (contract §7.4):

```json
{
  "experience_id": "cexp_01J9Z8...",
  "cycle": 1,
  "video_spec": { "schema_version": "video/v1", "...": "an AL8 video/v1 spec" },
  "vision_qa_feedback": null
}
```

| Field | Notes |
|---|---|
| `experience_id` | `cexp_<ulid>`. `sub` must match. |
| `cycle` | int ≥ 1. A Vision-QA / Gate-2 reject bumps it. **Not** in `video_spec` (CD-5) — a render param; names the S3 prefix `renders/{id}/cycle-{cycle}/`. |
| `video_spec` | the full AL8 spec. On `layout_bug`/`pacing_issue` re-renders it's **already edited by astra** (CD-20). alchemy validates `schema_version == "video/v1"` + re-runs the AL3 self-check (`unsupported_type`/`validation_failed` on failure). |
| `vision_qa_feedback` | `null` on `cycle 1`; else `{ category, reason, evidence }` — §7. `content_flaw` never arrives. |

**Response `202 Accepted`:**

```json
{ "render_job_id": "rj_01J9ZB...", "experience_id": "cexp_01J9Z8...", "cycle": 1, "status": "pending" }
```

- The Lambda: validates the request, generates `render_job_id` (a ULID),
  writes the job record (§3), calls `ecs:RunTask` to launch the render worker
  (passing `render_job_id` + the S3 key of the stashed request), returns `202`.
- The request body (incl. `video_spec`) is **stashed in S3** at
  `renders/{experience_id}/cycle-{cycle}/request.json` so the Fargate task
  reads it from there, not from an env var (`video_spec` is too big for a task
  env var / `RunTask` overrides).
- **One render per experience at a time** (astra's concurrency model). If a
  job for this `experience_id` is already `pending`/`running`, alchemy returns
  `409 invalid_pipeline_state` ("a render is already in progress for this
  experience") — astra shouldn't do this, but it's a cheap guard.
- Errors (§9): `validation_failed` / `unsupported_type` (bad `video_spec` or
  body), `not_configured`, `internal_error` (RunTask failed → no job created).

### 1.2 `GET /v1/render/{render_job_id}` — poll a render job

**Response `200`** — one of three states:

```jsonc
// pending / running
{ "render_job_id": "rj_...", "experience_id": "cexp_...", "cycle": 1, "status": "running",
  "started_at": "2026-08-29T14:00:00Z", "phase": "rendering" }   // phase: "synthesizing" | "rendering" | "validating" | null

// done
{
  "render_job_id": "rj_...", "experience_id": "cexp_...", "cycle": 1, "status": "done",
  "started_at": "...", "finished_at": "...",
  "mechanical_qa": {
    "passed": true,
    "checks": [ { "name": "Audio track exists", "pass": true, "detail": "codec=aac" }, "..." ]
  },
  "output": {
    "s3_pointer": "s3://aventiqlab-alchemy-content/renders/cexp_.../cycle-1/attempt-1.mp4",
    "duration_sec": 329,
    "poster_s3_pointer": "s3://.../cycle-1/attempt-1.poster.png"
  },
  "rendered_spec_pointer": "s3://.../renders/cexp_.../cycle-1/attempt-1.video_spec.json"
}

// failed
{ "render_job_id": "rj_...", "experience_id": "cexp_...", "cycle": 1, "status": "failed",
  "started_at": "...", "finished_at": "...",
  "error": { "code": "render_failed", "message": "Remotion render exited 1: <summary>", "retryable": true } }
```

| Field | Notes |
|---|---|
| `status` | `pending` (job created, task not started) → `running` → `done` \| `failed`. |
| `phase` | while `running`, a coarse progress hint from the task. Optional; `null` if unknown. |
| `mechanical_qa` | **only on `done`.** `video-studio/scripts/validate-render.ts` output **verbatim** (`{name, pass, detail}`, 6–7 checks). |
| `mechanical_qa.passed == false` | still `status: "done"` (the render itself succeeded; QA failed). `output` is still populated (astra needs the pointer to look at it). astra decides whether to re-call `/v1/render` (its §8 ×3 cap). alchemy does **not** loop. |
| `output.duration_sec` | authoritative final runtime — `ffprobe` on the MP4, timed to the real voiceover via `retimeBeats` (§5.5). |
| `rendered_spec_pointer` | **F3** — an `s3://` pointer to the `video_spec` alchemy **actually rendered** (possibly a `narration_flaw`-updated one). astra signs+fetches it via AL6 (`/v1/artifacts/sign`), no cross-account read. Present on `done`. |
| `error` | **only on `failed`.** §9 code — `render_failed` (retryable — astra re-calls `/v1/render` with a new job), `generation_failed` (the `narration_flaw` regen produced bad output), `model_provider_*` (the regen's model call). |

- **404** for an unknown `render_job_id` (`code: "render_job_not_found"`), or one
  belonging to a different `experience_id` than the JWT `sub`.
- **Poll cadence:** astra's call — the job record's `updated_at` moves as the
  task advances; a ~5–10s poll while `running` is reasonable (render is
  minutes).

---

## 2. The async compute shape (CD-17)

```
astra ──POST /v1/render──▶ alchemy Lambda
                             │  validate + self-check video_spec
                             │  write request.json to S3
                             │  PutItem job record (status: pending)
                             │  ecs:RunTask (render worker, Fargate)
                             ◀── 202 { render_job_id }

           render worker (Fargate task, 4 vCPU / 8 GB, ~15 min task timeout):
             UpdateItem status: running, phase: synthesizing
             read request.json from S3
             loadVideoSpec(video_spec)                              (AL4)
             [narration_flaw only] regenerate the flagged beat      (§7)
             synthesizeAudioPlan(audioPlan)  — cache on narration_hash (§4)
             UpdateItem phase: rendering
             retimeBeats(loaded, measuredAudio)                     (AL4)
             remotion render spec-video --props={spec, measuredAudio}
             ffmpeg poster frame
             upload renders/{id}/cycle-{c}/attempt-{n}.{mp4,poster.png,audio-manifest.json,video_spec.json}
             UpdateItem phase: validating
             validate-render.ts on the MP4
             UpdateItem status: done, mechanical_qa, output, rendered_spec_pointer
           (on any exception: UpdateItem status: failed, error)

astra ──GET /v1/render/{render_job_id}──▶ alchemy Lambda ── reads job record ──▶ 200
```

- The Lambda **never** renders — it only does `RunTask` + job-record I/O
  (well within 29s).
- The Fargate task **has no inbound HTTP** — it reads `request.json`, does the
  work, writes the job record and S3 outputs, exits. No load balancer, no
  service; a one-shot task per render.
- **Task-level timeout** ~15 min (`stopTimeout` + a watchdog in the task that
  self-fails the job record if it's about to be killed, so `GET` shows
  `failed` not a stuck `running`). A CloudWatch alarm on tasks that exit
  non-zero without writing a terminal job record catches the rest.

---

## 3. The job store

**A DynamoDB table `alchemy-render-jobs`** (CD-17 says "even a JSON object in
S3" is acceptable — DynamoDB is barely more and gives conditional writes for
the one-render-per-experience guard).

| Attribute | |
|---|---|
| `render_job_id` (PK) | ULID |
| `experience_id` | GSI PK — for the "already a render in progress?" check |
| `cycle` | int |
| `status` | `pending` \| `running` \| `done` \| `failed` |
| `phase` | `synthesizing` \| `rendering` \| `validating` \| `null` |
| `request_s3_key` | where `request.json` was stashed |
| `mechanical_qa` | JSON, on `done` |
| `output` | JSON `{ s3_pointer, duration_sec, poster_s3_pointer }`, on `done` |
| `rendered_spec_pointer` | on `done` |
| `error` | JSON `{ code, message, retryable }`, on `failed` |
| `created_at`, `updated_at`, `started_at`, `finished_at` | ISO 8601 |
| `ttl` | epoch — DynamoDB TTL, 30 days (a job record older than that is
        uninteresting; the S3 artifacts have their own lifecycle) |

- `POST /v1/render`: `PutItem` with a condition that no
  `pending`/`running` record exists for this `experience_id` (query the GSI, or
  keep a `render-lock:{experience_id}` item). Fail → `409`.
- The Fargate task has `dynamodb:UpdateItem` on this table only.
- `GET`: `GetItem` by `render_job_id`, check `experience_id == sub`.

IaC: a new construct in the AL2 CDK stack — the table + the Fargate task
definition + a `RunTask` permission on the Lambda role + the task role (§9).

### 3.1 Known gap: a job can get stuck at `pending`/`running` forever

Found during the first real end-to-end `/v1/render` verification
(2026-08-31): if the Fargate task fails to progress far enough to write its
own status update — e.g. it crashes before/during startup, or `RunTaskCommand`
returns HTTP 200 with an empty `tasks[]` and a populated `failures[]` (which
`launcher.ts`'s `launch()` currently never inspects — it only reacts to the
SDK call throwing) — nothing else updates the job record. The row sits at
`pending`/`running` indefinitely; a caller polling `GET
/v1/render/{render_job_id}` gets no error and no way to know the job is dead,
until the 30-day TTL eventually reaps the row.

Not fixed here — this needs its own design pass (candidates: a self-timeout
the Lambda enforces on read, e.g. treat a job older than N minutes with no
`started_at`/no progress as failed; a periodic reconciliation sweep against
ECS task state; or the render task registering a heartbeat). Tracked here so
it isn't lost, not scoped or prioritized yet.

---

## 4. `generate-audio.ts` changes + the TTS cache

### 4.1 Refactor

`scripts/generate-audio.ts` today imports a hand-authored `Beat[]` from
`src/data/`. Its core synthesis loop moves to **`src/audio/synthesize.ts`**:

```ts
synthesizeAudioPlan(
  plan: AudioPlanEntry[],          // from AL4's loadVideoSpec
  opts: { workdir; provider; voice; cache }
) -> { manifest: RenderAudioManifest }   // { entries: [{ audioFile, audioPath, durationSeconds }] }
```

`scripts/generate-audio.ts` keeps working for the reference videos — it becomes
a thin wrapper that builds an `AudioPlanEntry[]` from the old `Beat[]` shape and
calls `synthesizeAudioPlan`. No behavior change for `inferenceUnderLoadScript`
etc.

### 4.2 The cache (CD-21)

- **Key = the beat's `narration_hash` straight from the `video_spec`** (AL8
  pinned the formula — no re-hash). `narration_hash` already folds in `voice`
  (AL8 §1.5), so a voice change busts every entry.
- **Store: `s3://aventiqlab-alchemy-content/tts-cache/{narration_hash}.wav`** —
  a new top-level prefix (add to AL7: key layout + a lifecycle rule, "expire
  90 days after last access" — a `narration_hash` that stops appearing in
  specs is dead audio).
- Per beat, in the Fargate task: `HeadObject tts-cache/{hash}.wav` →
  - **hit:** `GetObject` → `<workdir>/audio/<audioFile>.wav`; measure; manifest entry.
  - **miss:** synthesize (§5) → `<workdir>/audio/<audioFile>.wav`; `PutObject`
    to the cache key; measure; manifest entry.
- A cycle-2 re-render that changed only `beat-13` → 1 cache miss, N−1 hits.
- The workdir (Fargate `/tmp`, ~20 GB ephemeral) is scratch, never the source
  of truth.
- **Namespacing:** the cache key is `narration_hash` only. If the TTS *provider*
  ever changes (Chatterbox → a hosted option), use a different prefix
  (`tts-cache-v2/`) rather than colliding — the provider id is not in
  `narration_hash`.

---

## 5. AL9 — the TTS host (APPROVED: Chatterbox v3 CPU in the render container)

`video-studio`'s TTS is **Chatterbox V3** — a local, offline model
(`resemble-ai/chatterbox`), not an API, weights from HuggingFace.

**Decision (approved):** bundle `chatterbox-tts` (CPU torch) into the **render
worker container**:
- The render Dockerfile installs a Python venv with `chatterbox-tts` + CPU
  `torch`, and **pre-pulls the model weights at build time** (`RUN python -c
  "from chatterbox... ; load()"`) so the first render doesn't wait on a
  HuggingFace download. `CHATTERBOX_DEVICE=cpu`.
- `tools/chatterbox/synthesize.py` + the reference voice ship in the image.
- CPU synth ≈ 5–15s per beat. A 24-beat cycle-1 render pays ~2–6 min of TTS
  **once**; the §4 cache makes every re-render ~1 beat.
- Keeps the exact voice (reference + generated videos sound identical),
  `voice.provider: "chatterbox-v3"` stays literally true, no `narration_hash`
  disruption, zero per-use cost, offline.
- **Escape hatch:** `src/audio/TTSProvider.ts` abstracts this. A
  `ReplicateChatterboxProvider` (hosted, same voice) is a provider swap + a key
  if CPU latency is unacceptable — fast-follow, not v1.

Image size: ~3–5 GB (torch + weights). Acceptable for a Fargate task image
(pulled once per task-def revision, cached on the ECS agent).

---

## 6. The render + poster

In the Fargate task, after audio synthesis:

1. `retimeBeats(loadVideoSpec(video_spec), measuredAudio)` (AL4) → final-timed
   `LoadedVideo`.
2. `npx remotion render src/index.ts spec-video <workdir>/out/video.mp4
   --props='{ "spec": <video_spec>, "measuredAudio": <manifest map>,
   "audioPrefix": "audio/" }' --public-dir=<workdir>` — the `spec-video`
   composition's `calculateMetadata` (AL4) sets `durationInFrames`/`fps` from
   the spec. 1920×1080, h264. `--concurrency` = task vCPU.
3. Poster: `ffmpeg -ss <t> -i out/video.mp4 -vframes 1 out/poster.png`, `t` =
   start of the first non-`title` beat (or a fixed 3s). 1920×1080 PNG.
4. Upload `renders/{experience_id}/cycle-{cycle}/attempt-{attempt}.{mp4,
   poster.png,audio-manifest.json,video_spec.json}` (AL7 `grantRendersWrite`).
   `attempt` = alchemy's internal mechanical-QA retry counter within a cycle
   (§7), starts at 1.

`ffmpeg` is in the render image alongside Chromium (Remotion bundles its own
Chromium via `@remotion/renderer`; `ffmpeg`/`ffprobe` come from the
`@remotion/compositor-*` package `validate-render.ts` already locates, or an
`apt-get install ffmpeg`).

---

## 7. `validate-render.ts` wiring

Run `video-studio/scripts/validate-render.ts` on `out/video.mp4`. It already
emits the §7.5 shape (`{ name, pass, detail }`, 6–7 checks).

- One adaptation: today it `import()`s a `src/data/<name>.ts` for the expected
  total + beat windows. Add a **`--beats <loaded-video.json>`** mode that reads
  a JSON dump of the retimed `LoadedVideo` (which the task already has) instead
  of `--data <dataFileName>`.
- Return `mechanical_qa` **verbatim** — no re-slug, no re-count.
- `passed == false` → job `status: "done"`, `mechanical_qa.passed: false`,
  `output` still populated. astra owns the retry (§8 ×3). alchemy does **not**
  loop.
- alchemy's *internal* one-shot retry: a **transient** check failure (corrupt
  frame, ffmpeg hiccup) → retry the render once, bump `attempt`. A
  **structural** failure (duration way off, missing beat audio) → return
  immediately. Keep minimal.

---

## 8. Promote-to-produced (CD-18)

New endpoint **`POST /v1/artifacts/promote`** — on the AL2 Lambda, behind
`requireServiceAuth`, `sub == experience_id`.

**Request:**

```json
{ "experience_id": "cexp_01J9Z8...", "cycle": 2 }
```

**Response `200`:**

```json
{
  "produced": {
    "s3_pointer": "s3://aventiqlab-alchemy-content/produced/cexp_01J9Z8.../video.mp4",
    "poster_s3_pointer": "s3://.../produced/cexp_01J9Z8.../video.poster.png"
  }
}
```

- alchemy resolves the winning render for `(experience_id, cycle)` — the
  highest `attempt-N` under `renders/{experience_id}/cycle-{cycle}/` (or the
  one the job store recorded as `done` for that cycle).
- `HeadObject` the source `.mp4` + `.poster.png` (must exist, must be under
  `renders/{experience_id}/`). Missing → `validation_failed` (a missing render
  is a bug — matches AL6's CD-7 "missing `produced/` isn't an expiry" logic).
- `CopyObject` → `produced/{experience_id}/video.mp4` + `video.poster.png`
  (AL7 `grantPromoteToProduced`).
- **Idempotent** — promoting the same cycle twice is a no-op `200`.
- astra calls this from `MarkProduced`, before writing `pipeline_runs.status =
  produced` (F2 confirmed).
- The AL6 signed-URL flow then serves `produced/{id}/video.mp4` for the catalog
  — a stable key, cycle-independent.

---

## 9. `vision_qa_feedback` handling (cycle > 1)

A pure function `planReRender(cycle, feedback, spec) -> { regenBeatIds:
string[], reuseAllAudio: bool, tailBufferBumpSec: number }`:

| `category` | Plan (CD-20) |
|---|---|
| `null` (cycle 1) | `{ regenBeatIds: [], reuseAllAudio: false, tailBufferBumpSec: 0 }` — synth everything (cache still helps if a `narration_hash` already exists from a prior experience). |
| `layout_bug` | `{ [], reuseAllAudio: true, 0 }` — the `video_spec` arrived **already edited by astra** (CD-20). alchemy renders it with the cached audio (narration unchanged). |
| `pacing_issue` | `{ [], reuseAllAudio: true, tailBufferBumpSec: 1.5 }` — astra may have edited `target_duration_sec`s; alchemy also adds a tail-buffer bump in `retimeBeats` so on-screen content doesn't outlast narration. Cached audio reused. |
| `narration_flaw` | `{ regenBeatIds: [evidence.beat_id], reuseAllAudio: false, 0 }` — regenerate **just that beat's** `narration` (a single-beat OpenRouter call reusing AL3's path: prompt = "rewrite this beat's narration to fix: `<reason>`", context = the beat's `on_screen`/`visual` + the rest of the spec for continuity). Recompute that beat's `narration_hash` → cache miss → resynth its one wav → `retimeBeats` (its duration changed) → re-render. Every other beat: cache hit, untouched. The updated spec is what gets written to `renders/{id}/cycle-{c}/attempt-{n}.video_spec.json` and pointed at by `rendered_spec_pointer` (F3). |
| `content_flaw` | never arrives — astra escalates (§8, 0 retries). If received → `validation_failed` ("content_flaw is not a re-renderable category"). |

---

## 10. The render compute's IAM

**Lambda role** (additions to AL2):
- `ecs:RunTask` on the render task definition + `iam:PassRole` for the task
  role + execution role.
- `dynamodb:PutItem` / `GetItem` / `Query` (GSI) on `alchemy-render-jobs`.
- `s3:PutObject` on `renders/*` (stash `request.json`).

**Fargate task role** (new):
| Grant | Source | For |
|---|---|---|
| `s3:PutObject` on `renders/*` | AL7 `grantRendersWrite` | MP4/poster/manifest/spec per cycle |
| `s3:GetObject` on `renders/*` | AL7 `grantPromoteToProduced` (read half) | read `request.json`, re-read prior attempts |
| `s3:GetObject` + `PutObject` on `tts-cache/*` | **new** AL7 `grantTtsCache` | the §4 audio cache |
| `dynamodb:UpdateItem` on `alchemy-render-jobs` | new | job-record progress + terminal state |
| `secretsmanager:GetSecretValue` on `alchemy/service-secrets` | AL2 | `OPENROUTER_API_KEY` (the `narration_flaw` regen) |
| CloudWatch Logs | default | task logs |

**`/v1/artifacts/promote`** runs on the Lambda — it needs
`grantPromoteToProduced` (both halves: read `renders/*`, write `produced/*`).
The AL6 Lambda already has `grantReadForPresign` (covers the read); add the
`produced/*` write.

No GPU, no `bedrock:*`, no cross-account anything.

---

## 11. Test strategy

**Cannot run in CI:** a real Remotion render (headless Chromium, minutes),
Chatterbox synthesis (torch, weights), a `RunTask` against real ECS.

**Mockable / unit-tested (the bulk of the logic):**
- `POST /v1/render` — request validation, `sub` check, `video_spec` schema +
  AL3 self-check reuse, the one-render-per-experience `409` guard, the `202`
  shape. `ecs:RunTask` and DynamoDB mocked → assert the job record written +
  `RunTask` params.
- `GET /v1/render/{job_id}` — each of `pending` / `running` / `done` / `failed`
  job records → the right response shape; unknown id → `404`; wrong `sub` →
  `404`.
- **`planReRender`** (§9) — pure function, exhaustive: every `category`,
  `narration_flaw` with `evidence.beat_id`, `content_flaw` → `validation_failed`.
- **the cache key logic** — given a `video_spec` + a prior manifest, which
  beats are hits vs misses on `narration_hash`.
- **`validate-render.ts` parsing** — canned `ffprobe` JSON + a manifest →
  assert the `{name, pass, detail}` array + `passed`.
- **`POST /v1/artifacts/promote`** — mock S3, assert `CopyObject` source/dest
  keys, idempotency, missing-source → `validation_failed`.
- **the single-beat `narration_flaw` regen** — mock OpenRouter (like AL3),
  assert only the flagged beat's `narration`/`narration_hash` change and it
  becomes a cache miss.
- the **job-store transitions** — a fake store, assert `pending → running →
  done`/`failed` and that a watchdog-triggered `failed` is terminal.

**Needs a real render (local/manual smoke, documented, not CI):**
- `npm run render:spec -- <path-to-video_spec.json>` on a dev machine with the
  Chatterbox venv → MP4 → `validate-render.ts` passes. A `docs/` runbook.
- Optionally a **manual-dispatch GitHub Actions job** on a large runner
  (Chromium installable, Chatterbox CPU slow but bounded) — opt-in, not on
  every PR.

---

## 12. Summary

| Decision | Value |
|---|---|
| Async shape (CD-17) | API on Lambda; `POST /v1/render` → `202 { render_job_id }`; `GET /v1/render/{id}` polls. Render runs in a one-shot **Fargate task** (4 vCPU / 8 GB, ~15 min). |
| Job store | DynamoDB `alchemy-render-jobs` (ULID PK, `experience_id` GSI for the one-at-a-time guard, 30-day TTL). |
| `done` response | `mechanical_qa` (verbatim `validate-render.ts`), `output` (`s3_pointer`, `duration_sec`, `poster_s3_pointer`), **`rendered_spec_pointer`** (F3 — astra signs+fetches via AL6). |
| TTS (AL9) | Chatterbox v3 **CPU in the render container**, weights pre-pulled at build. `TTSProvider` = the escape hatch. |
| TTS cache (CD-21) | `s3://…/tts-cache/{narration_hash}.wav`, 90-day-no-access lifecycle. New AL7 prefix + `grantTtsCache`. |
| Promote (CD-18) | new `POST /v1/artifacts/promote { experience_id, cycle }` on the Lambda; `CopyObject` winning render → `produced/`; idempotent; astra calls it from `MarkProduced`. |
| Vision-QA routing (CD-20) | `layout_bug`/`pacing_issue`: astra edits the spec, alchemy renders it (+ a `pacing_issue` tail-buffer bump). `narration_flaw`: alchemy regenerates the one flagged beat. `content_flaw`: never arrives. |
| `generate-audio.ts` | core loop → `src/audio/synthesize.ts` `synthesizeAudioPlan(audioPlan)`; the script stays a thin wrapper for the reference videos. |
| `validate-render.ts` | `+ --beats <loaded-video.json>` mode. |
| Mechanical-QA retry | astra owns the §8 ×3; alchemy reports `passed: false` and does not loop (one internal retry only for a transient failure). |

**Open (awaiting astra's A11 + the coordinator closing F1/F3):**
- F1: the coordinator chose async 202+poll — resolved, folded in.
- F3: `rendered_spec_pointer` in the `done` response, astra signs+fetches via
  AL6 — folded in, awaiting astra's confirmation of that mechanism.
- Nothing else blocks the AL5 build once astra's A11 lands.

**AL5 is alchemy's last Phase 2 task.** After it builds (+ merges of PRs #1–#7
and this), alchemy's side of the Content Studio pipeline is code-complete
pending a deploy (separate, later, per-repo deploy roles unprovisioned).
