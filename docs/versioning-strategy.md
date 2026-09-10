# 9. Versioning Strategy

## Rules

1. Every experience version has a **semantic version** `MAJOR.MINOR.PATCH` (no pre-release/build tags in v1).
2. **Published versions are immutable.** No metadata edit, no artifact re-upload, no status change except → ARCHIVED.
3. Drafts are mutable: re-registering a DRAFT replaces its metadata, artifact list and skill edges, and mints fresh upload URLs.
4. A new version must be **strictly greater** than the experience's latest published version.
5. Each version lives under its own S3 prefix; a new version never touches an old version's objects.
6. `EXPERIENCE.latestPublishedVersion` is the default readers get; `?version=` fetches any published version explicitly.

## Semantics (author guidance, not enforced)

| Bump | When |
|---|---|
| PATCH `1.0.1` | Typos, a re-encoded video, an asset swap; skills/criteria unchanged |
| MINOR `1.1.0` | New artifact, new learning objective, extra assessed skill; nothing removed |
| MAJOR `2.0.0` | Taught/required skills change, criteria tightened, artifacts removed; a learner mid-way on 1.x should not be silently moved |

Learner ↔ version pinning is the platform's job: when AventiqLab starts a learner on an experience it should
record the `version` it served and keep using `?version=` for that learner (this is why every published
version stays fetchable). Alchemy stores no learner state.

## Lifecycle

```
            ┌──────────┐  status   ┌───────────┐  status   ┌──────────┐
  register ▶│  DRAFT   │──────────▶│ SUBMITTED │──────────▶│ APPROVED │
            └──────────┘◀──────────└───────────┘◀──────────└──────────┘
                  │                      │                       │
                  └──────── POST /publish (verifies uploads) ─────┘
                                         │
                                         ▼
                                  ┌───────────┐   status    ┌──────────┐
                                  │ PUBLISHED │────────────▶│ ARCHIVED │  (terminal)
                                  └───────────┘             └──────────┘
```

Code: `packages/core/src/lifecycle.ts` (`canTransition`, `isImmutable`). Every transition appends to the
version's `statusHistory` and writes a `PUBLICATION` row.

**Decision (MVP):** `/publish` accepts DRAFT, SUBMITTED or APPROVED because there is no reviewer role yet.
When one exists, tighten `TRANSITIONS` so only APPROVED → PUBLISHED is allowed; no data changes.

**Decision:** archiving the latest published version rolls `latestPublishedVersion` back to the newest remaining
published version (or marks the experience ARCHIVED if none remain). Archived versions stay fetchable by
publishers for audit but are invisible to readers.

## Known limitation

Rule 4 forbids hot-fixing an older line (`1.0.1` after `1.1.0` is published). Supporting maintenance branches
would need a per-major `latestPublished` pointer; not needed at the foundation stage.
