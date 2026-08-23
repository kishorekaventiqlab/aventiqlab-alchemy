# Artifact Model

Every fully-specified experience eventually gets artifacts drawn from six possible types, schema: [`/schemas/artifact-spec.schema.json`](../schemas/artifact-spec.schema.json). This directory documents each artifact type's role in the abstract; concrete instances live nested under their experience in [`/experience-catalog/<experience>/artifacts/`](../experience-catalog/).

The six types must never simply repeat each other's content. Each has a distinct job:

| Artifact | Purpose | What it is NOT |
|---|---|---|
| **Material** | Build conceptual understanding (KNOW/UNDERSTAND) — pure reference facts. | Not a narrative, not scenario-specific, no time pressure. |
| **Video** | Build mental models by narrating an expert's reasoning process out loud, usually on a comparable-but-different scenario. | Not a lecture reciting the Material; not the learner's own exact scenario. |
| **Source Code / Lab** | Build implementation capability (BUILD) — untimed, hands-on construction. | Not timed, not scored on decision-making under pressure. |
| **Quiz** | Verify conceptual understanding (KNOW/UNDERSTAND) fast and objectively. | Not a judgment or reasoning assessment. |
| **Battleground** | Verify operational capability (OPERATE/TROUBLESHOOT/BUILD) — an interactive, executable, scenario-based experience where the learner acts on a live-like system and success is determined by observable system state, typically under time pressure. | Not untimed construction (that's the Lab); not a conversation about reasoning (that's the Skill Evaluator) — the learner *does* something to the system and the system's resulting state is the evidence. |
| **Skill Evaluator** | Verify reasoning, transfer to novel variation, communication, and engineering judgment (DESIGN/EXPLAIN/PROVE) through conversational Q&A. | Not a quiz, not an interactive system the learner operates (that's the Battleground), and not (yet) a live conversational AI — see [`/skill-evaluator/README.md`](../skill-evaluator/README.md). |

Every artifact instance's `purpose` field must explicitly say what it uniquely contributes relative to the others for its experience — see `exp-inference-under-load`'s artifact files for a worked example of genuinely distinct purpose statements pointing at the same underlying scenario. Not every experience needs all six — Battleground in particular is only worth authoring where operating the live system (not just reasoning about it or building it once) is itself the skill being taught.
