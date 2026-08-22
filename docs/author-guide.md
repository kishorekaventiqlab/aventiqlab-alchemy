# Content Author Guide

Practical, step-by-step instructions for adding to this repository. Every object type below has a schema in [`/schemas/`](../schemas/) — read the relevant schema alongside an existing example before authoring a new instance.

## Add a new learner profile

1. Decide the `experience_band` (one of the 5 in [`/docs/glossary-and-vocabularies.md`](glossary-and-vocabularies.md)) and pick an `id` following `lp-{band}-{role-slug}`.
2. Set `prerequisites` to the `id` of the profile one band below it, continuing the existing chain (see [`/learner-profiles/README.md`](../learner-profiles/README.md)).
3. Fill every expectation field (`build_expectations`, `operational_expectations`, `troubleshooting_expectations`, `architecture_expectations`, `proof_expectations`) with at least one `{statement, verbs, capability_refs}` entry — every `capability_refs` entry must point at a capability that actually exists under `/capability-map/`.
4. Validate: `check-jsonschema --schemafile schemas/learner-profile.schema.json learner-profiles/<band>/<file>.yaml` (see [`validation-guide.md`](validation-guide.md)).

## Add a new capability (including turning a stub domain into an authored one)

1. Check [`/capability-map/domain-index.yaml`](../capability-map/domain-index.yaml) for the domain's status. If it's a `stub`, this is the first capability for that domain — update its `status` to `authored` and move its `planned_capability_ids` entry into `capability_ids` once the file exists.
2. Pick an `id` following `cap-{domain-slug}-{capability-slug}`.
3. Write 3–6 entries in `skills[]`. Each skill needs a `verb` (one of the 8 — try to cover more than one verb across the skill list, not just BUILD) and `evidence[]` that is concrete and observable, not just a restatement of the skill statement. This is the Domain → Capability → Skill → Evidence hierarchy — evidence is what makes a skill checkable rather than aspirational.
4. Fill the four tier indicators (`beginner_indicators` … `expert_architect_indicators`) as holistic prose, distinct from the granular skills.
5. Validate against `schemas/capability.schema.json`, then add the new capability to the experience×capability matrix (`/experience-model/experience-capability-matrix.yaml`) with a deliberately-considered progression curve — don't default to a smooth 1-2-3-4-5 climb unless that's actually true for this capability (see the matrix's own notes for real examples of non-uniform curves).

## Add a new experience

1. Decide whether it's **blueprint-only** (just `experience.yaml`, `outcome_refs: []`) or **fully-specified** (also gets `outcomes/` and `artifacts/`). Start blueprint-only unless you're ready to author all five artifacts.
2. Pick an `id` following `exp-{slug}` and a `progression_archetype` from [`experience-progression.md`](../experience-model/experience-progression.md) — pick the *dominant* verb even if the experience touches more than one.
3. `target_capabilities` must only reference capabilities that actually exist. If the experience's natural domain is still a stub, use `future_capability_domains` to name it honestly instead of inventing an unresolvable capability id.
4. Write `expected_decisions` with at least one plausible-but-wrong option per decision point, not just the correct answer — this is what makes `failure_modes` and the eventual Skill Evaluator's misconception indicators meaningful.
5. Add the experience's `id` to the relevant domain(s) in [`/experience-model/curriculum-journeys.yaml`](../experience-model/curriculum-journeys.yaml), and to the progression table in `experience-progression.md`.
6. If promoting a blueprint-only experience to fully-specified: write 2–4 learning outcomes (`out-{experience-slug}-{seq}`, Learner + Action + Context + Expected Result — avoid vague verbs-only outcomes), then all five artifact specs, each with a `purpose` that states what it uniquely provides versus the other four (see `/artifact-model/README.md`), then a skill evaluator instance under `/skill-evaluator/instances/`. Use `exp-inference-under-load` as the worked template for all of this.

## Add a new skill evaluator

1. Base the `scenario` on a *variant* of its experience (different numbers, a changed constraint) so the evaluator tests transfer, not recall of the exact reference scenario.
2. Write at least 2–3 `follow_up_question_paths` keyed to real triggers you'd expect a learner to hit, and at least 1–2 `misconception_indicators` with a genuine root cause and corrective follow-up — not generic "wrong answer" handling.
3. `scoring_dimensions[].dimension` and `pass_conditions.required_dimensions` must use the controlled `evaluation_dimension` vocabulary — do not invent a new dimension name.
4. `proficiency_levels` should reuse the same 5-tier scale (Beginner…Architect) as the experience×capability matrix, for consistency across the repo.

## Validate everything

See [`validation-guide.md`](validation-guide.md) before considering any new content "done."
