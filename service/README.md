# alchemy Content Studio service

alchemy's HTTP service for the ASTRA Content Studio generation pipeline. Called
only by astra (contract §7). Authorized by
[`docs/adr/0001`](../docs/adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md).

| Task | Status | What it adds |
|---|---|---|
| **AL2** | built | Fastify app, JWT auth, error envelope, `GET /health`, `GET /v1/whoami` |
| **AL7** | built | the content bucket construct + grant helpers (`infra/lib/content-bucket.ts`) |
| **AL3** | built (4 types) | `POST /v1/generate` — material/quiz/source_code_lab/skill_evaluator via OpenRouter. `video` → `unsupported_type` (waits on AL8). |
| AL5 | planned | `POST /v1/render` — spec-driven video-studio render + mechanical QA |
| AL6 | planned | `POST /v1/artifacts/sign` — presigned S3 GET, `artifact_expired` |

## Layout

```
src/
  app.ts            buildApp() -> Fastify instance (no .listen) — shared local + Lambda
  server.ts         local entrypoint
  lambda.ts         AWS Lambda entrypoint (@fastify/aws-lambda)
  config.ts         env -> Secrets Manager -> fail closed
  auth/
    jwt.ts          HS256 verify: iss/aud/exp/sub, alg allow-list
    plugin.ts       Fastify `requireServiceAuth` preHandler
  errors/
    codes.ts        the contract §9 error-code enum
    envelope.ts     ServiceError + { error: { code, message, retryable } } handler
  routes/
    health.ts       GET /health   (unauthed)
    whoami.ts        GET /v1/whoami (authed stub)
  generate/         AL3 — POST /v1/generate
    route.ts        the route (behind requireServiceAuth)
    validate-request.ts  §7.1 body checks; version from context.schema_version (CD-4)
    openrouter.ts   OpenRouter via the openai SDK; one reparse; §9 error mapping
    context.ts      renders the §5.4 Learning IR as UNTRUSTED delimited text (CD-3)
    prompts.ts      versioned per-type prompt templates
    selfcheck.ts    ajv + arithmetic checks before returning (astra stays authoritative)
    preview.ts      derive the §5.5 preview from content (no 2nd model call)
    store.ts        S3 writes: attempt-N.json (CD-1) + attempt-N.error.json (CD-2)
    generator.ts    orchestrator (no astra-style retry loop)
    schemas.ts      per-type deliverable JSON Schemas
infra/              CDK (TS) — AL2 Lambda + Function URL, AL7 bucket
Dockerfile          Lambda container image
```

## Local dev

```bash
npm install                       # from repo root (workspaces) or here
cp .env.example .env               # set ALCHEMY_SERVICE_JWT_SECRET (>= 32 chars)
npm run dev                        # http://localhost:3000

curl localhost:3000/health
# {"status":"ok"}

TOKEN=$(ALCHEMY_SERVICE_JWT_SECRET=$(grep -oP '(?<=ALCHEMY_SERVICE_JWT_SECRET=).*' .env) npm run -s mint-test-token)
curl -H "Authorization: Bearer $TOKEN" localhost:3000/v1/whoami
# {"sub":"cexp_01LOCALTEST"}
```

## Test

```bash
npm test        # node:test — auth matrix, error envelope, routes
npm run typecheck
```

No AWS is touched by the tests. Token fixtures are minted in-process
(`src/test-helpers.ts`).

## Deploy

**Not deployed during Phase 2** — per-repo deploy roles aren't provisioned yet
(`cdk deploy` is a later, explicitly-authorized step). When ready:

```bash
cd infra
npm install
npm run synth      # or: npm run diff / npm run deploy
```

Target account `880636108741` (`aventiqlab-alchemy-prod`), `ap-south-1`.
The stack creates the Secrets Manager container `alchemy/service-secrets`;
its **value** is exchanged with astra out of band (contract §11 / AL10-adjacent).
