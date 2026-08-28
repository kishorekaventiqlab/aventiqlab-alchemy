# ADR-0001 — Content Studio generation pipeline is alchemy automation Phase 1; it supersedes the LLM/OpenRouter deferral

- **Status:** Accepted
- **Date:** 2026-08-29
- **Supersedes:** the "later phase" deferral of LLM/OpenRouter integration in [`future-architecture-notes.md`](../future-architecture-notes.md) and [`README.md`](../../README.md)
- **Superseded by:** —
- **Affects:** `future-architecture-notes.md` ("Learning IR", "Artifact JSON", "Content Artifact" stages), `README.md` ("Explicitly out of scope for Phase 0"), and all future `video-studio/` + generation-service work

## Context

Phase 0 of this repository is a static, human-authored, schema-validated source of
truth — learner profiles, the capability map, and experiences with their artifact
specs and skill evaluators. Both `README.md` and `docs/future-architecture-notes.md`
were explicit that **ASTRA, ATLAS, any LLM or OpenRouter integration, video/TTS
generation, a web application, backend infrastructure, and authentication** are out
of scope for Phase 0, and that the "Learning IR → Artifact JSON → Content Artifact"
stages of the conceptual flow are "not built" and deferred to "a later phase."

That later phase is now defined. The **ASTRA Content Studio generation pipeline** —
specified in the cross-repo contract
[`aventiqlab-platform/docs/content-studio-pipeline-contract-v1.md`](https://github.com/) (v1.2 → freeze;
aventiqlab-platform PR #12, branch `phase1/content-studio-pipeline-contract`) —
asks alchemy to build:

- **`POST /v1/generate`** — generate one artifact's content ("Artifact JSON") from a
  confirmed Learning Context ("Learning IR" supplied by ASTRA), via a **live
  model call** (OpenRouter or equivalent). alchemy runs no retry loop of its own;
  ASTRA drives retries against the contract's caps.
- **`POST /v1/render`** — render the `video` artifact with `video-studio` made
  **spec-driven** (accept a `video_spec` in the request body instead of reading a
  hand-authored `Beat[]` data file), synthesize narration audio, and run the
  existing `video-studio/scripts/validate-render.ts` mechanical-QA checklist,
  returning pass/fail plus the report and an S3 pointer.

This is alchemy's first deployable service, first model integration, first render
compute, and first S3 bucket — none of which exist in Phase 0. Signing the contract
freeze commits alchemy to this work, so the deferral in the Phase 0 docs must be
formally lifted rather than left silently contradicting the committed direction.

The alchemy repo had no ADR log before this. This ADR establishes `docs/adr/` and
follows the ADR format already in use in `aventiqlab-platform/docs/adr/`.

## Decision

1. **The Content Studio generation pipeline is alchemy's automation Phase 1.**
   Building `POST /v1/generate` and `POST /v1/render` as specified in the frozen
   cross-repo contract is in scope and authorized, effective 2026-08-29.

2. **This supersedes the LLM/OpenRouter deferral.** The statements in `README.md`
   ("Explicitly out of scope for Phase 0 … any LLM or OpenRouter integration … a web
   application … backend infrastructure … AWS or any cloud services … video/TTS
   generation … authentication") and in `future-architecture-notes.md` ("ASTRA,
   ATLAS, any LLM/OpenRouter integration … are explicitly out of scope until a
   later phase") remain accurate **as descriptions of Phase 0**, but no longer
   describe the repository's overall direction. Both docs get a one-line pointer to
   this ADR so they do not read as current constraints on Phase 1.

3. **Phase 0 artifacts stay canonical and human-authored.** This ADR does not change
   the schemas, the capability map, the experience catalog, or the "source of
   truth is authored by humans" principle. The pipeline *consumes* the Phase 0
   blueprint (via the contract's §5.4 `context` / Learning IR, composed by ASTRA
   from `learning-outcome.schema.json` + `experience.schema.json`); it does not
   replace it. `schemas/*.json` remain the authority on domain shapes; where the
   contract and a schema disagree, the schema wins and the contract is corrected.

4. **The contract, not this repo, governs the wire.** The request/response shapes,
   auth (`ALCHEMY_SERVICE_JWT_SECRET`, HS256, `iss: aventiqlab-astra`,
   `aud: aventiqlab-alchemy`, `sub: <experience_id>`), retry caps, error envelope,
   and S3 ownership are defined in
   `aventiqlab-platform/docs/content-studio-pipeline-contract-v1.md` and tracked by
   hand across repos. Changes to those shapes happen through a contract PR that
   pings all three teams, not through an alchemy-local decision.

5. **The `video/v1` "Artifact JSON" schema is Phase-2 design work.** The contract's
   §7.3 `video` content is under-specified for the per-beat visual props
   `video-studio`'s renderer needs (architecture node layout, investigation
   keyframes, terminal lines). That schema — the `docs/video-artifact-constitution.md`
   §B `video-narrative.schema.json` plus per-beat visual props — is designed and
   agreed between astra and alchemy during Phase 2 build, per contract §3.8. It is
   not a blocker for the contract freeze.

## Authorization

Authorized by the user, who owns alchemy's scope, relayed through the platform
coordinator as part of the ASTRA Content Studio cross-repo contract freeze
(`aventiqlab-platform` PR #12). alchemy's sign-off on contract v1.2/v1.3 is
contingent on this ADR existing as the paper trail for lifting the deferral.

## Consequences

- **New:** alchemy gains a deployable HTTP service, model-provider integration,
  render compute, a TTS host, and an S3 bucket (`aventiqlab-alchemy-content` or
  similar, in alchemy's account). alchemy owns the bucket's lifecycle policy — only
  `attempt-N` scratch objects are lifecycle-expired (contract OQ-4); the final
  produced MP4 + poster are retained as durable.
- **New:** alchemy exposes a small `POST /v1/artifacts/sign` endpoint (JWT-authed,
  same secret) that ASTRA proxies for the platform's signed-download surface, and
  owns returning `artifact_expired` when a scratch object has aged out
  (contract OQ-6, proxied signing).
- **Unchanged:** `video-studio` stays generic and data-driven; `beat.type` remains
  a rendering concern; the Chatterbox/`TTSProvider` seam and `validate-render.ts`
  are reused as-is. The renderer never imports the pedagogical/narrative layer
  (constitution §6).
- **Unchanged:** every Phase 0 schema, doc, and validation rule.
- **Follow-up:** when a `paid_credit` model is added to Content Studio generation,
  that is a separate contract change (contract §10) — generation is free for
  instructors in v1.
