# Glossary & Controlled Vocabularies

Source of truth for these vocabularies: [`/schemas/common/vocab.schema.json`](../schemas/common/vocab.schema.json). If this document and the schema ever disagree, the schema wins — update this page to match.

## The 8 capability verbs

These are **not synonyms**. A learner profile, a capability skill, or a learning outcome that says BUILD is making a categorically different claim than one that says OPERATE, even though both sound like "can do the thing."

| Verb | Meaning | Distinguished from |
|---|---|---|
| **KNOW** | Can recall/state facts, terminology, definitions without necessarily applying them. | UNDERSTAND — knowing a definition isn't the same as reasoning about why it matters. |
| **UNDERSTAND** | Can reason about *why*/tradeoffs conceptually, without having personally built or operated it. | BUILD — understanding a tradeoff conceptually isn't the same as having implemented either side of it. |
| **BUILD** | Can construct/implement/configure a working artifact from requirements. | OPERATE — building something once isn't the same as running it reliably over time. |
| **OPERATE** | Can run/monitor/maintain a live system on an ongoing basis, including routine response. | TROUBLESHOOT — routine operation isn't the same as diagnosing a novel failure under uncertainty. |
| **DESIGN** | Makes cross-constraint architecture tradeoff decisions to produce a system design. | BUILD — designing the shape of a system isn't the same as personally implementing it. |
| **TROUBLESHOOT** | Diagnoses root cause from symptoms under uncertainty in a live/live-like system. | OPERATE — this is what happens when routine operation isn't enough. |
| **EXPLAIN** | Externally communicates reasoning/decisions to others. | UNDERSTAND — understanding something yourself isn't the same as making someone else understand it. |
| **PROVE** | Produces verifiable evidence substantiating a claim (tests, load-test results, postmortems). | EXPLAIN — a narrative explanation isn't the same as evidence that would hold up under scrutiny. |

## The 5 proficiency levels

`Beginner → Intermediate → Advanced → Expert → Architect`. Used in the experience×capability matrix and in skill-evaluator proficiency levels.

Capability files (`/capability-map/`) use a related but intentionally 4-tier set of holistic indicators — `beginner_indicators`, `intermediate_indicators`, `advanced_indicators`, `expert_architect_indicators` — merging Expert and Architect into one tier. This is deliberate, not an inconsistency: architecture judgment is cross-capability synthesis (weighing tradeoffs across several capabilities at once), so a single capability's own indicator text can't behaviorally distinguish "expert at this one thing" from "architect of systems that use this thing." That distinction only becomes meaningful at the matrix/experience layer, which is exactly where the 5-tier scale is used.

## The 5 progression archetypes

`foundation-build`, `intermediate-operate`, `advanced-troubleshoot`, `expert-optimize`, `architect-design`. See [`/experience-model/experience-progression.md`](../experience-model/experience-progression.md) for the full rationale and how catalog experiences map to them.

## The 7 evaluation dimensions

Used in skill-evaluator `scoring_dimensions` and `pass_conditions`: `KNOWLEDGE`, `REASONING`, `APPLICATION`, `TROUBLESHOOTING`, `TRADE_OFF_ANALYSIS`, `COMMUNICATION`, `ENGINEERING_JUDGMENT`. Controlled as an enum specifically so every evaluator instance in the repo uses identical dimension names — a scoring rubric that invents its own dimension name per experience would make evaluators impossible to compare across the catalog.

## The 5 experience bands

`3yr`, `5yr`, `7yr`, `10yr`, `staff-principal`. A convenience label, not the source of truth — see [`/learner-profiles/README.md`](../learner-profiles/README.md) for why years of experience alone is explicitly not sufficient.

## The 5 independence levels

`Guided`, `Supervised`, `Independent`, `Leads Others`, `Sets Org Direction`.
