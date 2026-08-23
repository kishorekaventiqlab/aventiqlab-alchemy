# Validation Guide

## 1. Install a validator

```
pip install check-jsonschema
```

Fallback (no pip / prefer a script) — Python with `jsonschema` + `pyyaml`:

```python
import sys, yaml, json, jsonschema
schema = json.load(open(sys.argv[1]))
instance = yaml.safe_load(open(sys.argv[2]))
jsonschema.validate(instance, schema)
print(f"OK: {sys.argv[2]}")
```

## 2. Validate every instance glob against its schema

Run from the repository root:

```
check-jsonschema --schemafile schemas/learner-profile.schema.json learner-profiles/**/*.yaml
check-jsonschema --schemafile schemas/capability.schema.json capability-map/*/cap-*.yaml
check-jsonschema --schemafile schemas/experience.schema.json experience-catalog/*/experience.yaml
check-jsonschema --schemafile schemas/learning-outcome.schema.json experience-catalog/*/outcomes/*.yaml
check-jsonschema --schemafile schemas/artifact-spec.schema.json experience-catalog/*/artifacts/*.yaml
check-jsonschema --schemafile schemas/skill-evaluator.schema.json skill-evaluator/instances/*.yaml
```

Note: `check-jsonschema` resolves relative `$ref`s (e.g. `./common/vocab.schema.json`) relative to the schema file's own location, so run these commands from the repo root with the `--schemafile schemas/...` paths shown above, not from inside `/schemas/`.

## 3. Cross-reference integrity checklist

`experience-capability-matrix.yaml` and `curriculum-journeys.yaml` are cross-cutting tables, not one of the six core object types, so they are not JSON-Schema-validated — their id columns are checked by hand against this checklist instead.

Every `*_ref` / `*_refs` edge in the shipped Phase 0 content, and what it must resolve to:

| Source | Field | Must resolve to |
|---|---|---|
| 5 learner profiles | `prerequisites[]` | An existing `lp-*` id (chain: staff-principal → 10yr → 7yr → 5yr → 3yr → none) |
| 5 learner profiles | every `capability_refs[]` in the 5 expectation lists | An existing `cap-*` id under `/capability-map/` |
| 15 capabilities | `domain` | One of the 21 enum values in `vocab.schema.json` |
| 15 capabilities | `skills[].id` | Unique `skl-*` id within that capability file |
| `experience-capability-matrix.yaml` | `capability_ref` (×15) | An existing `cap-*` id |
| `curriculum-journeys.yaml` | `experience_ids[]` (×21 domains) | An existing `exp-*` id, or `[]` |
| 19 experiences | `target_learner_profiles[]` | An existing `lp-*` id |
| 19 experiences | `target_capabilities[]` | An existing `cap-*` id (never a stub domain's `planned_capability_ids`) |
| 19 experiences | `prerequisites[]` | An existing `exp-*` id |
| `exp-inference-under-load` | `outcome_refs[]` (3) | An existing `out-*` id under its own `outcomes/` |
| 17 blueprint experiences | `outcome_refs` | `[]` (intentionally empty — not yet fully specified) |
| 3 outcomes | `experience_ref` | `exp-inference-under-load` |
| 3 outcomes | `learner_profile_refs[]` | An existing `lp-*` id |
| 3 outcomes | `related_capabilities[]` | An existing `cap-*` id |
| 5 artifacts | `experience_ref` | `exp-inference-under-load` |
| 5 artifacts | `outcome_refs[]` | A subset of `exp-inference-under-load`'s own `outcome_refs` |
| 5 artifacts | `capability_refs[]` | An existing `cap-*` id |
| skill_evaluator artifact | `type_specific.evaluator_ref` | `se-inference-under-load` |
| `se-inference-under-load` | `experience_ref` | `exp-inference-under-load` |
| `se-inference-under-load` | `skills_evaluated[]` | An existing `cap-*` id |

Walk this table top to bottom for every new object added in the future, not just at Phase 0 sign-off.

## 4. ID uniqueness

Every `id:` value in the repository must be globally unique across object types (a capability id must never collide with an experience id, etc. — the `cap-`/`exp-`/`lp-`/`out-`/`art-`/`se-` prefixes make accidental collision unlikely, but check on every new file). Quick manual check:

```
grep -rhoE "^id: .*" learner-profiles capability-map experience-catalog skill-evaluator | sort | uniq -d
```

An empty result means no duplicates.
