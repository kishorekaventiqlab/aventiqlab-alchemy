# Future Architecture Notes

This page describes what comes **after** Phase 0. None of it is built in this repository — it exists so the eventual automation has a written target, and so nobody mistakes a schema field name here for a hint that the automation already exists.

## The full conceptual flow

```
Learner Context -> Capability Model -> Experience -> Learning IR -> Artifact JSON -> Content Artifact
```

Phase 0 builds the first three stages as static, human-authored, schema-validated files:

- **Learner Context** — [`/learner-profiles/`](../learner-profiles/)
- **Capability Model** — [`/capability-map/`](../capability-map/)
- **Experience** — [`/experience-model/`](../experience-model/) + [`/experience-catalog/`](../experience-catalog/), including the five [artifact specifications](../artifact-model/) and [skill evaluator](../skill-evaluator/) for each fully-specified experience.

The remaining three stages are **not built**:

- **Learning IR** — an intermediate representation that would take a specific learner's current capability state plus a chosen experience and compile a personalized instructional plan. Nothing in this repo generates this automatically; a human reads the Experience and Artifact Model directly.
- **Artifact JSON** — a machine-renderable representation of a specific artifact instance (e.g. the actual quiz questions, the actual video script), derived from an Artifact Specification. This repo defines the *specification* schema only; no Artifact JSON is generated.
- **Content Artifact** — the final rendered thing a learner actually consumes (a real video file, a real interactive lab environment, a real graded quiz). None of these are produced in Phase 0.

## The future closed loop (ATLAS-era)

```
Learner -> Current Capability -> Capability Gap -> Recommended Experience -> Artifacts -> Performance -> Skill Evidence -> Updated Learner Profile
```

This is the eventual target: a system (ATLAS) that knows a learner's current capability state, computes the gap against a target learner profile, recommends the next experience from the catalog, observes performance against that experience's artifacts (especially the Skill Evaluator), and updates the learner's profile with new evidence — closing the loop back to the start.

Phase 0 deliberately stops short of this. Every object this loop would need (learner profiles, capabilities, experiences with success/evidence criteria, skill evaluators with scoring dimensions) already exists as structured data — that's the point of building the source of truth first — but nothing here computes a gap, recommends an experience, or updates a profile automatically. ASTRA, ATLAS, any LLM/OpenRouter integration, and any conversational or automated capability-gap analysis are explicitly out of scope until a later phase.
