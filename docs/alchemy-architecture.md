# 1. Alchemy Architecture

> **Status:** Foundation (v0.2). Built 2026-09-10 per the handoff brief from the AventiqLab platform.
> Governing ADR: [ADR-0002](./adr/0002-alchemy-is-a-content-repository.md).

## What Alchemy is

Alchemy is **where learning experiences live**. It is the centralized

- Learning Content Repository (S3)
- Content Metadata Repository (DynamoDB)
- Learning Experience Packaging system (the package + manifest spec)
- Content Publishing / versioning layer (the API's write side + CLI)
- Content Delivery API (the API's read side + presigned URLs)

It is **not** a content-generation engine, an LMS, an assessment engine, or an environment provisioner.
Content is authored locally on a developer's desktop and published *to* Alchemy.

## The four systems

| System | Account | Role | Talks to Alchemy how |
|---|---|---|---|
| **Alchemy** (this repo) | `880636108741` aventiqlab-alchemy-prod | Store, index, version, validate, publish, deliver | — |
| **AventiqLab** platform | `071564566254` | Learner-facing app, dashboards, path orchestration | HTTPS + READ token, from Amplify Lambdas |
| **ASTRA** | `994748688374` | Assesses learners, skill graph, personalized paths; the **only** LLM caller | Future: HTTPS + READ token (see [doc 11](./future-astra-integration-contract.md)) |
| **Arena** | `786469174907` | Executes battle environments from a Terraform-JSON spec | Never. Alchemy stores the arena *definition* only |

Nothing in Alchemy calls an LLM, provisions infrastructure, or knows a learner exists.

## Components (all in the Alchemy account, one CDK stack)

```
 desktop                         Alchemy account (880636108741, ap-south-1)
 ───────                         ───────────────────────────────────────────────────────
 alchemy publish ./pkg  ──HTTPS──▶  API Gateway REST  "alchemy-prod" stage v1
   │  (PUBLISH token)               ├─ GET /health                      (open)
   │                                └─ ANY /{proxy+} ── Lambda REQUEST authorizer
   │                                                     "alchemy-prod-authorizer"
   │                                                     (bearer token → scope read|publish)
   │                                                            │
   │                                                            ▼
   │                                                  Lambda "alchemy-prod-api"  (router + service)
   │                                                     │                 │
   │                                                     ▼                 ▼
   │                                          DynamoDB table        S3 bucket
   │                                    aventiqlab-alchemy-content  aventiqlab-alchemy-content-880636108741
   │                                     (single table, 2 GSIs)     (private, SSE-S3, versioned)
   │                                                                       ▲
   └────────── presigned PUT (artifacts, never through Lambda) ────────────┘
                                                                           │
 AventiqLab Lambda ──HTTPS (READ token)──▶ GET /experiences/{id}/content ──┘ presigned GET
 learner's browser ◀── short-lived presigned GET (video plays straight from S3) ─┘

 Secrets Manager: alchemy/prod/read-token, alchemy/prod/publish-token
 CloudWatch Logs: both Lambdas + API access logs (30-day retention)
```

Exactly these AWS services are used: **S3, DynamoDB, API Gateway (REST), Lambda, Secrets Manager, IAM, CloudWatch Logs.**
The CDK test `only the allowed service families are present` fails the build if anything from the brief's
exclusion list (ECS, EKS, RDS, OpenSearch, Step Functions, EventBridge, AppSync, CloudFront, Bedrock, SageMaker, Cognito) appears.

## Repository layout

```
schemas/                     JSON Schemas — the source of truth for every contract
  manifest.schema.json         the package manifest (local ↔ Alchemy contract)
  skill.schema.json            the Skill entity
  quiz.schema.json  evaluator.schema.json  arena-definition.schema.json
packages/
  core/                      @aventiqlab/alchemy-core — types, validation (ajv), semver, S3 key layout,
                             DynamoDB item mappers, lifecycle state machine, package validator (fs)
  api/                       @aventiqlab/alchemy-api  — Lambda handler + authorizer, router, service,
                             DynamoDB/S3 adapters, in-memory fakes
  cli/                       @aventiqlab/alchemy-cli  — `alchemy validate | publish | get`
  infra/                     @aventiqlab/alchemy-infra — CDK app (one stack)
content/
  aws-global-infrastructure/ the reference Learning Experience package
docs/                        this documentation set (11 numbered docs + ADRs)
```

Conventions (carried over from the archived history of this repo): npm workspaces, ESM TypeScript with
`NodeNext`, strict + `noUncheckedIndexedAccess`, Node's built-in test runner via `tsx`, hand-rolled fakes
instead of AWS mocking libraries, CDK v2 in TypeScript with account/region pinned in `cdk.json` context.

## Request flow: publish

1. `alchemy validate` runs the package validator (schema + semantic + file + digest checks) locally.
2. `PUT /skills/{id}` for every skill shipped in `<pkg>/skills/`.
3. `POST /experiences/{id}/versions` with the manifest and per-artifact SHA-256/size. The API validates again,
   checks every referenced skill exists, refuses immutable versions, writes DRAFT rows, and returns one
   presigned PUT per artifact plus one for `manifest.json`.
4. The CLI PUTs each file straight to S3.
5. `POST /publish`. The API HEADs every object, re-hashes objects ≤ 32 MB, compares to the registered digests,
   and only then flips the version to PUBLISHED in a conditional transaction. A `_publication.json` marker is
   written next to the content for debuggability.

## Request flow: deliver

1. Platform Lambda calls `GET /experiences/{id}` (catalog metadata, latest published version, artifact refs).
2. Platform Lambda calls `GET /experiences/{id}/content` (same, plus a presigned GET per artifact, 15 min).
3. The learner's browser fetches the video/reading/asset directly from S3. Lambda never proxies bytes.

## Deploying

**Nothing has been deployed.** Deploying creates the 36 CloudFormation resources listed in
[the security model, §"Resource inventory"](./security-model.md#resource-inventory) in account `880636108741`.
Requires the `alchemy-developer` AWS profile (the machine's default profile is the *platform* account).

```bash
npm install
npm test                                              # 45 tests, no AWS
npm run synth                                         # cdk synth, no AWS
cd packages/infra
npx cdk bootstrap aws://880636108741/ap-south-1 --profile alchemy-developer   # once
npm run deploy                                        # cdk deploy --profile alchemy-developer
```

After deploy, read the two token values from Secrets Manager (outputs `ReadTokenSecretArn`,
`PublishTokenSecretArn`) and set `ALCHEMY_API_URL` + `ALCHEMY_PUBLISH_TOKEN` for the CLI.

## Assumptions and decisions

- **Assumption:** region `ap-south-1`, matching the previous stack and the `alchemy-developer` profile. Change via `cdk.json` context.
- **Decision:** CDK TypeScript, not Amplify. Amplify is a platform-side choice and drags in Cognito/AppSync.
- **Decision:** REST API (v1) rather than HTTP API, because the brief asked for REST and the REQUEST authorizer + usage/throttle settings are simplest there. Migration to HTTP API later is a CDK-only change; the router is transport-agnostic.
- **Decision:** the CLI holds **no AWS credentials**. All writes go through the API + presigned PUTs. A "publishing IAM role" therefore exists only as the API Lambda's role; see [security model](./security-model.md).
- **Decision:** one Lambda for all routes. Route count is small and cold-start sharing beats per-route functions at this scale.
- **Decision:** bundle the AWS SDK into the Lambda (2 MB) rather than relying on the runtime's copy, so behaviour does not drift between deploys.
