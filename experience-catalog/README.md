# Experience Catalog

The Experience is the primary object in AventiqLab's learning architecture — not a topic, not a course. Each subdirectory here is one experience, schema: [`/schemas/experience.schema.json`](../schemas/experience.schema.json).

## Status

- **`exp-inference-under-load`** is the one **fully-specified** reference experience: it has a complete `experience.yaml`, three `outcomes/`, and all 5 `artifacts/` (Material, Video, Lab, Quiz, Skill Evaluator).
- The other **14 experiences** are **blueprint-only**: a complete, schema-valid `experience.yaml` (scenario, starting state, decisions, tradeoffs, success conditions — everything a content author needs to build outcomes and artifacts from) but no `outcomes/` or `artifacts/` yet, and `outcome_refs: []`. Building those out is Phase 1+ work, using `exp-inference-under-load` as the template.

## Why 15

The brief asked for 10–15 candidate experiences spanning the capability map so the model could be proven against more than one hand-picked scenario before committing to it as the pattern. Each blueprint-only experience targets a real learner band, a real progression archetype (see [`/experience-model/experience-progression.md`](../experience-model/experience-progression.md)), and only references capabilities actually authored in [`/capability-map/`](../capability-map/) — using `future_capability_domains` to note, without inventing a broken reference, where a not-yet-authored domain will eventually attach.

## Adding a new experience

See [`/docs/author-guide.md`](../docs/author-guide.md).
