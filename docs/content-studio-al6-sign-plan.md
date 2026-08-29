# AL6 — `POST /v1/artifacts/sign` (design/plan)

Phase 2 task AL6 (see `aventiqlab-platform/docs/content-studio-phase2-tracker.md`).
Authorized by [ADR-0001](adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md).
Sits on [AL2](content-studio-service-foundation-plan.md) (the service + auth) and
[AL7](content-studio-al7-bucket-plan.md) (the bucket + `grantReadForPresign`).

**Status: BUILT on branch `phase2/al6-sign`.** Contract references: v1.3 §7bis,
§5bis, §9, OQ-6 (proxied signing), CD-7 (15-min TTL + `produced/`-missing is a
bug, not an expiry).

**As-built:** `service/src/artifacts/` — `sign-route.ts` (POST /v1/artifacts/sign
behind `requireServiceAuth`), `pointer.ts` (the 5-check validation, incl.
`sub === experience_id`), `s3-signer.ts` (`HeadObject` + `getSignedUrl`,
mockable), `content-type.ts`. Same Lambda as AL3; the CDK stack now wires
`grantGeneratedWrite` + `grantReadForPresign` onto it and sets
`ALCHEMY_CONTENT_BUCKET`. 19 tests (fake signer, no live AWS) incl. the
`produced/`-missing-is-`validation_failed` guard. typecheck + build clean; 15
infra tests green.

---

## 0. What this endpoint is for

Contract OQ-6 resolved to **proxied signing**: astra never gets cross-account S3
read on alchemy's bucket. Instead alchemy exposes a "sign this artifact pointer"
endpoint, and astra's §5bis handler (`GET .../artifacts/{type}/url`, called by
platform) proxies it. alchemy owns:
- turning an `s3://` pointer into a short-lived HTTPS GET URL, and
- returning `artifact_expired` when a scratch object has aged out under the
  AL7 lifecycle policy.

Platform's catalog never links a raw `s3://` URI — it always goes through this
chain, so an expired object degrades to a clean `artifact_expired` (404), not a
dead link.

```
platform  ──GET /v1/content/experiences/{id}/artifacts/{type}/url──▶  astra
                                                                      │
astra  ──POST /v1/artifacts/sign { experience_id, s3_pointer }──────▶ alchemy (AL6)
                                                                      │
                              ◀── 200 { url, expires_at, content_type }
                              ◀── 404 { error: { code: "artifact_expired", ... } }
```

---

## 1. Request / response (contract §7bis)

### Request — `POST /v1/artifacts/sign` (astra → alchemy)

```json
{
  "experience_id": "cexp_01J9Z8...",
  "s3_pointer": "s3://aventiqlab-alchemy-content/produced/cexp_01J9Z8.../video.mp4"
}
```

| Field | Req? | Type | Notes |
|---|---|---|---|
| `experience_id` | yes | string | astra's `cexp_<ulid>`. Cross-checked against the pointer's path (§3). |
| `s3_pointer` | yes | string | an `s3://` URI. One of the pointers alchemy itself returned from `/v1/generate` (§7.2) or `/v1/render` (§7.5), or a `produced/` key astra recorded. |

### Response — `200`

```json
{
  "url": "https://aventiqlab-alchemy-content.s3.ap-south-1.amazonaws.com/produced/cexp_.../video.mp4?X-Amz-Algorithm=...",
  "expires_at": "2026-08-29T15:31:09Z",
  "content_type": "video/mp4"
}
```

| Field | Type | Notes |
|---|---|---|
| `url` | string | a SigV4 presigned GET URL, valid until `expires_at` |
| `expires_at` | ISO 8601 | `now + TTL` (§4) — the exact moment the URL stops working |
| `content_type` | string | from the object's `ContentType` metadata; falls back to a suffix-based guess (§5) |

### Errors → §9 envelope

| Condition | `code` | HTTP | `retryable` |
|---|---|---|---|
| bad/expired/wrong-`aud` JWT | `unauthorized` | 401 | false |
| body not an object / missing field / `s3_pointer` not a string | `validation_failed` | 422 | false |
| `s3_pointer` not `s3://`, wrong bucket, disallowed prefix, or `experience_id` mismatch | `validation_failed` | 422 | false |
| object is a `generated/` or `renders/` key that no longer exists (aged out, or never written) | `artifact_expired` | 404 | false |
| object is a `produced/` key that doesn't exist | `validation_failed` | 422 | false — **not** `artifact_expired` (see §6) |
| S3 `HeadObject` fails for any other reason (throttle, permission, outage) | `internal_error` | 500 | false |
| presign call itself throws | `internal_error` | 500 | false |

---

## 2. Where it lives

**Same service Lambda as AL3, a new route** (`service/src/artifacts/sign-route.ts`).
Rationale:
- It's a lightweight I/O call (one `HeadObject` + a local SigV4 sign) — the exact
  shape the request Lambda is built for.
- The AL3 service Lambda already needs `s3:GetObject` on all three prefixes (the
  AL7 plan wired `grantReadForPresign` for exactly this — "AL6 reuses AL3's
  grant"). A presigned URL is signed with the Lambda's own credentials and
  grants exactly the Lambda's `GetObject` permission for that one key + expiry,
  so **no additional IAM** is needed.
- One fewer Lambda to deploy, warm, and monitor.

File layout (within AL2's `service/`):

```
service/src/artifacts/
  sign-route.ts        POST /v1/artifacts/sign — auth, validate, head, presign
  pointer.ts           parse + validate an s3:// pointer against bucket/prefix/experience_id
  s3-signer.ts         HeadObject + getSignedUrl wrapper (the S3 seam, mockable)
  content-type.ts      suffix -> mime fallback
  __tests__/ (or *.test.ts alongside)
```

Registered in `app.ts` next to `generateRoute`.

---

## 3. Pointer validation (defense in depth)

`pointer.ts` — `parseArtifactPointer(s3Pointer, experienceId)`:

1. **Scheme + bucket.** Must match `^s3://aventiqlab-alchemy-content/(.+)$`.
   The bucket name is config (`ALCHEMY_CONTENT_BUCKET`, the same value AL3 uses),
   not hard-coded. Anything else → `validation_failed`.
2. **Prefix allow-list.** The key must start with `generated/`, `renders/`, or
   `produced/`. Any other prefix → `validation_failed`. (Rejects e.g. a pointer
   crafted at the bucket root, or a future internal prefix.)
3. **`experience_id` match.** Every key layout embeds the experience id as the
   first path segment after the prefix:
   - `generated/{experience_id}/{artifact_type}/attempt-N.json`
   - `renders/{experience_id}/cycle-C/attempt-A.mp4`
   - `produced/{experience_id}/video.mp4`
   So `key.split('/')[1]` must `===` the request's `experience_id`. Mismatch →
   `validation_failed`. **This is the OQ-6 defense-in-depth check** — even though
   astra is authenticated, it can't ask alchemy to sign another run's object by
   passing a crafted pointer with a mismatched `experience_id`.
4. **No traversal.** Reject a key containing `..`, `//`, control chars, or a
   trailing `/` (a prefix, not an object). → `validation_failed`.
5. Return `{ key, prefix, experienceSegment, retentionClass }` where
   `retentionClass` ∈ `"scratch"` (generated/renders) | `"durable"` (produced) —
   used by §6.

The JWT's `sub` is also an `experience_id` (contract §2.3, `sub: <experience_id>`).
AL6 additionally checks **`request.serviceAuth.sub === experience_id`** in the
body — astra mints a token per run, so a token for run A can't drive a sign
request for run B even before the pointer check. Mismatch → `unauthorized`
(matches how astra's assessment engine enforces `sub == run owner`).

---

## 4. TTL

**15 minutes.** `expires_at = now + 900s`.
- Long enough for a browser to *begin* a large video download (the URL only
  needs to be valid at request-initiation; an in-flight GET continues past
  expiry on S3).
- Short enough that a leaked/logged URL isn't a durable back-door to the
  object.
- Config-overridable: `ALCHEMY_SIGNED_URL_TTL_SEC` (default 900), clamped to
  `[60, 3600]`.
- Note: a presigned URL's lifetime is also capped by the **signing credential's**
  own session length. Under a Lambda execution role the creds are refreshed well
  inside that, so 15 min is always honoured; worth a comment in `s3-signer.ts`.

---

## 5. `content_type`

1. From `HeadObject`'s `ContentType` (AL3 writes `application/json`; AL5 will
   write `video/mp4` / `image/png`).
2. Fallback by key suffix (`content-type.ts`): `.mp4`→`video/mp4`,
   `.png`→`image/png`, `.json`→`application/json`, `.md`→`text/markdown`,
   else `application/octet-stream`.
3. The presigned URL also pins `ResponseContentType` to the resolved value so
   the browser gets the right type even if the stored metadata is wrong.

---

## 6. `produced/` never returns `artifact_expired`

Contract OQ-4 / ADR-0001: the final produced MP4 + poster are **durable** — the
AL7 lifecycle policy never expires anything under `produced/`. So:

- A `HeadObject` 404 on a `generated/` or `renders/` key → `artifact_expired`
  (404). This is the expected, legitimate "the scratch object aged out (30 days)
  or was never written" case. Platform shows "this content needs re-rendering."
- A `HeadObject` 404 on a `produced/` key → **`validation_failed` (422)**, not
  `artifact_expired`. A missing durable object is a bug (a bad pointer, or a
  promote-to-produced that didn't run), not an expiry — it should surface loudly,
  not as a soft "re-render me."

`s3-signer.ts` distinguishes 404 (`NotFound` / `NoSuchKey`) from other
`HeadObject` errors; the route maps by `retentionClass` from §3.

---

## 7. Sequence (happy + expired)

```
1. auth        requireServiceAuth -> request.serviceAuth.sub
2. parse body  { experience_id, s3_pointer }         -> validation_failed on shape
3. sub check   serviceAuth.sub === experience_id      -> unauthorized on mismatch
4. pointer     parseArtifactPointer(...)              -> validation_failed on bucket/prefix/id/traversal
5. head        S3 HeadObject(key)
                 - 200  -> continue
                 - 404 & scratch  -> 404 artifact_expired
                 - 404 & durable  -> 422 validation_failed
                 - other error    -> 500 internal_error
6. content_type  head.ContentType ?? suffixGuess(key)
7. presign     getSignedUrl(GetObjectCommand, { expiresIn: ttl, ResponseContentType })
8. respond     200 { url, expires_at: now+ttl, content_type }
```

---

## 8. Tests (mock S3 — `HeadObject` + `getSignedUrl`)

- valid `produced/` pointer → 200, `url` present, `expires_at ≈ now + 900s`,
  `content_type: "video/mp4"`.
- valid `generated/…attempt-1.json` pointer → 200, `content_type:
  "application/json"`.
- pointer for the **wrong bucket** → `validation_failed`.
- pointer with a **disallowed prefix** (`s3://…/secrets/x`) → `validation_failed`.
- pointer whose **`experience_id` segment ≠ body `experience_id`** →
  `validation_failed`.
- pointer with `..` traversal → `validation_failed`.
- body `experience_id` ≠ JWT `sub` → `unauthorized`.
- `generated/` object missing (`HeadObject` 404) → `artifact_expired` (404).
- `renders/` object missing → `artifact_expired` (404).
- **`produced/` object missing → `validation_failed` (422), NOT
  `artifact_expired`** (the §6 invariant, worth an explicit guard test like
  AL7's "produced/ has no expiration").
- `HeadObject` throttled/500 → `internal_error` (500).
- no token → 401; wrong `aud` → 401.
- TTL override via `ALCHEMY_SIGNED_URL_TTL_SEC` respected and clamped.

No live AWS — inject a fake signer (`{ head, presign }`) the way AL3 injects
`generateDepsOverride`.

---

## 9. Dependencies & open items

| Depends on | Status |
|---|---|
| AL2 build (service + auth + error envelope) | done (PR #1) |
| AL7 (`grantReadForPresign` on the AL3 Lambda) | done (PR #2) — **AL6 must add the actual `content.grantReadForPresign(service)` wiring to the stack** (AL7 deliberately left it unwired) |
| `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` | `client-s3` already added in AL3; add `s3-request-presigner` |
| AL5 writing `renders/` + `produced/` objects | not required for AL6 to be built/tested (mocked), but `produced/` keys won't exist end-to-end until AL5's promote step |

**Contract note to raise:** §7bis should state the TTL (propose 15 min) and that
`produced/` keys are never `artifact_expired` — both are AL6 design decisions
that astra/platform should be able to rely on.

---

## 10. Summary (for the coordinator)

- **Same Lambda as AL3, new route** `POST /v1/artifacts/sign`. No new IAM — AL7's
  `grantReadForPresign` is exactly the presign capability; AL6 just wires it into
  the stack (AL7 left it unwired on purpose).
- **Request** `{ experience_id, s3_pointer }` → **200** `{ url, expires_at,
  content_type }`.
- **Pointer validation is defense-in-depth for OQ-6**: `s3://` +
  `aventiqlab-alchemy-content` + prefix ∈ {generated,renders,produced} +
  the pointer's `experience_id` path segment `===` the body `experience_id`
  `===` the JWT `sub`. Any mismatch → `validation_failed` / `unauthorized`.
- **`HeadObject` first.** 404 on scratch (`generated/`/`renders/`) →
  `artifact_expired` (404). 404 on `produced/` → `validation_failed` (422) — a
  missing durable deliverable is a bug, not an expiry.
- **TTL 15 min** (`ALCHEMY_SIGNED_URL_TTL_SEC`, clamped `[60, 3600]`).
- **`content_type`** from object metadata, suffix fallback, pinned as
  `ResponseContentType` on the URL.
- Tests mock `HeadObject` + `getSignedUrl`; no live AWS.
