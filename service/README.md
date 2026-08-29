# alchemy Content Studio service

alchemy's HTTP service for the ASTRA Content Studio generation pipeline. Called
only by astra (contract §7). Authorized by
[`docs/adr/0001`](../docs/adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md).

| Task | Status | What it adds |
|---|---|---|
| **AL2** | built | Fastify app, JWT auth, error envelope, `GET /health`, `GET /v1/whoami` |
| **AL7** | built | the content bucket construct + grant helpers (`infra/lib/content-bucket.ts`) |
| **AL3** | built (5 types) | `POST /v1/generate` — material/quiz/source_code_lab/skill_evaluator/**video** via OpenRouter. |
| **AL8** | schema | `docs/video-v1-schema.md` + `src/generate/video-schema.ts` + `src/lib/video-stage-coverage.ts` (the shared stage-coverage lib). |
| **AL6** | built | `POST /v1/artifacts/sign` — proxied presigned S3 GET (OQ-6), `artifact_expired` for aged-out scratch |
| **AL5 (+AL9)** | built | async `POST /v1/render` + `GET /v1/render/{id}` (CD-17) + `POST /v1/artifacts/promote` (CD-18). One-shot Fargate render worker in `video-studio/src/render/`. |

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
    generator.ts    orchestrator (no astra-style retry loop; fills video hashes)
    schemas.ts      per-type deliverable JSON Schemas
    video-schema.ts video/v1 JSON Schema (AL8)
    video-hash.ts   pinned narration_hash + spec_hash formulas (AL8 §1.5/§5)
  lib/
    video-stage-coverage.ts  the shared stage-coverage validator (AL8 OQ-5 —
                             pure, versioned, publishable; astra vendors it)
  artifacts/        AL6 — POST /v1/artifacts/sign
    sign-route.ts   the route (behind requireServiceAuth)
    pointer.ts      parse + validate s3:// (bucket / prefix / experience_id / traversal)
    s3-signer.ts    HeadObject + presigned GET (the mockable S3 seam)
    content-type.ts suffix -> mime fallback
  render/           AL5 — async POST/GET /v1/render + POST /v1/artifacts/promote
    types.ts        request/response + RenderJob (DynamoDB) shapes
    route.ts        POST /v1/render (202 + RunTask) + GET /v1/render/{id} (poll)
    promote-route.ts POST /v1/artifacts/promote (CD-18) — CopyObject to produced/
    plan-rerender.ts planReRender() — pure fn, vision_qa_feedback routing (CD-20)
    job-store.ts    the render-job store (DynamoDB `alchemy-render-jobs`)
    launcher.ts     stash the request to S3 + ecs:RunTask the render worker
    cache-plan.ts   which narration units are TTS-cache hits/misses
    id.ts           ULID render_job_id generator
infra/              CDK (TS) — AL2 Lambda + Function URL, AL7 bucket, AL5 render
                    compute (DynamoDB + Fargate task), AL3/AL5/AL6 grants
Dockerfile          Lambda container image (request service)
```

The **render worker** itself (the Fargate task's code) lives in
`video-studio/src/render/` — it needs the video-studio render toolchain
(`loadVideoSpec`, Remotion, Chatterbox), not the Lambda's Fastify app:

```
video-studio/src/render/
  renderJob.ts      runRenderJob() — the orchestration, every I/O step injected
  worker.ts         the Fargate entrypoint (reads env, wires the real steps)
  s3AudioCache.ts   the tts-cache/{narration_hash}.wav S3 cache (CD-21)
  subprocess.ts     remotion render / ffmpeg poster / ffprobe / validate-render.ts
  beatRegen.ts      the single-beat narration_flaw regen (OpenRouter)
  videoHash.ts      narration_hash / spec_hash (a hand-kept copy of the
                    service's video-hash.ts — contract §3.8)
  jobUpdater.ts     the worker's write-only view of the job record
video-studio/src/audio/synthesize.ts   synthesizeAudioPlan() — the reusable
                                        audio-synthesis core; generate-audio.ts
                                        is now a thin wrapper over it
video-studio/Dockerfile.render          AL9 — video-studio + a Chatterbox V3
                                        CPU venv, weights pre-pulled at build
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
