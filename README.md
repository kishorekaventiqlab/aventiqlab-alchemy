# aventiqlab-alchemy

**Alchemy — where AventiqLab learning experiences live.**

Alchemy is the centralized learning content repository, metadata repository, experience packaging system,
publishing/versioning layer and content delivery API for the AventiqLab platform. It stores, indexes,
versions, validates, publishes and delivers learning experiences. It does not generate content, run
assessments, provision lab environments, or know who the learner is. Those belong to ASTRA, Arena and the
AventiqLab platform respectively. See [ADR-0002](docs/adr/0002-alchemy-is-a-content-repository.md).

```
desktop ── alchemy publish ./pkg ──▶ API Gateway + Lambda ──▶ S3 (artifacts) + DynamoDB (metadata)
AventiqLab ── GET /experiences/{id}/content ──▶ presigned URLs ──▶ learner's browser
```

AWS account `880636108741` (aventiqlab-alchemy-prod), region `ap-south-1`. **Not yet deployed.**

## Status

| Phase (from the brief) | State |
|---|---|
| 1 Inspect repository | done |
| 2 Schemas + contracts | done — `schemas/`, `docs/` |
| 3 DynamoDB access patterns + model | done — [docs/dynamodb-data-model.md](docs/dynamodb-data-model.md) |
| 4–6 S3, DynamoDB, Lambda + API Gateway (CDK) | built, `cdk synth` clean, **not deployed** |
| 7 Package validator | done — `alchemy validate` |
| 8 Publishing CLI | done — `alchemy publish` |
| 9 Sample experience | done — [`content/aws-global-infrastructure/`](content/aws-global-infrastructure/) |
| 10 End-to-end test | done offline (`packages/cli/src/publish.test.ts`); live run pending deploy |

## Documentation

| # | Doc |
|---|---|
| 1 | [Alchemy Architecture](docs/alchemy-architecture.md) |
| 2 | [Content Package Specification](docs/content-package-spec.md) |
| 3 | [Experience Metadata Schema](docs/experience-metadata-schema.md) |
| 4 | [Skill Metadata Schema](docs/skill-metadata-schema.md) |
| 5 | [S3 Storage Convention](docs/s3-storage-convention.md) |
| 6 | [DynamoDB Data Model](docs/dynamodb-data-model.md) |
| 7 | [API Contract](docs/api-contract.md) |
| 8 | [Publishing Workflow](docs/publishing-workflow.md) |
| 9 | [Versioning Strategy](docs/versioning-strategy.md) |
| 10 | [Security Model](docs/security-model.md) |
| 11 | [Future ASTRA Integration Contract](docs/future-astra-integration-contract.md) |

JSON Schemas in [`schemas/`](schemas/) are the source of truth where prose and schema disagree.

## Quick start

```bash
nvm use                      # Node 20+
npm install
npm test                     # 45 tests across core / api / cli / infra — no AWS needed
npm run typecheck
npm run validate:sample      # alchemy validate content/aws-global-infrastructure
npm run alchemy -- publish content/aws-global-infrastructure --dry-run
npm run synth                # cdk synth (36 resources), still no AWS
```

Deploying is a separate, explicit step — see [Architecture → Deploying](docs/alchemy-architecture.md#deploying).

## Layout

```
schemas/           manifest, skill, quiz, evaluator, arena-definition JSON Schemas
packages/core      shared types, validation, semver, key layout, DynamoDB mappers, package validator
packages/api       Lambda handler + authorizer, router, service, DynamoDB/S3 adapters, fakes
packages/cli       alchemy validate | publish | get
packages/infra     AWS CDK (TypeScript): one stack
content/           the reference Learning Experience package
docs/              the 11 numbered specs + ADRs
```

## History

The original plan (the ASTRA Content Studio generation pipeline: `/v1/generate`, `/v1/render`, Remotion
video) was retired on 2026-09-10 and its infrastructure torn down. Complete prior history is preserved on
the [`archive/pre-cleanup`](../../tree/archive/pre-cleanup) branch.
