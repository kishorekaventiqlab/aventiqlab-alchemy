# 3. Experience Metadata Schema

Source of truth: [`schemas/manifest.schema.json`](../schemas/manifest.schema.json) (JSON Schema draft-07).
TypeScript mirror: `packages/core/src/types.ts` (`Manifest`).

The manifest **is** the experience-version metadata. Alchemy stores it verbatim on the `EXPERIENCE_VERSION`
row and projects a handful of fields onto the `EXPERIENCE` catalog row.

## Identity

| Field | Type | Notes |
|---|---|---|
| `manifestVersion` | `"1"` | Manifest schema major version |
| `experienceId` | slug | Stable across all versions. Never changes once published |
| `version` | semver `X.Y.Z` | Immutable once published. See [doc 9](./versioning-strategy.md) |
| `title`, `summary` | string | Catalog fields |
| `description` | string, optional | Longer Markdown |
| `domain`, `category` | slug | `aws` / `cloud-foundations`. `domain` is also the first S3 prefix segment and the GSI1 sort prefix |
| `level` | `FOUNDATION \| INTERMEDIATE \| ADVANCED \| EXPERT` | Coarse band |
| `difficulty` | 1–5 | Relative effort within the level |
| `estimatedMinutes`, `tags` | optional | |
| `placement` | `{program, track, module, order}` optional | Where the author put it in the curriculum tree (AWS Transformation → Foundation → Introduction to AWS). **Informational**: ASTRA builds the learner's path from skills, not from this |

## Skill-based personalization (the important part)

```
skills.taught[]    { skillId, targetLevel, primary? }     → what the learner will reach
skills.assessed[]  { skillId, level, evidence[] }         → what evidence the experience produces, and from which artifact kinds
skills.required[]  { skillId, minimumLevel }              → what the learner should already hold
prerequisites[]    { experienceId, optional?, reason? }   → authored ordering hint between experiences
```

**Competency levels** are `exposure | knowledge | hands_on | production | architecture`. This deliberately
mirrors the AventiqLab platform's `DepthLevel` scale (minus `none`), so ASTRA's observed capability and
Alchemy's taught/required levels are the same vocabulary. (**Decision**; see [doc 11](./future-astra-integration-contract.md).)

**Evidence kinds** are `quiz | evaluator | arena | reading | video`, each backed by exactly one artifact kind.

`targetAudience.experienceYears` exists because the brief lists it, but it is a **hint**, and the schema
comment says so. `targetAudience.profiles` (`cloud-beginner`, `senior-devops`, …) is free vocabulary for now.

## Objectives and criteria

| Field | Shape | Consumer |
|---|---|---|
| `learningObjectives[]` | `{ id: lo-…, statement, skillIds?, dimension? }` | AventiqLab UI, ASTRA probes |
| `completionCriteria` | `{ requiredArtifactIds[], quiz?: { artifactId, passingScorePercent } }` | AventiqLab — "did the learner *complete* it" |
| `masteryCriteria` | `{ evaluator?: { artifactId, minimumLevel }, arena?: { artifactId, successConditions[] }, evidenceRequired[] }` | ASTRA — "did the learner *master* the taught skills" |
| `participation` | `mandatory \| optional` (default mandatory) | Default when placed in a path; ASTRA may override per learner |

`dimension` values (`KNOW UNDERSTAND BUILD OPERATE TROUBLESHOOT DESIGN EXPLAIN`) carry over from this repo's
archived capability model.

## Artifacts

`artifacts[]` items: `{ artifactId, kind, path, contentType, title?, required?, durationSeconds?, language?, skillIds? }`.
See [doc 2](./content-package-spec.md) for kind/folder rules. Alchemy adds `sizeBytes`, `sha256`, `s3Key`
and a `urlPath` when it serves them back.

## Provenance

`authors[]`, `changelog`, `extensions{}` (opaque).

## How it evolves without breaking ASTRA

- Additive optional fields: add to the schema, no `manifestVersion` bump, old manifests still validate.
- Renames or semantics changes: bump `manifestVersion`, keep the old schema compiled, migrate on read.
- The API always returns the manifest under `version.manifest` **plus** the `manifestVersion` it was written with, so consumers can branch.
- Enumerations (`level`, `competencyLevel`, `evidenceKind`, `artifactKind`) are closed on purpose; extending them is a contract change that pings platform, ASTRA and Alchemy.
