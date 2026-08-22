# Skill Evaluator

The Skill Evaluator is not a traditional quiz. It verifies reasoning, transfer to novel variation, communication, and engineering judgment — the things a multiple-choice question structurally cannot assess.

Eventually, ASTRA will conduct this as a live conversational Q&A with the learner. **Phase 0 defines only the source-of-truth structure** (schema: [`/schemas/skill-evaluator.schema.json`](../schemas/skill-evaluator.schema.json)) that a future ASTRA conversation would execute against — no conversational AI is implemented here.

An evaluator instance defines: the skills being evaluated, a scenario (usually a *variant* of its experience's scenario, to test transfer rather than recall), an opening question, expected reasoning areas, follow-up question paths keyed to specific triggers, misconception indicators with corrective follow-ups, strong/weak-answer indicators, evidence criteria, weighted scoring dimensions (drawn from the `evaluation_dimension` vocabulary: KNOWLEDGE, REASONING, APPLICATION, TROUBLESHOOTING, TRADE_OFF_ANALYSIS, COMMUNICATION, ENGINEERING_JUDGMENT), proficiency levels, pass conditions, and escalation rules.

See [`instances/se-inference-under-load.yaml`](instances/se-inference-under-load.yaml) for a fully worked example.
