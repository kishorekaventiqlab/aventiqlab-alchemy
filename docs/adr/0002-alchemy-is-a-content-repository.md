# ADR-0002 — Alchemy is a content repository, not a generation engine

- **Status:** Accepted
- **Date:** 2026-09-10
- **Supersedes:** ADR-0001 (*Content Studio generation pipeline supersedes LLM deferral*), which lives on the `archive/pre-cleanup` branch along with everything it governed
- **Affects:** the entire `main` branch (greenfield), the cross-repo relationship with the AventiqLab platform, ASTRA and Arena

## Context

The previous plan for this repository built the ASTRA Content Studio generation pipeline
(`POST /v1/generate`, `POST /v1/render`, a Remotion video renderer, an LLM call through OpenRouter). That
pipeline served an Instructor-authoring surface that the platform has since removed
(platform ADR-0003, *Retire the Instructor Economy*). The AWS infrastructure was torn down and `main` was
cleared on 2026-09-10 (commit `c272ac3`).

Learning content is now authored locally on a developer's desktop with local tooling. What the platform
needs from Alchemy is a place for that content to **live**: canonical storage, metadata rich enough for
skill-based personalisation, versioning, a publishing path from the desktop, and a delivery API that
never hands out AWS credentials.

## Decision

Alchemy is the **Learning Content Repository, Content Metadata Repository, Learning Experience Packaging
system, Content Publishing/versioning layer, and Content Delivery API** for AventiqLab. Its verbs are
**store, index, version, validate, publish, deliver**.

Consequently:

1. **No LLM calls in Alchemy.** ASTRA is the only LLM-calling system in the platform. Alchemy stores evaluator definitions; ASTRA runs them.
2. **No environment provisioning in Alchemy.** Arena executes battle environments in its own account. Alchemy stores an `arena-definition.json` that is opaque beyond identity fields.
3. **No learner data in Alchemy.** Progress, paths, accounts, payments and recommendations belong to the platform and ASTRA.
4. **Skill-based metadata is the primary personalisation mechanism**, using the platform's existing competency scale (`exposure … architecture`). Years of experience is a hint only.
5. **Published versions are immutable.** Semantic versioning; a learner is pinned to a version by the platform.
6. **Deliberately small AWS footprint:** S3, DynamoDB, API Gateway (REST), Lambda, Secrets Manager, IAM, CloudWatch Logs. Anything on the brief's exclusion list requires a demonstrated need and a new ADR.
7. **The publishing CLI holds no AWS credentials.** Everything flows through the API and presigned URLs, with separate READ and PUBLISH service tokens.
8. **CDK TypeScript** is the IaC framework (nothing else existed on `main`; Amplify Gen2 is a platform-side choice and would drag in Cognito/AppSync).

## Consequences

- The eleven documents in `docs/` (architecture, package spec, experience schema, skill schema, S3 convention, DynamoDB model, API contract, publishing workflow, versioning, security, future ASTRA contract) are the governing specs. The JSON Schemas in `schemas/` win over prose where they disagree.
- The platform can build `src/api/alchemyClient.ts` against [`docs/api-contract.md`](../api-contract.md) once the stack is deployed and the READ token is provisioned.
- Contract changes that touch `schemas/` or `docs/api-contract.md` go through a PR that pings platform, ASTRA and Alchemy.
- Prior notes on this side or the platform side that describe Alchemy as "the content generation engine called by ASTRA" are superseded by this ADR.

## Alternatives considered

- **Keep the generation pipeline and bolt a repository onto it.** Rejected: the pipeline's consumer no longer exists, and the two concerns share nothing but an S3 bucket.
- **Let the platform read S3/DynamoDB cross-account with IAM.** Rejected: the platform's convention is HTTPS + service credential for every external service, and cross-account IAM would couple deployments.
- **Amplify Gen2 in this repo to match the platform.** Rejected, see decision 8.
