# AventiqLab AI/ML Platform Engineering Content Factory — Phase 0

This repository is the **source of truth** for AventiqLab's AI / ML Ops / Platform Engineering learning architecture — authored by humans, before any AI automation exists. It is not an application, not infrastructure, and not ASTRA. It is Markdown, JSON Schema, and YAML.

## The core question

Not *"what topics should we teach?"* — **"who is the learner, what can they already do, what capability are we developing, what experience develops it, and what evidence proves they can do it?"**

Years of experience alone is not a proficiency measure. A 5-year engineer and another 5-year engineer can have very different capabilities — see [`/learner-profiles/`](learner-profiles/) for how this repository actually differentiates them.

## The conceptual flow

```
Learner Context -> Capability Model -> Experience -> Learning IR -> Artifact JSON -> Content Artifact
```

**Phase 0 builds the first three stages only** — as static, cross-referenced, schema-validated files. **Learning IR, Artifact JSON, Content Artifact, ASTRA, and ATLAS are not built here** — they're documented as the future target in [`/docs/future-architecture-notes.md`](docs/future-architecture-notes.md) so nothing here is mistaken for automation that doesn't exist yet.

The architecture is **experience-driven**: `Learner -> Capability -> Experience -> Artifacts -> Evidence -> Skill`. Not `Topic -> Course -> Video`. The Experience — a realistic engineering situation the learner is responsible for, not a chapter to read — is the primary object.

## Repository structure

| Directory | Contents |
|---|---|
| [`/learner-profiles/`](learner-profiles/) | 5 learner bands (3yr, 5yr, 7yr, 10yr, staff-principal), each defining what they already know/can do and what they're expected to KNOW, UNDERSTAND, BUILD, OPERATE, DESIGN, TROUBLESHOOT, EXPLAIN, and PROVE. |
| [`/capability-map/`](capability-map/) | 21 capability domains (11 authored, 10 reserved as stubs), hierarchy Domain → Capability → Skill → Evidence. |
| [`/experience-model/`](experience-model/) | The experience×capability matrix, the 5 progression archetypes, and curriculum journeys — cross-cutting views over the catalog. |
| [`/experience-catalog/`](experience-catalog/) | 15 experiences: 1 fully-specified reference experience plus outcomes and all 5 artifacts, and 14 blueprint-only experiences spanning the capability map. |
| [`/artifact-model/`](artifact-model/) | The conceptual purpose of each of the five learning artifacts (Material, Video, Lab, Quiz, Skill Evaluator) and how they stay non-duplicative. |
| [`/skill-evaluator/`](skill-evaluator/) | The source-of-truth structure for reasoning/judgment evaluation — the future ASTRA conversation's eventual script, not a live implementation. |
| [`/schemas/`](schemas/) | JSON Schema for all 6 core object types plus the shared controlled vocabulary. |
| [`/docs/`](docs/) | Glossary, content-author guide, validation guide, and future-architecture notes. |

## Where to start

- New to the model? Read [`/docs/glossary-and-vocabularies.md`](docs/glossary-and-vocabularies.md) first — the 8-verb taxonomy and 5-tier proficiency scale are used everywhere.
- Want to see the whole model proven end-to-end on one example? Read `exp-inference-under-load` in [`/experience-catalog/`](experience-catalog/) — the one experience with outcomes, all 6 artifacts, and a skill evaluator fully worked out.
- Ready to add content? Read [`/docs/author-guide.md`](docs/author-guide.md).
- Adding or changing anything? Validate it — [`/docs/validation-guide.md`](docs/validation-guide.md).

## Explicitly out of scope for Phase 0

ASTRA, ATLAS, any LLM or OpenRouter integration, a web application, the AventiqLab instructor portal, backend infrastructure, AWS or any cloud services, video/TTS generation, databases, and authentication. This repository defines the blueprint those systems would eventually consume — it does not implement any of them.
