# Experience Catalog

The Experience is the primary object in AventiqLab's learning architecture — not a topic, not a course. Each subdirectory here is one experience, schema: [`/schemas/experience.schema.json`](../schemas/experience.schema.json).

## Status

- **`exp-inference-under-load`** and **`exp-deploy-inference-service`** are **fully-specified**: each has a complete `experience.yaml`, `outcomes/`, all 5 `artifacts/` specs, and real produced content under `content/` (Material, Lab, Quiz all with genuine text/code; Video as a finished script; Skill Evaluator as its complete source-of-truth instance). `exp-deploy-inference-service`'s video stops at the script — it has no Remotion composition or rendered `.mp4` yet, unlike `exp-inference-under-load`'s.
- The other **17 experiences** are **blueprint-only**: a complete, schema-valid `experience.yaml` (scenario, starting state, decisions, tradeoffs, success conditions — everything a content author needs to build outcomes and artifacts from) but no `outcomes/` or `artifacts/` yet, and `outcome_refs: []`. Building those out is Phase 1+ work, using either fully-specified experience as the template.

## Why 19

The brief asked for 10–15 candidate experiences spanning the capability map so the model could be proven against more than one hand-picked scenario before committing to it as the pattern. Four more were added afterward to close gaps identified against an external 42-day curriculum: `exp-build-measured-retrieval-pipeline` and `exp-build-agent-with-approval-gates` gave RAG and agent *construction* a foundation-build experience where only downstream operate/troubleshoot coverage existed before; `exp-fine-tune-and-register-adapter` covered fine-tuning/adapter lifecycle, which had no capability home at all; and `exp-contain-agent-prompt-injection` gave the previously 100%-empty `ai-security` domain its first authored capability and experience. Each blueprint-only experience targets a real learner band, a real progression archetype (see [`/experience-model/experience-progression.md`](../experience-model/experience-progression.md)), and only references capabilities actually authored in [`/capability-map/`](../capability-map/) — using `future_capability_domains` to note, without inventing a broken reference, where a not-yet-authored domain will eventually attach.

## Adding a new experience

See [`/docs/author-guide.md`](../docs/author-guide.md).
