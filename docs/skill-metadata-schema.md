# 4. Skill Metadata Schema

Source of truth: [`schemas/skill.schema.json`](../schemas/skill.schema.json). TypeScript: `Skill` in `packages/core/src/types.ts`.

A **Skill** is a node in the skill graph. Alchemy stores and serves skills; ASTRA reasons over them.
Alchemy does not build the graph engine, only a representation rich enough for ASTRA to build one later.

## Fields

| Field | Type | Notes |
|---|---|---|
| `skillId` | slug | Global identity, e.g. `aws-regions` |
| `name` | string | Display name |
| `domain` | slug | `aws`, `cloud`, `kubernetes`… GSI1 sort prefix |
| `description` | string | What the skill is, 10–1500 chars |
| `parentSkill` | slug, optional | One parent. Indexed on GSI2 (`SKILLPARENT#{parent}`) so children are queryable |
| `childSkills[]` | slug[], optional | Denormalized children. **Not** enforced against `parentSkill` of the children yet (see below) |
| `aliases[]` | string[] | Alternate names ("multi-az", "pops") for matching free text |
| `competencyLevels[]` | `{ level, descriptor, indicators[]? }` | Which levels are meaningful and what each looks like. Lets ASTRA phrase probes and score evidence consistently |
| `assessmentDimensions[]` | `KNOW UNDERSTAND BUILD OPERATE TROUBLESHOOT DESIGN EXPLAIN` | How the skill can be evidenced |
| `tags[]` | slug[] | |
| `status` | `ACTIVE \| DEPRECATED` | A deprecated skill must name `replacedBy` |
| `externalRefs{}` | string map | Cross-references, e.g. AventiqLab `capability-catalog` ids, SFIA codes |

## Example hierarchy (shipped in the sample package)

```
cloud-foundations                (not shipped; referenced as parent)
└── aws-global-infrastructure    parent of the four below
    ├── aws-regions
    ├── availability-zones
    ├── edge-locations
    └── aws-accounts
cloud-computing-basics           external prerequisite skill (must exist before publish)
```

## Relationships Alchemy can already answer

| Question | Mechanism |
|---|---|
| Skills in a domain | GSI1 `SKILL` / `{domain}#` |
| Children of a skill | GSI2 `SKILLPARENT#{skillId}` |
| Experiences that **teach / assess / require** a skill, at which level, in which version | GSI2 `SKILL#{skillId}` / `{TAUGHT\|ASSESSED\|REQUIRED}#` → `GET /skills/{id}/experiences?relation=` |

## Decisions and known gaps

- **Decision:** skills are upserted with `PUT /skills/{skillId}` (publish scope). The CLI does this automatically for every file in `<package>/skills/` before registering a version, so a package is self-contained.
- **Decision:** publish is refused (`422 unknown_skill`) if the manifest references a skill that does not exist. Referential integrity at publish time is cheap now and expensive to retrofit.
- **Gap:** parent/child consistency (`a.childSkills ∋ b` ⇔ `b.parentSkill = a`) is not enforced. The GSI2 parent index is authoritative; `childSkills` is a convenience.
- **Gap:** no cycle detection on `parentSkill`. Depth is expected to be small; add when ASTRA needs guarantees.
- **Gap:** no skill versioning. Skills are mutable metadata; experience versions pin the skill *id* and level, not a skill revision.
