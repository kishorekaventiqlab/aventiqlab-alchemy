# Artifact Model

Every fully-specified experience eventually gets five artifacts, schema: [`/schemas/artifact-spec.schema.json`](../schemas/artifact-spec.schema.json). This directory documents each artifact type's role in the abstract; concrete instances live nested under their experience in [`/experience-catalog/<experience>/artifacts/`](../experience-catalog/).

The five types must never simply repeat each other's content. Each has a distinct job:

| Artifact | Purpose | What it is NOT |
|---|---|---|
| **Material** | Build conceptual understanding (KNOW/UNDERSTAND) — pure reference facts. | Not a narrative, not scenario-specific, no time pressure. |
| **Video** | Build mental models by narrating an expert's reasoning process out loud, usually on a comparable-but-different scenario. | Not a lecture reciting the Material; not the learner's own exact scenario. |
| **Source Code / Lab** | Build implementation capability (BUILD) — untimed, hands-on construction. | Not timed, not scored on decision-making under pressure. |
| **Quiz** | Verify conceptual understanding (KNOW/UNDERSTAND) fast and objectively. | Not a judgment or reasoning assessment. |
| **Skill Evaluator** | Verify reasoning, transfer to novel variation, communication, and engineering judgment (DESIGN/EXPLAIN/PROVE). | Not a quiz, and not (yet) a live conversational AI — see [`/skill-evaluator/README.md`](../skill-evaluator/README.md). |

Every artifact instance's `purpose` field must explicitly say what it uniquely contributes relative to the other four for its experience — see `exp-inference-under-load`'s five artifact files for a worked example of five genuinely distinct purpose statements pointing at the same underlying scenario.
