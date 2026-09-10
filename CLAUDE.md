# aventiqlab-alchemy

Alchemy = AventiqLab's learning content repository / packaging / versioning / publishing / delivery API.
Verbs: **store, index, version, validate, publish, deliver.** Read `docs/adr/0002-*.md` first.

## Hard boundaries (do not cross without a new ADR)

- **No LLM calls here.** ASTRA (separate repo/account `994748688374`) is the only LLM caller in the platform.
- **No environment provisioning.** Arena (`786469174907`) runs battle environments; Alchemy stores `arena-definition.json` as an opaque document.
- **No learner data.** No accounts, progress, paths, payments, recommendations.
- **Allowed AWS services:** S3, DynamoDB, API Gateway REST, Lambda, Secrets Manager, IAM, CloudWatch Logs. `packages/infra/test` fails if ECS/EKS/RDS/OpenSearch/Step Functions/EventBridge/AppSync/CloudFront/Bedrock/SageMaker/Cognito appear.
- **Own account only:** `880636108741` ap-south-1, via `--profile alchemy-developer`. This machine's default profile is the *platform* account (`071564566254`) — never deploy with it.
- **Never deploy without listing the resources and getting explicit confirmation.** `archive/pre-cleanup` must stay intact.

## Layout and conventions

- npm workspaces: `packages/core` (contracts), `packages/api` (Lambda), `packages/cli`, `packages/infra` (CDK). Root `npm test` / `npm run typecheck` fan out.
- ESM TypeScript, `NodeNext`, strict + `noUncheckedIndexedAccess`. Workspace packages export `.ts` sources directly (`exports` in package.json); CDK's `NodejsFunction` bundles with esbuild, tests run via `node --import tsx --test $(find …)` (Node 20.20 lacks test globs).
- **Schemas are the source of truth:** `schemas/*.json` (draft-07, ajv). `packages/core/src/types.ts` mirrors them by hand — update both.
- Tests use hand-rolled fakes (`packages/api/src/fakes.ts`), never an AWS mocking library. No test touches AWS.
- Business rules live in `packages/api/src/service.ts` behind the `ContentStore` / `ObjectStore` ports; adapters are `dynamo-store.ts` / `s3-store.ts`. Keep it that way so rules stay testable.
- ajv/ajv-formats are CJS: import `{ Ajv }` (named) and `* as addFormatsNs` — see `packages/core/src/validate.ts` for why.

## Contract discipline

`docs/api-contract.md` ↔ `packages/core/src/api-contract.ts` are kept in sync by hand. Changing either, or
anything in `schemas/`, is a cross-repo contract change: PR pings platform, ASTRA, Alchemy.

## Commands

```bash
npm test                    # all packages
npm run typecheck
npm run validate:sample     # alchemy validate content/aws-global-infrastructure
npm run alchemy -- publish content/aws-global-infrastructure --dry-run
npm run synth               # cdk synth (no AWS)
npm run deploy --workspace packages/infra   # ONLY after explicit confirmation
```

## Docs

`docs/` has the 11 numbered specs listed in `README.md`. Where prose and schema disagree, the schema wins.
