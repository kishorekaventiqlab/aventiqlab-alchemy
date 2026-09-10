# 2. Content Package Specification

A **Learning Experience package** is a directory on the author's desktop. `manifest.json` is the contract
between local content creation and Alchemy; everything else is an artifact the manifest points at.

## Layout

```
aws-global-infrastructure/            ← folder name should equal experienceId (warning if not)
├── manifest.json                     ← REQUIRED. schemas/manifest.schema.json
├── video/
│   └── aws-global-infrastructure.mp4
├── reading/
│   └── aws-global-infrastructure.md
├── quiz/
│   └── quiz.json                     ← schemas/quiz.schema.json
├── arena/
│   └── arena-definition.json         ← schemas/arena-definition.schema.json (opaque beyond identity)
├── evaluator/
│   └── evaluator.json                ← schemas/evaluator.schema.json
├── assets/
│   ├── architecture.svg
│   └── aws-map.svg
└── skills/                           ← OPTIONAL. One <skillId>.json per skill, schemas/skill.schema.json
    ├── aws-regions.json
    └── …
```

## Rules enforced by `alchemy validate`

| # | Rule | Where |
|---|---|---|
| 1 | `manifest.json` exists, parses, and passes the JSON Schema | core `validateAgainstSchema` |
| 2 | Artifact ids and paths are unique | core `validateManifest` |
| 3 | An artifact's path starts with the folder for its kind: `video/`, `reading/`, `quiz/`, `arena/`, `evaluator/` (kind `skill-evaluator`), `assets/` (kind `asset`) | core |
| 4 | `completionCriteria` / `masteryCriteria` reference existing artifacts of the right kind | core |
| 5 | Every `evidence` kind declared under `skills.assessed` or `masteryCriteria.evidenceRequired` is backed by an artifact of the matching kind | core |
| 6 | A skill is not both required and taught; ids are unique per section; learning objectives / artifacts only reference declared skills | core |
| 7 | No self-prerequisite; `experienceYears.min ≤ max`; at least one taught skill | core |
| 8 | Every `required: true` artifact file exists, is a regular file, and is non-empty | package validator |
| 9 | `quiz.json`, `evaluator.json`, `arena-definition.json` validate against their schemas; quiz answer keys reference real options and single/true_false have exactly one answer | package validator |
| 10 | Every `skills/*.json` validates as a Skill | package validator |
| 11 | Paths cannot escape the package directory | package validator |

Warnings (non-blocking): folder name ≠ experienceId, optional artifact missing, referenced skill not shipped
locally (it must then already exist in Alchemy or publish fails with `unknown_skill`).

The validator also computes **SHA-256 and byte size** of every artifact and of `manifest.json` itself. Those
digests are sent to the API on registration and verified after upload; they are what makes a published
version provably the bytes the author validated.

## Artifact kinds

| kind | folder | typical contentType | Consumed by |
|---|---|---|---|
| `video` | `video/` | `video/mp4` | AventiqLab (browser plays from presigned URL) |
| `reading` | `reading/` | `text/markdown` | AventiqLab |
| `quiz` | `quiz/` | `application/json` | AventiqLab (scoring is the platform's job) |
| `arena` | `arena/` | `application/json` | AventiqLab → Arena. Alchemy validates identity fields only |
| `skill-evaluator` | `evaluator/` | `application/json` | ASTRA (runs the conversation and rubric) |
| `asset` | `assets/` | `image/svg+xml`, `image/png`, … | Any |

An experience may have several artifacts of one kind (two videos, three readings). This is why
`artifacts` is an **array with a `kind`** rather than the fixed object sketched in the brief (**decision**).

## Minimal manifest

```json
{
  "manifestVersion": "1",
  "experienceId": "aws-global-infrastructure",
  "version": "1.0.0",
  "title": "AWS Global Infrastructure",
  "summary": "Regions, AZs, edge locations and accounts.",
  "domain": "aws",
  "category": "cloud-foundations",
  "level": "FOUNDATION",
  "difficulty": 1,
  "skills": {
    "taught":   [{ "skillId": "aws-regions", "targetLevel": "knowledge", "primary": true }],
    "assessed": [{ "skillId": "aws-regions", "level": "knowledge", "evidence": ["quiz"] }],
    "required": [{ "skillId": "cloud-computing-basics", "minimumLevel": "exposure" }]
  },
  "prerequisites": [{ "experienceId": "cloud-computing-basics", "optional": true }],
  "targetAudience": { "profiles": ["cloud-beginner"] },
  "learningObjectives": [{ "id": "lo-1", "statement": "Explain what an AWS Region is and how to pick one." }],
  "artifacts": [
    { "artifactId": "reading-main", "kind": "reading", "path": "reading/main.md", "contentType": "text/markdown" },
    { "artifactId": "quiz-main", "kind": "quiz", "path": "quiz/quiz.json", "contentType": "application/json" }
  ],
  "completionCriteria": { "requiredArtifactIds": ["reading-main"], "quiz": { "artifactId": "quiz-main", "passingScorePercent": 70 } },
  "masteryCriteria": { "evidenceRequired": ["quiz"] }
}
```

The full field reference is [doc 3](./experience-metadata-schema.md). The reference package is
[`content/aws-global-infrastructure/`](../content/aws-global-infrastructure/).

## Decisions

- `manifestVersion` is a string constant `"1"`; a breaking manifest change bumps it and the validator gains a second schema. Additive changes do not bump it.
- `extensions` is a free-form escape hatch that Alchemy stores verbatim and never interprets.
- Binary artifacts (video) are **not** meant to live in git long-term. The sample ships a 46 KB placeholder MP4 so the demonstration is self-contained.
