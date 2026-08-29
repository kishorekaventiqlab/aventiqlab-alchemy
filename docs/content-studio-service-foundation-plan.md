# AL2 — Content Studio service foundation (design/plan)

Phase 2 task AL2 (see `aventiqlab-platform/docs/content-studio-phase2-tracker.md`).
Authorized by [ADR-0001](adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md).

**Status: BUILT on branch `phase2/al2-service-foundation`** (commit `4f3787a`),
per this plan as approved. Code + IaC + tests only — no deploy (per-repo deploy
roles not provisioned this phase). It covers the service skeleton, auth, error
envelope, and first deploy target that AL3 (`/v1/generate`), AL5 (`/v1/render`),
and AL6 (`/v1/artifacts/sign`) will sit on. It does **not** cover the endpoints
themselves, the S3 bucket (AL7 — infra written, see
[AL7 plan](content-studio-al7-bucket-plan.md)), or render/TTS compute (AL5/AL9).

**As-built notes vs. this plan:**
- Test runner: `node --import tsx --test` (Node 20.20 lacks
  `--experimental-strip-types`; that's 22.6+). Glob expanded via `find` (Node 20
  `--test` glob support is 21+).
- `tsx` is the local dev/start runner (hoisted to the root workspace
  `node_modules`).
- Full typecheck uses `tsconfig.all.json` (includes tests + scripts);
  `tsconfig.json` is the build config (`src` only, excludes `*.test.ts`).
- 23 `node:test` cases pass; typecheck clean; smoke-tested locally end to end
  (`/health` → `{status:ok}`, `/v1/whoami` no-token → 401 envelope, valid token →
  `{sub}`, garbage token → 401 envelope, unknown route → `validation_failed`).

---

## 1. Framework — Node / TypeScript (Fastify)

**Decision: Node 20 + TypeScript + Fastify.** Rationale:

- **One language for the whole repo's runtime code.** `/v1/render` (AL5) drives the
  existing `video-studio/` toolchain — Remotion (`@remotion/cli`, Node) and
  `scripts/generate-audio.ts` (Node/`tsx`). A Python service would invoke that
  toolchain as a subprocess across a language boundary, and would need its own
  parallel model for the beat/spec types that `video-studio/src/data/*Script.ts`
  already defines in TypeScript. Keeping the service in TS means `/v1/render` can
  `import` the `Beat[]` types and the spec→beats loader directly.
- **The sibling astra service is FastAPI/Python** — we lose shared middleware code
  with it, but not shared *design*: the JWT claims, the error envelope, and the
  Secrets Manager loading pattern are all specified in the frozen contract and in
  `aventiqlab-platform/docs/aventiqlab-integration.md`, and we mirror those by hand
  (the contract already says "no codegen between repos… stay in sync by hand").
- **Fastify over Hono/Express:** first-class JSON schema validation (we already
  have JSON Schema everywhere — `schemas/*.json`), a mature plugin model for the
  auth hook, built-in structured logging (`pino`), and a clean
  `@fastify/aws-lambda` adapter so the same app object runs locally and in Lambda
  with no code fork. Hono is lighter but its Lambda story and schema-validation
  ergonomics are weaker for this shape; Express is heavier and needs more glue.

**Repo location:** a new top-level `service/` directory (sibling to `video-studio/`),
its own `package.json` / `tsconfig.json`. Not inside `video-studio/` — the render
project stays a self-contained Remotion workspace; `service/` depends on it, not
the reverse. A root `package.json` with workspaces (`service`, `video-studio`) ties
them together.

```
service/
  package.json
  tsconfig.json
  src/
    app.ts              # buildApp() -> Fastify instance (no .listen) — shared by local + Lambda
    server.ts           # local entrypoint: buildApp().listen()
    lambda.ts           # Lambda entrypoint: awsLambdaFastify(buildApp())
    config.ts           # env + Secrets Manager resolution (see §3)
    auth/
      jwt.ts            # verifyServiceToken(token) -> { sub } | throws AuthError
      plugin.ts         # Fastify preHandler hook wiring jwt.ts onto protected routes
    errors/
      envelope.ts       # ServiceError classes + the { error: { code, message, retryable } } serializer
      codes.ts          # the code enum (mirrors the contract §9 / §7.6 table)
    routes/
      health.ts        # GET /health           (unauthed)
      whoami.ts        # GET /v1/whoami         (authed stub — proves auth end to end)
    __tests__/
      auth.test.ts
      errors.test.ts
      whoami.test.ts
  infra/
    README.md            # how to deploy (see §5)
    <IaC — see §5 for the choice>
```

---

## 2. What AL2 delivers

| Piece | AL2 scope | Deferred to |
|---|---|---|
| Fastify app skeleton (`buildApp`, local + Lambda entrypoints) | ✅ | — |
| Config resolution (env → Secrets Manager) | ✅ | — |
| JWT verification (HS256, `iss`/`aud`/`exp`) as a reusable preHandler | ✅ | — |
| Error envelope (`{ error: { code, message, retryable } }`) + `ServiceError` classes | ✅ | — |
| `GET /health` (unauthed) | ✅ | — |
| `GET /v1/whoami` (authed stub → returns JWT `sub`) | ✅ | — |
| IaC for a "hello, authed" deploy target | ✅ (written, not necessarily applied) | — |
| `POST /v1/generate` | ❌ | AL3 |
| `POST /v1/render` + render compute + ffmpeg + TTS host | ❌ | AL5 / AL9 |
| `POST /v1/artifacts/sign` | ❌ | AL6 |
| The S3 render/generated bucket + lifecycle policy | ❌ | AL7 |
| Real `ALCHEMY_SERVICE_JWT_SECRET` value exchange with astra | ❌ | AL10-adjacent |

---

## 3. Config & secret resolution

`config.ts` resolves, in order of precedence:

1. **Explicit env var** — `ALCHEMY_SERVICE_JWT_SECRET` set directly (local dev, CI).
2. **Secrets Manager by name** — `ALCHEMY_JWT_SECRET_ARN` (or a fixed secret name
   like `alchemy/service-secrets`, key `ALCHEMY_SERVICE_JWT_SECRET`) resolved at
   cold start via the AWS SDK. Mirrors how astra loads `ASTRA_SERVICE_JWT_SECRET`
   from `astra/service-secrets` (`aventiqlab-integration.md` §Authentication).
3. **Fail closed** — if neither is present, `buildApp()` throws at startup. No
   default, no "dev mode" bypass.

Other config: `PORT` (local), `LOG_LEVEL`, `AWS_REGION` (default `ap-south-1`),
`NODE_ENV`. All via env; no config file.

The actual secret **value** is coordinated with astra later (tracker AL10-adjacent) —
astra generates it, shares it over a secure channel (not chat/doc/repo), both sides
load it by reference. AL2 only builds the *loading path*.

---

## 4. JWT verification (contract §2.3)

`auth/jwt.ts` — `verifyServiceToken(rawToken: string): { sub: string }`:

- **Algorithm:** HS256 only. Reject any token whose header `alg` is not `HS256`
  (explicit allowlist — never trust the token's own `alg`, never allow `none`).
- **Signature:** verified against the resolved `ALCHEMY_SERVICE_JWT_SECRET`.
- **Claims — all required, all verified:**
  | Claim | Rule |
  |---|---|
  | `iss` | must `=== "aventiqlab-astra"` — reject anything else |
  | `aud` | must `=== "aventiqlab-alchemy"` — reject anything else (this is what distinguishes a Content Studio token; mirrors the contract's `aud` design for the platform→astra side) |
  | `exp` | **must be present** and in the future (small clock-skew leeway, ~30s) |
  | `sub` | must be present and non-empty (`<experience_id>` per §2.3) — returned to the caller |
  | `iat` | verified ≤ now + skew if present; not required |
- **Library:** `jose` (actively maintained, no `jsonwebtoken` `alg`-confusion
  footguns, works in Node and Lambda).
- **On any failure:** throw `AuthError` → the error plugin renders
  `401 { error: { code: "unauthorized", message, retryable: false } }`. The
  `message` never leaks *why* (expired vs bad-sig vs wrong-aud) beyond a generic
  "invalid or expired token" — matches astra's assessment engine behavior.

`auth/plugin.ts` — a Fastify plugin exposing a `requireServiceAuth` preHandler.
Routes opt in (`{ preHandler: [requireServiceAuth] }`); `/health` does not. On
success it sets `request.serviceAuth = { sub }` for handlers to read.

---

## 5. Error envelope (contract §9, §7.6)

Every non-2xx response body:

```json
{ "error": { "code": "<slug>", "message": "<human-readable, may change>", "retryable": <bool> } }
```

`errors/codes.ts` — the slug enum alchemy can emit, from the contract:

| `code` | HTTP | `retryable` | When |
|---|---|---|---|
| `unauthorized` | 401 | false | bad/expired JWT, wrong `iss`/`aud`, missing `sub` |
| `validation_failed` | 422 | false | request body fails schema validation |
| `generation_failed` | 502 | **true** | `/v1/generate` — model produced unusable output (AL3) |
| `render_failed` | 502 | **true** | `/v1/render` — render pipeline error (AL5) |
| `model_provider_unavailable` | 503 | **true** | transient model/OpenRouter outage (AL3) |
| `model_provider_timeout` | 504 | **true** | (AL3) |
| `malformed_model_response` | 502 | **true** | (AL3) |
| `model_provider_quota_exceeded` | 503 | **false** | model billing/quota — retry never helps (AL3) |
| `unsupported_type` | 422 | false | `artifact_type` alchemy can't generate (AL3) |
| `artifact_expired` | 404 | false | `/v1/artifacts/sign` — S3 object aged out (AL6) |
| `not_configured` | 500 | false | server-side: secret / config missing |
| `internal_error` | 500 | false | catch-all for an unhandled exception |

AL2 only *wires the machinery* and uses `unauthorized`, `validation_failed`,
`not_configured`, `internal_error`. The rest are defined now so AL3/AL5/AL6 just
throw the right `ServiceError` subclass.

`errors/envelope.ts`:
- `class ServiceError extends Error { code; httpStatus; retryable; }` + one subclass
  per code (or a factory).
- A Fastify `setErrorHandler` that: renders a `ServiceError` to its envelope;
  renders a Fastify validation error to `validation_failed`; renders anything else
  to `internal_error` (and logs the real error at `error` level, never in the
  response body).

---

## 6. Deploy target — Lambda container image

**Decision for AL2's "hello, authed" deploy: a container-image Lambda behind a
Function URL (or API Gateway HTTP API).** Rationale:

- **The endpoints have split compute profiles.** `/v1/generate` and
  `/v1/artifacts/sign` are lightweight I/O-bound calls (model API + S3 presign) —
  a great fit for Lambda. `/v1/render` (AL5) is *not* — it needs minutes of CPU,
  ffmpeg, a headless Chromium for Remotion, and a TTS host (AL9). That will be its
  own compute (Fargate task, AWS Batch job, or a long-timeout container Lambda —
  decided in AL5), invoked async by the service, **not** run inside the request
  Lambda.
- So AL2 stands up the **request service** as a container Lambda: same Fastify app
  (`lambda.ts` via `@fastify/aws-lambda`), packaged as an image (so AL3's model
  SDK and any native deps ship cleanly, and AL5's later needs don't force a
  packaging rewrite). Function URL with `AuthType: NONE` at the edge — our JWT hook
  is the actual gate — or API Gateway HTTP API if we want request logging/throttle
  knobs. Start with a Function URL; swap to API GW if needed.
- **Region:** `ap-south-1`, matching astra and platform.
- **Account:** the tracker names `880636108741` for alchemy. **⚠️ The AWS
  credentials currently configured on this machine are account `071564566254`
  (`kishore-admin`), not `880636108741`.** This needs to be resolved with the user
  before any deploy — see §8.

**IaC choice:** AWS CDK (TypeScript) — same language as the service, and it's what
lets `infra/` live next to `src/` in one `npm` project. (SAM or Terraform are
viable; CDK-TS keeps the toolchain single-language, consistent with §1.) `infra/`
will define: the Lambda function (from the Docker image), its IAM role (logs +
`secretsmanager:GetSecretValue` on the alchemy secret ARN only), the Function URL,
and a CloudWatch log group with retention. Nothing else in AL2 — no S3, no VPC, no
render compute.

---

## 7. Proving it works

- **Local:** `npm run dev` in `service/` → `buildApp().listen(3000)`.
  - `curl localhost:3000/health` → `200 { "status": "ok" }`
  - `curl localhost:3000/v1/whoami` (no token) → `401` envelope
  - mint a test HS256 token (`iss: aventiqlab-astra`, `aud: aventiqlab-alchemy`,
    `sub: exp-test`, `exp: +5m`) with a local test secret →
    `curl -H "Authorization: Bearer <t>" localhost:3000/v1/whoami` →
    `200 { "sub": "exp-test" }`
  - token with wrong `aud` / expired / `alg: none` → `401` envelope each.
- **Unit tests** (`__tests__/`): the auth matrix above, the error envelope
  serializer, `/v1/whoami` happy + sad paths. Hand-rolled token fixtures, no live
  AWS. Mirrors how `aventiqlab-platform`'s `astra-client/__tests__/` fakes its
  transport.
- **Against a real deploy:** only once §8 is resolved. The plan's acceptance for
  AL2-as-built would be `curl https://<function-url>/v1/whoami` with a real token
  minted from the deployed secret returning the `sub`.

---

## 8. Open items needing the user (before build / deploy)

1. **AWS account mismatch.** Tracker says alchemy = `880636108741`; this machine's
   creds are `071564566254`. Which account does alchemy's service deploy to, and
   are deploy credentials/roles for it available? **No deploy happens until this is
   answered.**
2. **Deploy in-session or not.** The user has chosen *plan only* for this round —
   so AL2's code + IaC get written and tested locally on a branch; the first real
   `cdk deploy` is a separate, explicitly-authorized step.
3. **Function URL vs API Gateway HTTP API** at the edge — default to Function URL
   unless the user/platform wants API GW's logging/throttling now.
4. **Secret name convention** — `alchemy/service-secrets` (mirroring
   `astra/service-secrets`) vs a per-secret ARN. Cosmetic; will confirm with astra
   during the AL10-adjacent secret exchange.

---

## 9. Branch

When this plan is approved and the build proceeds: branch
`phase2/al2-service-foundation` off `main`, all of `service/` + the root workspace
`package.json` + this doc's "as-built" updates. **Does not merge to main without
the user's sign-off.**
