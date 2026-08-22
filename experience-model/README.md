# Experience Model

This directory holds the cross-cutting views over learner profiles, capabilities, and experiences — it does not itself define any individual experience (those live in [`/experience-catalog/`](../experience-catalog/)).

- [`experience-capability-matrix.yaml`](experience-capability-matrix.yaml) / [`.md`](experience-capability-matrix.md) — expected proficiency and behavior per capability per learner band. See [Part 3 methodology](../docs/glossary-and-vocabularies.md).
- [`experience-progression.md`](experience-progression.md) — the five progression archetypes (foundation-build, intermediate-operate, advanced-troubleshoot, expert-optimize, architect-design) that every experience is tagged with, and which archetype each catalog experience uses.
- [`curriculum-journeys.yaml`](curriculum-journeys.yaml) / [`.md`](curriculum-journeys.md) — domain-scoped, ordered paths through the experience catalog. A browsing aid, not a course list — the Experience remains the primary object.

None of these three files are validated against a JSON Schema (they are cross-cutting tables over the six core object types, not one of the six themselves) — see `/docs/validation-guide.md` for how their capability/experience id references are still hand-checked for correctness.
