# 11. Future ASTRA Integration Contract

> **Status:** Proposed. Nothing in this document is built on the ASTRA side. It records what Alchemy already
> exposes so that ASTRA can build personalized paths without asking Alchemy to change shape.

## Division of responsibility

| | Alchemy | ASTRA |
|---|---|---|
| Owns | experiences, versions, artifacts, **skills and their relationships** | learners, observed capability, path construction, evaluation |
| Calls LLMs | never | yes (the only system that does) |
| Stores learner data | never | yes |
| Reads from the other | — | Alchemy's read API with a READ token |

## The shared vocabulary

Alchemy's competency scale **is** the platform's `DepthLevel` scale, minus `none`:

```
exposure < knowledge < hands_on < production < architecture
```

Every level in a manifest (`skills.taught[].targetLevel`, `skills.required[].minimumLevel`,
`skills.assessed[].level`, `masteryCriteria.evaluator.minimumLevel`) and every `competencyLevels[].level`
on a Skill uses it. ASTRA's observed capability (`ObservedCapability.level` in the platform's
`career-transformation/types.ts`) is directly comparable with no mapping table.

Assessment dimensions (`KNOW UNDERSTAND BUILD OPERATE TROUBLESHOOT DESIGN EXPLAIN`) come from this repo's
archived capability model and are the verbs ASTRA's evaluator prompts should be tagged with.

## What ASTRA can read today

| Need | Endpoint |
|---|---|
| The skill graph in a domain | `GET /skills?domain=aws` (paginated) |
| One skill with its level descriptors and indicators | `GET /skills/{skillId}` |
| Children of a skill | `GET /skills/{skillId}` → `childSkills[]` (GSI2 parent index available if a dedicated endpoint is wanted) |
| Which published experiences **teach** skill X, to what level | `GET /skills/{skillId}/experiences?relation=TAUGHT` |
| Which experiences **require** skill X (so a learner lacking it is routed elsewhere) | `…?relation=REQUIRED` |
| Which experiences produce **evidence** for skill X | `…?relation=ASSESSED` |
| Full metadata of one experience: taught/required/assessed skills, prerequisites, objectives, mastery criteria | `GET /experiences/{id}` → `version.manifest` |
| The evaluator definition (prompts + rubric) to run a conversation | `GET /experiences/{id}/content` → artifact of kind `skill-evaluator` → presigned URL → JSON |

## A path-construction sketch (ASTRA-side, illustrative)

```
goal skills   = ASTRA's target-role capability set, mapped to Alchemy skillIds via Skill.externalRefs
have          = ASTRA's observed capability per skillId
for each goal skill below target level:
    candidates = GET /skills/{skill}/experiences?relation=TAUGHT   (published only)
    keep those whose manifest.skills.required are all satisfied by `have`
    drop those whose every taught skill is already ≥ target in `have`   ← the "7-year engineer skips fundamentals" rule
    order by manifest.prerequisites, then level/difficulty
```

Nothing here uses `targetAudience.experienceYears`. It is present as an authoring hint only.

## Fields Alchemy commits to keeping stable for ASTRA

- `Skill.skillId`, `Skill.parentSkill`, `Skill.competencyLevels[].level`, `Skill.assessmentDimensions`
- `Manifest.skills.{taught,assessed,required}` shapes and the competency enum
- `Manifest.masteryCriteria` shape
- `GET /skills/{id}/experiences` response shape
- The `version` string a learner was served, so ASTRA can fetch the exact evaluator that was in force

## Open questions for the ASTRA team

1. Does ASTRA want a bulk export (`GET /skills?domain=` is paginated at 200) or is per-domain paging fine?
2. Should `Skill.externalRefs` carry the platform's `capability-catalog` ids, and who owns that mapping?
3. Does ASTRA want Alchemy to enforce a maximum skill-tree depth or cycle detection? (Not enforced today.)
4. Evidence weighting: `skills.assessed[].evidence` says *which* artifact kinds evidence a skill; should the manifest also carry per-kind weights, or is that ASTRA policy?
5. Should `masteryCriteria.evaluator.minimumLevel` be per-prompt rather than per-experience?

Changes arising from these go through a contract PR touching `schemas/`, this document and
[doc 7](./api-contract.md), pinging platform, ASTRA and Alchemy.
