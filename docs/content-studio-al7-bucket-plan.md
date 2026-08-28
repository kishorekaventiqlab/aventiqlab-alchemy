# AL7 — S3 render/generated bucket (design/plan)

Phase 2 task AL7 (see `aventiqlab-platform/docs/content-studio-phase2-tracker.md`).
Authorized by [ADR-0001](adr/0001-content-studio-generation-pipeline-supersedes-llm-deferral.md).
Referenced by [AL3 plan](content-studio-al3-generate-plan.md) §5 and the AL5/AL6 plans (future).

**Status: PLAN — not yet built.** Contract references: v1.3 §7.5, §5bis, OQ-4,
OQ-6, and contract decisions CD-1 / CD-2 (v1.4 addendum, pending).

---

## 1. One bucket, alchemy's account

- **Bucket:** `aventiqlab-alchemy-content` (single bucket for both generated
  artifacts and rendered video).
- **Account:** `880636108741` (`aventiqlab-alchemy-prod`).
- **Region:** `ap-south-1` (matches astra + platform).
- **IaC:** AWS CDK (TypeScript), in the same `service/infra/` CDK app as AL2's
  Lambda — one `cdk deploy` for the whole alchemy stack. New construct file
  `service/infra/lib/content-bucket.ts`.
- **Ownership boundary (OQ-6):** astra never gets cross-account read on this
  bucket. All access is alchemy-internal (the service Lambda, the render compute)
  plus alchemy's own presigning endpoint (AL6) which astra *proxies*. So the
  bucket policy has **no cross-account principals** at all.

---

## 2. Key layout

```
s3://aventiqlab-alchemy-content/
  generated/{experience_id}/{artifact_type}/attempt-{N}.json          # AL3 — full response envelope (CD-1)
  generated/{experience_id}/{artifact_type}/attempt-{N}.error.json    # AL3 — raw model output + parse/validation error (CD-2)
  renders/{experience_id}/cycle-{C}/attempt-{A}.mp4                    # AL5 — a render attempt's MP4 (scratch)
  renders/{experience_id}/cycle-{C}/attempt-{A}.poster.png            # AL5 — its poster frame (scratch)
  renders/{experience_id}/cycle-{C}/attempt-{A}.audio-manifest.json   # AL5 — the Chatterbox manifest for that render
  produced/{experience_id}/video.mp4                                  # AL5/astra — the DURABLE final deliverable
  produced/{experience_id}/video.poster.png                          # durable
```

- `{experience_id}` — astra's opaque `cexp_<ulid>` (not an `exp-*` slug).
- `{artifact_type}` — `material | video | source_code_lab | quiz | skill_evaluator`.
- **`generated/…attempt-{N}.json`** stores the **full `/v1/generate` response
  envelope** per CD-1: `{ artifact_type, schema_version, content, preview,
  metadata: { prompt_version, model, attempt, generated_at } }`.
- **`generated/…attempt-{N}.error.json`** per CD-2: `{ artifact_type, attempt,
  error: { code, message }, raw_model_output, prompt_version, model, failed_at }`.
- **`renders/…`** — AL5 owns the internal structure; AL7 just reserves the prefix
  and its retention class. `cycle-{C}` matches the contract's `render.cycle`
  (a Vision-QA or Gate-2 reject bumps it); `attempt-{A}` is the mechanical-QA
  retry within a cycle (§8 mechanical QA ×3).
- **`produced/…`** — written once, at the point astra's pipeline reaches
  `producing`/`produced` (Gate 2 approved). This is the copy the catalog serves
  via AL6's signed URLs.

### Why `produced/` is a separate prefix (not a tag)

The plan uses a **prefix split** (`produced/` vs `generated/` + `renders/`) rather
than object tags to distinguish durable from scratch, because:

- **Lifecycle rules filter on prefix natively** — a prefix rule is
  self-documenting and can't be silently defeated by a missing/incorrect tag on a
  `PutObject`.
- **IAM can grant/deny per prefix** — the render compute writes `renders/*`, the
  "promote to produced" step (astra-driven, but the write is alchemy's endpoint or
  a copy the render service does) writes `produced/*`, and the sign endpoint reads
  both but the lifecycle policy only ever touches `generated/*` + `renders/*`.
- **A tag-based scheme needs every writer to remember the tag** and needs the
  lifecycle rule to be tag-scoped, which is one more thing to get wrong. Prefixes
  are the S3-idiomatic answer for "different retention for different classes."

The one cost: promoting a render to produced is a `CopyObject` (`renders/…/attempt-A.mp4`
→ `produced/…/video.mp4`), not a zero-cost re-tag. That's fine — it happens once
per experience, and having an immutable `produced/` copy that's independent of
which render attempt won is actually desirable.

---

## 3. Lifecycle policy

| Prefix | Rule | Rationale |
|---|---|---|
| `generated/` | **expire 30 days** after creation (both `.json` and `.error.json`) | scratch — astra has recorded the `s3_pointer` and the Gate-1 decision by then; the durable record of *what was produced* lives in astra's `pipeline_runs` + the `produced/` copy. Matches the AL3-plan / ADR-0001 "only attempt-N scratch is lifecycle-expired." |
| `renders/` | **expire 30 days** after creation | scratch render attempts — same reasoning. The winning render is copied to `produced/` at Gate 2. |
| `produced/` | **no expiration, ever** | the learner-facing deliverable. Contract OQ-4 / ADR-0001: the final produced MP4 + poster are durable; astra/platform treat the produced pointer as permanent. AL6 returns `artifact_expired` only for `generated/`/`renders/` keys, never `produced/`. |
| (all) | abort incomplete multipart uploads after 7 days | housekeeping |
| (all) | `NoncurrentVersionExpiration` 30 days (see §5 versioning) | keep old versions of `produced/` briefly for accidental-overwrite recovery, then clean up |

30 days is the concrete value for the `generated/`/`renders/` scratch classes
(AL3 plan suggested it, coordinator confirmed). Tunable via a CDK context param if
astra's escalation-review workflow needs longer.

---

## 4. IAM — least-privilege split

Three distinct principals, three policies. None get `s3:*` or bucket-wide access.

| Principal | Actions | Resource scope | Task |
|---|---|---|---|
| **AL3 service Lambda** (the request service — also serves AL6) | `s3:PutObject` | `arn:…:aventiqlab-alchemy-content/generated/*` | write `attempt-N.json` / `attempt-N.error.json` |
| | `s3:GetObject` | `…/generated/*`, `…/renders/*`, `…/produced/*` | AL6 sign endpoint reads object metadata + presigns; a re-`/v1/generate` may want to read a prior attempt |
| **AL5 render compute** (Fargate/Batch — separate role) | `s3:PutObject` | `…/renders/*` | write render attempt MP4/poster/manifest |
| | `s3:PutObject`, `s3:CopyObject` (source + dest) | `…/renders/*` → `…/produced/*` | promote the winning render to the durable prefix at Gate 2 |
| | `s3:GetObject` | `…/renders/*` | re-read its own attempts on a re-render cycle |
| **AL6 presigning** | (same Lambda as AL3 — the `GetObject` grant above is what SigV4 presigning needs; no extra permission) | `…/generated/*`, `…/renders/*`, `…/produced/*` | generate short-lived signed GET URLs; return `artifact_expired` (404) when `HeadObject` 404s on a `generated/`/`renders/` key |

- Presigning note: a presigned URL is signed with the caller's own credentials and
  grants exactly the caller's `GetObject` permission for that key + expiry — so the
  AL6 Lambda needs `s3:GetObject` on the prefixes it will sign for, nothing more.
- The "promote to produced" `CopyObject` is on the **render compute** role
  (it already has the MP4 in hand at the end of a successful cycle). The trigger to
  promote is astra reaching Gate-2-approved — delivered to alchemy either as a
  small `/v1/render` follow-up call or folded into the AL5 design. AL7 just grants
  the permission; AL5 wires the trigger.

---

## 5. Encryption, public access, versioning

- **Encryption: SSE-S3 (AES-256), not a CMK.**
  - Access is entirely alchemy-internal (§1) — no cross-account principal ever
    reads this bucket (OQ-6: astra proxies alchemy's sign endpoint, never reads
    S3 directly). So the main reason to use a CMK (cross-account grant via a key
    policy) doesn't apply.
  - SSE-S3 is zero-ops, no key policy to maintain, no per-request KMS cost on
    what could be many small `generated/*.json` objects, and no KMS throttling
    risk on a render burst.
  - **If** a later requirement needs a CMK (compliance, per-object audit of
    decrypts, key rotation control), it's a bucket-level change with a backfill —
    note it as a possible future ADR, not now. The presigning endpoint and IAM
    split above are unchanged by that choice.
- **Block Public Access: all four settings ON.** No public objects, ever — every
  read is via a short-lived presigned URL (§5bis / AL6).
- **Versioning: ON.**
  - `produced/*` — versioning protects the durable deliverable against an
    accidental overwrite or a bad "promote" copy; a prior version can be restored.
  - `generated/*` / `renders/*` — versioning is harmless (each `attempt-N` key is
    written once), and `NoncurrentVersionExpiration` (§3) keeps it from
    accumulating cost.
  - Bucket-level setting, so it's on for everything; the retention differences are
    handled by the prefix lifecycle rules.

---

## 6. What AL7 delivers vs. defers

| AL7 (this task) | Deferred |
|---|---|
| The bucket + its CDK construct | — |
| Block-public-access, SSE-S3, versioning config | — |
| The lifecycle policy (`generated/` + `renders/` 30d, `produced/` never) | — |
| The three IAM policies (AL3-service, AL5-render, AL6-presign) as reusable CDK grant methods | — |
| The key-layout convention (this doc) | — |
| Wiring the AL3 Lambda's `PutObject` call | AL3 build |
| The `renders/*` internal structure + the render compute role's trust policy | AL5 |
| The "promote to produced" trigger | AL5 |
| The presigning endpoint logic + `artifact_expired` | AL6 |
| Actually running `cdk deploy` | separate, explicitly-authorized (per-repo deploy roles aren't sorted — coordinator confirmed no deploys this phase) |

---

## 7. Summary (for the coordinator)

- **One bucket** `aventiqlab-alchemy-content`, account `880636108741`, `ap-south-1`,
  CDK-TS in the AL2 stack.
- **Prefix split** for retention: `generated/` + `renders/` = scratch (30-day
  expiry), `produced/` = durable (never expires). Chosen over object tags because
  prefix lifecycle rules and prefix-scoped IAM can't be silently defeated by a
  missing tag; cost is a one-time `CopyObject` to promote the winning render.
- **SSE-S3**, not a CMK — access is 100% alchemy-internal (OQ-6), so a CMK's
  cross-account key policy buys nothing; revisitable via a future ADR if
  compliance needs it.
- **Block Public Access fully on**; **versioning on** (protects `produced/`,
  harmless + cost-bounded elsewhere).
- **IAM**: three least-privilege policies — AL3-service (`PutObject` on
  `generated/*`, `GetObject` on all three prefixes for AL6 presigning),
  AL5-render (`PutObject` on `renders/*`, `Copy` to `produced/*`), no bucket-wide
  or `s3:*` anywhere.
- **No cross-account principal** in the bucket policy — astra proxies AL6, never
  reads directly.
- Nothing deployed — CDK written, `cdk deploy` is a later authorized step.
