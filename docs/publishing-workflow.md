# 8. Publishing Workflow

```
LOCAL DESKTOP                                  ALCHEMY
─────────────                                  ───────
author package  (docs/content-package-spec.md)
      │
alchemy validate ./aws-global-infrastructure
      │  schema + semantic + file + digest checks (no network)
      ▼
alchemy publish ./aws-global-infrastructure
      │ 1. validate again
      │ 2. PUT /skills/{id}   for each skills/*.json ─────────▶  SKILL rows
      │ 3. POST /experiences/{id}/versions {manifest, digests} ─▶  DRAFT version + ARTIFACT + EXPERIENCE_SKILL rows
      │    ◀──────────────── presigned PUT URLs ────────────────
      │ 4. PUT manifest.json + every artifact ─────────────────▶  S3  {domain}/{level}/{id}/{version}/…
      │ 5. POST /publish {experienceId, version} ──────────────▶  HEAD + re-hash every object
      │                                                           transaction: version→PUBLISHED, meta pointer, PUBLICATION row
      │                                                           write _publication.json
      │    ◀──────────────── publication summary ───────────────
      ▼
PUBLISHED EXPERIENCE   →  GET /experiences/aws-global-infrastructure
```

## Commands

```bash
# from the repo root
npm run alchemy -- validate content/aws-global-infrastructure
npm run alchemy -- publish  content/aws-global-infrastructure --dry-run      # validate + plan, no network
npm run alchemy -- publish  content/aws-global-infrastructure --draft-only   # register + upload, leave DRAFT
npm run alchemy -- publish  content/aws-global-infrastructure                # the real thing
npm run alchemy -- get aws-global-infrastructure                              # read it back
```

Environment: `ALCHEMY_API_URL` (stack output), `ALCHEMY_PUBLISH_TOKEN` (value of `alchemy/prod/publish-token`),
optionally `ALCHEMY_READ_TOKEN` for `get`. Flags: `--json` for machine-readable output, `--skip-skills`.

## Step-by-step, mapped to the brief's list

| Brief step | Where | Failure → |
|---|---|---|
| 1. Validate manifest | CLI (`validatePackage`) and again API (`validateManifest`) | exit 1 with `path: message` lines / `422 validation_failed` |
| 2. Validate required artifacts | CLI: exists, non-empty, typed JSON validates | exit 1 |
| 3. Validate metadata | CLI + API: skill refs, criteria refs, uniqueness; API: skills exist | `422 unknown_skill` lists the ids |
| 4. Determine version | The manifest's `version`. API requires it > latest published and not immutable | `409 conflict` / `409 immutable_version` |
| 5. Upload artifacts to S3 | CLI PUTs to presigned URLs (streams from disk; large videos never buffer) | upload error, nothing published |
| 6. Write metadata to DynamoDB | API on register (DRAFT rows) and on publish (status flip) | — |
| 7. Mark experience as published | `POST /publish` after verifying every upload | `409 artifacts_not_ready` with per-artifact reasons |
| 8. Return a publication summary | `PublishResponse`, printed by the CLI | — |

## Guarantees

- A version becomes visible to readers **only** after every registered byte has been verified present, and (for objects ≤ 32 MB) its SHA-256 matches what the author validated locally.
- A failed publish leaves a DRAFT that can be re-registered or re-uploaded; nothing partial is ever visible.
- Re-running `alchemy publish` on an already-published version fails fast with `immutable_version` — bump `version` in the manifest.
- The CLI never sees AWS credentials, bucket names or table names. It only knows the API URL and one token.

## What is deliberately not here

No CI/CD pipeline, no approval UI, no scheduled publishing, no diffing between versions. `SUBMITTED` and
`APPROVED` exist as states (`POST …/status`) so a review step can be inserted later without changing the
data model; today `/publish` may go straight from `DRAFT` because there is no reviewer role (**decision**).

## Offline end-to-end proof

`packages/cli/src/publish.test.ts` runs the real CLI publish flow against the real API router with DynamoDB
and S3 swapped for in-memory fakes, then asserts the S3 keys, the DynamoDB row counts per entity, and the
`GET /experiences/aws-global-infrastructure` response. `npm test` runs it.
