# AL3 — `POST /v1/generate` (design/plan)

Phase 2 task AL3 (see `aventiqlab-platform/docs/content-studio-phase2-tracker.md`).
Authorized by [ADR-0001](adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md);
sits on the service foundation from
[AL2](content-studio-service-foundation-plan.md).

**Status: PLAN — not yet built.** Contract references: v1.3 §7.1–7.3, §5.5, §5.4,
§9. This is alchemy's **first live model integration** (AL1's ADR un-defers it).

---

## 0. Dependencies (call these out first)

| Depends on | What's blocked | Can plan now? |
|---|---|---|
| **AL2 build** (service foundation) | the route, the auth hook, the error envelope, config/secret loading | Yes — AL2 plan approved; AL3 assumes its shapes |
| **AL7** (the S3 render/generated bucket + lifecycle) | the response `s3_pointer` — AL3 can't write generated content anywhere until the bucket exists | Partly — can spec the key layout + write path; can't wire it |
| **AL8** (the `video/v1` per-beat schema — joint design with astra) | the `content` shape for `artifact_type: "video"` specifically — the per-beat visual props `/v1/render` needs | **No** for video `content` internals; **yes** for the 4 non-video types and the video envelope/`script_outline`/`on_screen_demonstrations` |
| **AL10-adjacent** (secret value exchange with astra) | a real end-to-end authed call from astra | Yes — AL3 uses the AL2 loading path |
| **`OPENROUTER_API_KEY`** provisioning (new — §3) | the actual model call | Yes — plan the config seam; value comes later |

---

## 1. Request / response shapes (locked to contract §7.1 / §7.2)

### Request — `POST /v1/generate` (astra → alchemy)

```json
{
  "experience_id": "cexp_01J9Z8...",
  "artifact_type": "quiz",
  "attempt": 2,
  "learning_context": { "...": "the confirmed §5.4 Learning IR object" },
  "prior_error": "schema error: capability_refs[2] unresolved"
}
```

| Field | Req? | Type | Notes |
|---|---|---|---|
| `experience_id` | yes | string | astra's opaque run id (`cexp_<ulid>`), **not** an `exp-*` slug. Used only for the `s3_pointer` path + logging. |
| `artifact_type` | yes | `artifact_type` (§3.1) | one of `material \| video \| source_code_lab \| quiz \| skill_evaluator`. `battleground` → `unsupported_type`. |
| `attempt` | yes | int ≥ 1 | astra's retry counter. alchemy echoes it into the `s3_pointer` (`attempt-N.json`). alchemy does **not** loop — one call = one attempt. |
| `learning_context` | yes | object | the full widened §5.4 object (`schema_version: "learning-ir/v1"`). Carries `scenario`, `technical_environment`, `expected_decisions`, `trade_offs`, `learning_outcomes[]`, `target_capabilities[]`, etc. |
| `prior_error` | no | string \| null | present on `attempt > 1` — the exact validator/cross-check error astra got. Fed into the prompt so the model corrects it. |

### Response — `200` (alchemy → astra)

```json
{
  "artifact_type": "quiz",
  "schema_version": "quiz/v1",
  "content": { "...": "the full deliverable — §7.3 shape for this type" },
  "preview": { "...": "the §5.5 preview shape for this type" },
  "s3_pointer": "s3://aventiqlab-alchemy-content/generated/cexp_01J9Z8.../quiz/attempt-2.json"
}
```

| Field | Type | Notes |
|---|---|---|
| `artifact_type` | echoes the request | |
| `schema_version` | §3.8 tag — `material/v1 \| video/v1 \| source-code-lab/v1 \| quiz/v1 \| skill-evaluator/v1` | astra owns these tags; alchemy emits the matching one |
| `content` | object | the **full** generated artifact — §7.3 per-type shape below. NOT the `artifact-spec` `type_specific` summary. |
| `preview` | object | the §5.5 per-type subset astra shows at Gate 1 |
| `s3_pointer` | string | `s3://<bucket>/generated/<experience_id>/<artifact_type>/attempt-<N>.json` — alchemy writes `content` (or the whole response) there before returning. **Blocked on AL7.** |

### Contract-shape ambiguities hit (need platform/astra clarification)

1. **`s3_pointer` — what exactly is stored at that key?** §7.2 shows `attempt-2.json`.
   Is it just `content`, or the whole response envelope (`content` + `preview` +
   metadata)? Recommend: the whole envelope, so astra's re-prompt history and the
   Gate-1 preview are both recoverable from S3 without re-deriving. Needs a one-line
   confirmation in the contract.
2. **Does alchemy write S3 on a failed generation?** If the model returns
   unparseable output and alchemy raises `generation_failed`, is there an
   `attempt-N.json` with the raw failure for astra's escalation history, or
   nothing? Recommend: write an `attempt-N.error.json` with the raw model output +
   the parse error, so `schema_cap_exceeded` escalations have a full trail. Not in
   the contract today.
3. **`learning_context` trust boundary.** §6.1 says on Review-Context confirm
   "astra takes it as authoritative and does not re-reason" — so the
   `learning_context` alchemy receives may contain **instructor free-text edits**.
   AL3 treats every string field in it as untrusted content for prompt-assembly
   purposes (§3.4 prompt-injection note). Contract doesn't say this explicitly;
   worth a note.
4. **`schema_version` on the request?** §7.1 request has no `schema_version` for
   `learning_context`, but §5.4 says the object carries
   `schema_version: "learning-ir/v1"` internally. AL3 will read it from the object
   and reject a version it doesn't recognize (`validation_failed`). Confirm that's
   the intended place for it.
5. **`video` `content` vs `/v1/render` `video_spec`.** §7.3 says the video `content`
   "is the video spec `/v1/render` consumes (§7.4)". So `/v1/generate` for video
   produces exactly what AL5's `/v1/render` takes as `video_spec`. That coupling
   is clean but means **AL3's video `content` shape == AL8's output** — AL3 can't
   finalize it. See §2 (video) and §0.

---

## 2. `content` shape per artifact type (§7.3)

Each is the **full deliverable**, matching the real `experience-catalog/<exp>/content/`
files. Verified against `exp-inference-under-load`'s content.

### `material` — `schema_version: "material/v1"`

```jsonc
{
  "title": "GPU Inference Capacity & Autoscaling Signals",
  "format": "article",                       // "article" | "diagram-walkthrough" | "reference-doc"
  "reading_time_minutes": 20,
  "key_sections": ["GPU utilization signals", "Kubernetes autoscaling primitives",
                   "GPU service quotas", "Dynamic batching", "Summary"],
  "body_markdown": "# GPU Inference Capacity...\n\n## 1. GPU utilization signals...",
  "sections": [                              // structured mirror of body_markdown, optional
    { "heading": "GPU utilization signals", "level": 2, "body_markdown": "..." }
  ]
}
```

- Maps to the real `content/material.md` — a `##`-sectioned Markdown doc, ~20 min
  read. `format`/`reading_time_minutes`/`key_sections` come from the artifact-spec
  `type_specific`; `body_markdown` is the new generated deliverable.
- `sections[]` is a convenience decomposition for renderers that want per-section
  handling; `body_markdown` is authoritative. Generator emits both.
- No alchemy schema for the *body* exists (Phase 0 only schema'd the spec) — the
  self-check (§4) validates `format` ∈ enum, `key_sections` non-empty, and
  `body_markdown` parses as Markdown with headings matching `key_sections`.

### `video` — `schema_version: "video/v1"` — **PARTIALLY BLOCKED ON AL8**

What AL3 **can** spec now (the envelope):

```jsonc
{
  "title": "Why Pod Autoscaling Can Still Leave You Stuck",
  "format": "animated-explainer",            // "screencast" | "talking-head" | "animated-explainer"
  "estimated_duration_minutes": 6,
  "script_outline": [                        // FLAT string[] for v1 (OQ-5 resolved)
    "Problem: a GPU inference service's users see slow responses despite pods scaling.",
    "Stakes: queue -> latency -> timeouts -> user-visible failure, against a paid-tier SLA.",
    "..."
  ],
  "on_screen_demonstrations": [              // required in the artifact-spec video branch
    "Single-sentence statement cards, color-coded by stage",
    "Animated architecture diagram with per-beat component highlighting",
    "..."
  ],
  "central_question": "Why can pod autoscaling still fail when a GPU workload needs additional node capacity?",
  "beats": [ /* <<< AL8 territory — see below */ ]
}
```

What is **BLOCKED ON AL8** (the `video/v1` per-beat schema, joint design with astra):

- The `beats[]` array — each beat's `type` (a rendering concern:
  `statement|architecture|investigation|optionsCompare|dashboard|terminal|recap|title`),
  its narration `caption`, its `start`/`duration` (timed to synthesized audio, so
  these may be placeholders `/v1/generate` emits and `/v1/render` finalizes), and
  its **type-specific visual props** — architecture node layout, investigation
  keyframe timeline, terminal lines, dashboard panels, comparison options.
- Whether `/v1/generate` emits real timing or `/v1/render` owns all timing (the
  render times to the voiceover — see §5.5 "final `render.output.duration_sec` is
  authoritative"). Leaning: `/v1/generate` emits `caption` + `type` + visual props
  + an *estimated* duration; `/v1/render` synthesizes audio and rewrites
  `start`/`duration`.
- The exact prop schema per beat `type` — this is `docs/video-artifact-constitution.md`
  §B `video-narrative.schema.json` **plus** per-beat visual props, and per contract
  §3.8 it's designed jointly with astra during Phase 2.

**AL3 recommendation:** AL3 builds the 4 non-video types end-to-end. Video
generation lands after AL8 fixes the `beats[]` schema. AL3's video path is a stub
that returns `unsupported_type` (or a `501`-style `not_configured`) until AL8 —
OR AL3 and AL8 are sequenced so AL8 completes first. Flag for the coordinator.

### `source_code_lab` — `schema_version: "source-code-lab/v1"`

```jsonc
{
  "title": "Build the Mitigation and Overflow-Capacity Configuration",
  "repo_or_starter_ref": "lab-starters/exp-inference-under-load",
  "environment_requirements": ["kind or a sandbox EKS cluster with KEDA", "kubectl", "Terraform CLI >= 1.5"],
  "hints_available": true,
  "tasks": [
    {
      "id": "task-1",
      "title": "Complete the KEDA ScaledObject",
      "instructions_markdown": "Open `keda-scaledobject.yaml`. It has three `# TODO` gaps...",
      "completion_bar": "kubectl get scaledobject ... shows READY: True",
      "hints": ["Level 1: the Prometheus query needs to select the queue-depth metric...",
                "Level 2: ...", "Level 3: ..."],
      "solution_files": [
        { "path": "keda-scaledobject.solution.yaml", "contents": "apiVersion: keda.sh/v1alpha1\n..." }
      ]
    }
  ],
  "starter_file_tree": [
    { "path": "keda-scaledobject.yaml", "contents": "apiVersion: keda.sh/v1alpha1\n# TODO ...", "is_todo_stub": true },
    { "path": "rate-limit-policy.yaml", "contents": "...", "is_todo_stub": true },
    { "path": "terraform/gpu-overflow-node-pool/main.tf", "contents": "...", "is_todo_stub": true },
    { "path": "terraform/gpu-overflow-node-pool/variables.tf", "contents": "..." },
    { "path": "README.md", "contents": "# Lab — Build the Mitigation..." },
    { "path": "hints.md", "contents": "..." }
  ]
}
```

- Mirrors the real `content/lab/` tree exactly: starter stub files with `# TODO`
  blocks, `*.solution.*` counterparts, a `terraform/` subtree, `README.md`,
  `hints.md` with progressive levels.
- `repo_or_starter_ref` is load-bearing (`lab-starters/<exp>`) — matches
  `art-inference-under-load-lab.yaml`.
- The generator produces: task instructions, the starter stubs (working config
  with gaps), the solution files, and progressive hints. This is the most
  code-generation-heavy type — see §3.4.

### `quiz` — `schema_version: "quiz/v1"` — matches `content/quiz.yaml` **exactly**

```jsonc
{
  "artifact_ref": "art-inference-under-load-quiz",     // optional in the generated form
  "passing_threshold_percent": 80,
  "question_types": ["multiple-choice", "scenario-judgment"],
  "questions": [
    {
      "id": "q1",
      "type": "multiple-choice",                       // "multiple-choice" | "scenario-judgment" | "ordering" | "short-answer"
      "material_section": "GPU utilization signals",
      "prompt": "A service reports GPU (compute) utilization at 95% while GPU memory utilization stays flat. What does this most likely indicate?",
      "options": { "a": "A memory leak", "b": "A compute-bound workload", "c": "A network bottleneck", "d": "An autoscaler misconfiguration" },
      "correct": "b",
      "explanation": "Rising compute utilization with flat memory is the classic compute-saturation signature..."
    }
    // ordering / short-answer questions carry "answer" or "ordering" instead of "options"/"correct"
  ]
}
```

- **`options` is a letter-keyed map** (`{"a": "...", "b": "..."}`), **`correct` is
  the letter** (`"b"`). Verified against `content/quiz.yaml`.
- `question_count` / `passing_threshold_percent` / `question_types` come from the
  artifact-spec `type_specific`; the generator produces `questions[]` grounded in
  the `material` content (`material_section` cross-links each question to a
  material heading).
- `ordering`/`short-answer`: `options`/`correct` absent, `answer` (string) or
  `ordering` (ordered array) present instead.

### `skill_evaluator` — `schema_version: "skill-evaluator/v1"` — full `skill-evaluator.schema.json`

All **15 required fields** (verified against `schemas/skill-evaluator.schema.json`):
`id`, `experience_ref`, `skills_evaluated` (`cap-*[]`, minItems 1), `scenario`,
`opening_question`, `expected_reasoning_areas` (string[]),
`follow_up_question_paths` (`[{trigger, follow_up_question, targets_reasoning_area}]`),
`misconception_indicators` (`[{misconception, likely_root_cause, corrective_follow_up}]`),
`strong_answer_indicators` (string[]), `weak_answer_indicators` (string[]),
`evidence_criteria` (string[]),
`scoring_dimensions` (`[{dimension ∈ evaluation_dimension, description, weight_percent int 1–100}]`),
`proficiency_levels` (`[{level ∈ proficiency_level, description, criteria: string[]}]`),
`pass_conditions` (`{minimum_level ∈ proficiency_level, required_dimensions: evaluation_dimension[]}`),
`escalation_rules` (`[{condition, action}]`).

- Verified shape against `skill-evaluator/instances/se-inference-under-load.yaml`.
- `weight_percent` values across `scoring_dimensions` should sum to 100 — the
  self-check (§4) verifies this (the schema doesn't).
- The generator builds `follow_up_question_paths` and `misconception_indicators`
  from the `learning_context`'s `expected_decisions[].options_considered` and
  `failure_modes` — same source the reference instance visibly uses.

---

## 3. The model call (alchemy's first live model integration)

### 3.1 Provider — OpenRouter

**Decision: OpenRouter**, matching the rest of the ecosystem. astra's Reasoning
Lambda and Vision QA judge both call OpenRouter (contract §1, §8; the contract's
error codes `model_provider_unavailable` / `model_provider_quota_exceeded` are
literally named for OpenRouter incidents — `aventiqlab-integration.md` §History).
Using the same gateway means: one provider account to manage, the same
model-traceability story (record the model id on every generation — mirrors the
contract's `vision_qa.model` field), and error semantics that already line up with
§9.

- **SDK:** OpenRouter is OpenAI-API-compatible, so the `openai` npm package
  pointed at `https://openrouter.ai/api/v1` (base URL override), or a thin `fetch`
  wrapper. Leaning: `openai` package — structured-output helpers, streaming if
  needed later, well-typed.
- **Config seam (AL2 `config.ts` pattern):** `OPENROUTER_API_KEY` via env →
  Secrets Manager (`alchemy/service-secrets`, new key). `OPENROUTER_MODEL_*` per
  artifact type (env-overridable model ids, so we can tune per type without a
  redeploy). Fail closed if the key is missing → `not_configured`.
- **Model choice:** a strong instruction-following model for content generation;
  the exact id is config, not code. Recorded in the response metadata / S3 for
  traceability.

### 3.2 No retry loop in alchemy

Contract §7.1, §8: **astra drives retries** (per-artifact schema + capability
cross-check ×4). alchemy does exactly one model call per `/v1/generate` request
(plus internal structured-output reparse attempts — see §3.3 — which are a
single-request concern, not the astra retry loop). On failure alchemy returns the
§9 error and astra decides whether to re-call with `attempt+1`.

### 3.3 Structured output

- Use OpenRouter/OpenAI **JSON mode / response_format** with a JSON Schema per
  artifact type where the model supports it; fall back to "return only JSON"
  prompting + parse.
- On a parse failure: **one** local reparse attempt (re-ask the model to fix its
  JSON, within the same `/v1/generate` request), then `malformed_model_response`
  (retryable — astra re-calls).
- The per-type JSON Schema handed to the model is derived from
  `schemas/*.json` + the §7.3 shapes above (they're close but not identical — the
  Phase 0 schemas cover the *spec*, §7.3 covers the *deliverable*; AL3 maintains
  the deliverable schemas in `service/src/generate/schemas/`).

### 3.4 Prompt construction per type

Common structure (all types):

1. **System prompt** — role ("you generate one <type> learning artifact"), the
   AventiqLab pedagogical rules relevant to the type, the hard requirement to
   output only valid JSON matching the provided schema, and the anti-duplication
   rule (each artifact must provide what the others don't — from
   `artifact-model/README.md`).
2. **Context block** — the `learning_context` (§5.4), rendered as structured
   text: `scenario`, `learner_mission`, `technical_environment`,
   `learning_outcomes[]`, `target_capabilities[]` (with names), `expected_investigation`,
   `expected_decisions[]`, `trade_offs[]`, `constraints`, `failure_modes`,
   `success_conditions`. **Treated as untrusted** (may contain instructor
   free-text edits) — wrapped in explicit delimiters, never interpolated as
   instructions.
3. **Type-specific instructions** (below).
4. **On retry (`attempt > 1`):** append `prior_error` verbatim with "your previous
   output was rejected for this reason; fix exactly this and regenerate."

Per type:

| Type | Prompt emphasis | Grounding source in `learning_context` |
|---|---|---|
| `material` | KNOW/UNDERSTAND reference doc, not a story; `##` sections matching `key_sections`; ~`reading_time_minutes` of prose; no narrative | `learning_outcomes`, `target_capabilities`, `technical_environment`, `core_concept` |
| `video` | *(blocked on AL8 for `beats[]`)* — the constitution's reasoning spine (Problem→Curiosity→…→Best Practice), flat `script_outline`, technology emerges as the answer | `mental_model`, `expected_decisions`, `trade_offs`, `learner_problem` |
| `source_code_lab` | untimed BUILD practice; working starter configs with `# TODO` gaps + `*.solution.*` + progressive hints; tasks map to `build_activities` | `build_activities`, `expected_decisions`, `technical_environment`, `constraints` |
| `quiz` | tests KNOW/UNDERSTAND from the material; letter-keyed options; `scenario-judgment` questions test judgment not recall; `material_section` cross-links | `learning_outcomes`, `expected_decisions[].options_considered` (distractors), the `material` content |
| `skill_evaluator` | conversational reasoning assessment (future ASTRA script), NOT a quiz; 15 fields; `weight_percent` sums to 100; transfer scenario (a variant, not the reference) | `expected_decisions`, `failure_modes`, `success_conditions`, `evidence_of_competence` |

Prompts live in `service/src/generate/prompts/<type>.ts` as versioned templates
(a `prompt_version` string recorded in the response metadata / S3, so a generation
is always traceable to the prompt that produced it).

---

## 4. Self-validation before returning

**Decision: yes, alchemy jsonschema-checks its own `content` before returning it.**

- Contract §7.2 says astra runs the **authoritative** jsonschema + capability
  cross-check and re-prompts on failure. That stays true.
- But alchemy self-checking first: (a) saves a full astra→alchemy round trip when
  the model produces near-miss JSON that alchemy can catch and locally reparse
  (§3.3); (b) lets alchemy attach a precise `generation_failed` reason instead of
  returning junk; (c) is cheap (local jsonschema validation).
- **What alchemy checks:** structural validity against the per-type deliverable
  schema (§3.3), the enum constraints (`format`, `question.type`,
  `scoring_dimensions[].dimension`, `proficiency_levels[].level`), and the
  arithmetic the schema can't (`weight_percent` sums to 100; `key_sections` match
  `body_markdown` headings; every `question.material_section` exists in the
  material).
- **What alchemy does NOT check:** capability-ref resolution against
  `capability-map/` (astra owns the capability cross-check — it has the resolution
  context and the `context.target_capabilities[].resolved` flags), and pedagogical
  quality (astra's Reasoning + the human gates own that).
- On self-check failure after the one reparse: return `generation_failed`
  (retryable) with the validation error as the message. astra re-calls with
  `attempt+1` and its own error text.

---

## 5. S3 write — **BLOCKED ON AL7**

- Response `s3_pointer` =
  `s3://<bucket>/generated/<experience_id>/<artifact_type>/attempt-<N>.json`.
- Bucket: `aventiqlab-alchemy-content` (or as AL7 names it), alchemy's account
  (`880636108741`), `ap-south-1`.
- What AL3 can spec now: the key layout, the write-before-return ordering (write
  succeeds → return; write fails → `internal_error`, astra retries the whole
  call), and the IAM permission the service Lambda needs (`s3:PutObject` on
  `generated/*` in that one bucket).
- What's blocked: the bucket, its KMS key, the lifecycle policy (only
  `generated/attempt-N` scratch expires; per OQ-4 + ADR-0001 the *final produced*
  artifacts are durable — but note `/v1/generate` only writes scratch
  `attempt-N.json`; the durable produced copy is astra's concern after Gate 1).
- **AL3 build sequencing:** either AL7 lands first, or AL3 ships with the S3 write
  behind a feature flag (returns a `s3_pointer` of `null` + the `content` inline
  until the bucket exists). Contract §7.2 shows `s3_pointer` as always-present, so
  AL7-first is cleaner. Flag for the coordinator.

---

## 6. `preview` shape per type (§5.5) — the Gate-1 subset

The generator produces `preview` alongside `content` (either as a second model
ask, or — cheaper — derived programmatically from `content`). Derived-from-content
is the plan: no extra model call, guaranteed consistency.

| Type | `preview` |
|---|---|
| `material` | `{ title, format, reading_time_minutes, key_sections: string[], excerpt: string }` — `excerpt` = first ~40 words of `body_markdown` |
| `video` | `{ title, format, estimated_duration_minutes, script_outline: string[] }` — flat `string[]` (OQ-5) |
| `source_code_lab` | `{ title, repo_or_starter_ref, environment_requirements: string[], tasks: string[], hints_available: bool }` — `tasks` = the task titles only |
| `quiz` | `{ question_count, question_types: string[], passing_threshold_percent, sample: { id, type, prompt, options: {letter: string}, correct: string, explanation } }` — `sample` = `questions[0]` |
| `skill_evaluator` | `{ scenario, opening_question, skills_evaluated: string[], scoring_dimensions: [{dimension, description, weight_percent}], pass_conditions: { minimum_level, required_dimensions: string[] } }` |

---

## 7. Error cases → §9 envelope

| Condition | `code` | HTTP | `retryable` |
|---|---|---|---|
| bad/expired/wrong-`aud` JWT | `unauthorized` | 401 | false |
| request body fails schema (missing `artifact_type`, bad `attempt`, `learning_context` not `learning-ir/v1`) | `validation_failed` | 422 | false |
| `artifact_type: "battleground"` (or any non-v1 type) | `unsupported_type` | 422 | false |
| model returned output that fails self-check after one reparse | `generation_failed` | 502 | **true** |
| model returned unparseable JSON after one reparse | `malformed_model_response` | 502 | **true** |
| OpenRouter transient outage / 5xx | `model_provider_unavailable` | 503 | **true** |
| OpenRouter call timed out | `model_provider_timeout` | 504 | **true** |
| OpenRouter account out of credits/quota | `model_provider_quota_exceeded` | 503 | **false** |
| `OPENROUTER_API_KEY` / model config missing | `not_configured` | 500 | false |
| S3 write failed (once AL7 lands) | `internal_error` | 500 | false (astra retries the call) |
| unhandled exception | `internal_error` | 500 | false |

- `video` before AL8: `unsupported_type` with a message naming AL8 as the blocker
  (or AL8 sequenced first — coordinator's call, §2 video).
- alchemy never distinguishes OpenRouter's own error text to astra — generic
  message, correct `code` + `retryable` (matches astra's assessment-engine
  behavior, `aventiqlab-integration.md`).

---

## 8. File layout (within AL2's `service/`)

```
service/src/generate/
  route.ts                 # POST /v1/generate — auth, body validation, dispatch, S3 write, response
  dispatch.ts              # artifact_type -> generator
  openrouter.ts            # the model client (base-url override, JSON mode, one reparse, error mapping)
  context.ts               # render learning_context (§5.4) into the prompt's context block (untrusted-wrapped)
  selfcheck.ts             # jsonschema + arithmetic checks (§4)
  s3.ts                    # write attempt-N.json (blocked on AL7 — flag-guarded)
  prompts/
    material.ts  video.ts  source-code-lab.ts  quiz.ts  skill-evaluator.ts
  schemas/                 # per-type DELIVERABLE json schemas (§3.3) — distinct from repo /schemas/*.json
    material.v1.json  video.v1.json  source-code-lab.v1.json  quiz.v1.json  skill-evaluator.v1.json
  preview.ts               # derive preview from content (§6)
  __tests__/
```

---

## 9. Summary of dependencies & ambiguities (for the coordinator)

**Hard dependencies:**
- **AL2 build** — the service, auth, error envelope must exist first.
- **AL7 (S3 bucket)** — `s3_pointer` can't be produced. Recommend AL7 before AL3
  build, or AL3 ships flag-guarded with `s3_pointer: null`.
- **AL8 (`video/v1` per-beat schema)** — video `content.beats[]` can't be
  finalized. Recommend AL8 sequenced **before** AL3's video path, OR AL3 ships the
  4 non-video types and video follows. The other 4 types are fully specifiable now.
- **New secret `OPENROUTER_API_KEY`** — provisioning + value. Config seam planned;
  value is an ops task alongside the AL10-adjacent `ALCHEMY_SERVICE_JWT_SECRET`
  exchange.

**Contract-shape ambiguities to resolve (§1):**
1. What's stored at `s3_pointer` — `content` only, or the full response envelope? (recommend: full envelope)
2. Is there an S3 artifact on a *failed* generation for astra's escalation trail? (recommend: yes, `attempt-N.error.json`)
3. Is the `learning_context` explicitly untrusted (instructor free-text edits via §6.1)? (recommend: contract note; AL3 treats it as untrusted regardless)
4. Where does `learning-ir/v1` version live — request field or inside the object? (AL3 reads it from the object)
5. Confirm video `content` == AL5 `video_spec` == AL8 output (the three are the same artifact) — this coupling drives the AL3/AL8 sequencing question.

**Decisions AL3 makes (for review):**
- Provider: **OpenRouter** (ecosystem consistency), `openai` npm SDK with base-URL override.
- alchemy **does** self-validate `content` before returning (structural + arithmetic only; not capability-refs, not quality).
- `preview` is **derived from `content`** programmatically, not a second model call.
- One local reparse on malformed JSON; **no** astra-style retry loop in alchemy.
- Prompts are versioned templates; `prompt_version` + model id recorded per generation for traceability.
