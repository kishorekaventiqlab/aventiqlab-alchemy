# 6. DynamoDB Data Model

Table: `aventiqlab-alchemy-content`, single-table, on-demand, AWS-managed encryption, PITR, deletion
protection, `RETAIN`. Code: `packages/core/src/keys.ts` (`ddb`), `packages/core/src/ddb-items.ts`,
`packages/infra/lib/content-table.ts`, `packages/api/src/dynamo-store.ts`.

## Access patterns (the design input)

| # | Pattern | Caller | Index | Key condition |
|---|---|---|---|---|
| A1 | List experiences, optionally by domain | AventiqLab | GSI1 | `GSI1PK = EXPERIENCE`, `begins_with(GSI1SK, "{domain}#")` |
| A2 | Get an experience's catalog row | AventiqLab | base | `PK = EXP#{id}`, `SK = META` |
| A3 | List all versions of an experience | AventiqLab, CLI | base | `PK = EXP#{id}`, `begins_with(SK, "VER#")` |
| A4 | Get one version **with** its artifacts and skill edges in one query | AventiqLab | base | `PK = EXP#{id}`, `begins_with(SK, "VER#{padded}")` |
| A5 | Get a skill | ASTRA, AventiqLab | base | `PK = SKILL#{id}`, `SK = META` |
| A6 | List skills, optionally by domain | ASTRA | GSI1 | `GSI1PK = SKILL`, `begins_with(GSI1SK, "{domain}#")` |
| A7 | Which experiences teach / assess / require skill X | ASTRA | GSI2 | `GSI2PK = SKILL#{id}`, `begins_with(GSI2SK, "{relation}#")` |
| A8 | Children of a skill | ASTRA | GSI2 | `GSI2PK = SKILLPARENT#{id}` |
| A9 | Publication / transition history of an experience | ops | base | `PK = EXP#{id}`, `begins_with(SK, "PUB#")` |
| W1 | Register or re-register a draft version | CLI | — | batch put version + artifacts + edges + meta; delete stale rows |
| W2 | Publish (atomic status flip) | CLI | — | `TransactWriteItems` with condition `status = <previous>` on the version row |
| W3 | Upsert a skill | CLI | — | put |

There are no scans anywhere and the Lambda role is not granted `dynamodb:Scan`.

## Key schema

```
PK (S)  SK (S)                GSI1PK (S)  GSI1SK (S)   GSI2PK (S)  GSI2SK (S)
GSI1 — list-by-type   projection ALL
GSI2 — reverse lookups projection ALL
```

## Entities

| entityType | PK | SK | GSI1 | GSI2 | Notes |
|---|---|---|---|---|---|
| `EXPERIENCE` | `EXP#{experienceId}` | `META` | `EXPERIENCE` / `{domain}#{experienceId}` | — | Catalog row: title, summary, domain, category, level, difficulty, tags, `status` (DRAFT/PUBLISHED/ARCHIVED), `latestVersion`, `latestPublishedVersion` |
| `EXPERIENCE_VERSION` | `EXP#{experienceId}` | `VER#{padded}` | — | — | `version`, `status` (lifecycle), `s3Prefix`, **`manifest` (whole document)**, `manifestSha256`, `manifestSizeBytes`, `skillIds[]`, `prerequisiteIds[]`, `publishedAt`, `statusHistory[]` |
| `ARTIFACT` | `EXP#{experienceId}` | `VER#{padded}#ART#{artifactId}` | — | — | `kind`, `path`, `s3Key`, `contentType`, `sizeBytes`, `sha256`, `verifiedAt`, `sha256Verified`, `etag`, plus title/duration/language/skillIds |
| `EXPERIENCE_SKILL` | `EXP#{experienceId}` | `VER#{padded}#SKILL#{relation}#{skillId}` | — | `SKILL#{skillId}` / `{relation}#{experienceId}#{padded}` | `relation` ∈ TAUGHT/ASSESSED/REQUIRED, `level`, `versionStatus` (copied so A7 can filter to published) |
| `SKILL` | `SKILL#{skillId}` | `META` | `SKILL` / `{domain}#{skillId}` | `SKILLPARENT#{parent}` / `{skillId}` (only if parent set) | `skill` (whole document), `domain` |
| `PUBLICATION` | `EXP#{experienceId}` | `PUB#{isoTimestamp}#{padded}` | — | — | `from`, `to`, `actor`, `note`, `artifactCount`, `totalBytes` — every lifecycle transition, append-only |

`{padded}` is the semver zero-padded to six digits per component (`1.10.0` → `000001.000010.000000`) so
versions sort correctly as strings. `packages/core/src/semver.ts`.

Every item also carries `entityType`, `createdAt`, `updatedAt`.

## Why one partition per experience

A4 is the hot read: `GET /experiences/{id}` and `/content` need the version row, its artifacts, and its skill
edges. With the `VER#{padded}` SK prefix shared by all three, that is **one Query**. A publish touches the
same partition, so the conditional transaction in W2 is local. Partitions stay small (tens of versions × tens
of rows), well under any item-collection concern.

## Why the manifest is stored whole

The manifest is ~5–10 KB of JSON and is the API's primary response payload. Storing it whole means
`GET /experiences/{id}` returns exactly what the author published with no reassembly, and schema evolution
is handled on read. The projected fields on `EXPERIENCE` exist only for listing.

## Consistency rules

- Register (W1) is **not** atomic across rows and does not need to be: a draft is invisible to readers and re-registering is idempotent.
- Publish (W2) writes artifacts + edges first (idempotent), then flips version + meta + publication in **one transaction guarded on the version's prior status**. Two concurrent publishes cannot both succeed.
- Archive rolls `latestPublishedVersion` back to the newest remaining PUBLISHED version in the same transaction.
- Readers only ever see rows with `status = PUBLISHED` (the service filters; the DynamoDB grant is the same for both scopes).

## Decisions

- Single table, not one per entity: every pattern above is served by ≤ 1 query and the entities are tightly co-accessed.
- `ProjectionType.ALL` on both GSIs: the rows are small and it avoids a second fetch on A1/A6/A7.
- On-demand billing: read volume is unknown and small at the foundation stage.
- Cursors are the base64url-encoded `LastEvaluatedKey`; opaque to clients.
