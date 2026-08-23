# Capability Map

Capabilities are the second layer of the learning architecture: they define **what** an AI/ML Platform Engineer needs to be able to do, independent of any particular learner or experience.

## Hierarchy

```
Domain -> Capability -> Skill -> Evidence
```

- **Domain** — one of the 21 areas listed in [domain-index.yaml](domain-index.yaml) (e.g. `gpu-engineering`).
- **Capability** — one file under this directory (schema: [`/schemas/capability.schema.json`](../schemas/capability.schema.json)), scoped tightly enough to be teachable through a small number of experiences.
- **Skill** — an entry in a capability's `skills[]` array, tagged with one of the 8 verbs (KNOW, UNDERSTAND, BUILD, OPERATE, DESIGN, TROUBLESHOOT, EXPLAIN, PROVE).
- **Evidence** — the `evidence[]` under each skill: concrete, observable proof that the skill is actually held, not just claimed.

Each capability also carries four holistic **tier indicators** (`beginner_indicators` … `expert_architect_indicators`) — narrative summaries of what a learner at that tier looks like overall, distinct from the granular per-skill statements.

## Status

Phase 0 authored **11 of 21 domains** in full at initial ship; **12 of 21** are authored as of the `ai-security` domain's first capability. The remaining 9 are reserved as stubs in `domain-index.yaml` with `planned_capability_ids` (not yet real, unreferenceable objects). This matches the instruction to build a strong, extensible foundation rather than overpopulate the taxonomy before it's been proven against real experiences. See `/docs/author-guide.md` for how to author a new capability, including turning a stub into a real one.
