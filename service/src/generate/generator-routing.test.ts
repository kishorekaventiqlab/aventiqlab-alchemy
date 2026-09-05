/**
 * Regression pin for the routing/resolution change in validate-request.ts's
 * resolveInternalType: a real production incident (confirmed against real
 * astra code + real CloudWatch logs the same day) traced to astra always
 * sending artifact_type: "video" (never "video_v2", zero concept of the
 * distinction) — meaning every real instructor-generated video was routed
 * to the frozen, Kubernetes-shaped video/v1 schema, and video/v2 (fully
 * built, unit-tested, and proven correct via real renders) was completely
 * unreachable from real product traffic.
 *
 * The fix: "video" now resolves internally to video/v2 for NEW generations,
 * while everything astra can OBSERVE stays byte-identical to before —
 * same response `artifact_type`, same S3 storage path. This file pins
 * exactly that: the external contract is unchanged, but the internal
 * schema/prompt actually used has moved.
 *
 * This is deliberately a SEPARATE file from generate-video.test.ts (which
 * now tests checkVideo()/VIDEO_SCHEMA directly, since "video" no longer
 * reaches that code via a live request) and generate-video-v2.test.ts
 * (which tests explicit artifact_type: "video_v2" requests, unaffected by
 * this change) — this file is specifically about the RESOLUTION step
 * itself: which internal schema a given external artifact_type maps to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken } from "../test-helpers.js";
import { LEARNING_CONTEXT, LEARNING_CONTEXT_GIT, VALID_CONTENT } from "./fixtures.js";
import type { ModelClient, ModelCallInput, ModelCallResult } from "./openrouter.js";
import type { ArtifactStore, ArtifactKey } from "./store.js";
import type { StoredEnvelope, StoredErrorEnvelope } from "./types.js";
import type { GeneratorDeps } from "./generator.js";

class MockModel implements ModelClient {
  calls: ModelCallInput[] = [];
  constructor(private readonly content: unknown) {}
  async generateJson(input: ModelCallInput): Promise<ModelCallResult> {
    this.calls.push(input);
    return { parsed: structuredClone(this.content), raw: JSON.stringify(this.content), model: "test/model" };
  }
}
/**
 * Unlike the other test files' MemoryStore (which hardcode a path segment
 * matching whichever artifact_type that file happens to test), this one
 * echoes `key.artifactType` verbatim into the constructed path — the whole
 * point here is confirming what that path segment ACTUALLY is for a given
 * request, not asserting a fixed string.
 */
class MemoryStore implements ArtifactStore {
  envelopes: Array<{ key: ArtifactKey; envelope: StoredEnvelope }> = [];
  errors: Array<{ key: ArtifactKey; envelope: StoredErrorEnvelope }> = [];
  async putEnvelope(key: ArtifactKey, envelope: StoredEnvelope) {
    this.envelopes.push({ key, envelope });
    return `s3://test-bucket/generated/${key.experienceId}/${key.artifactType}/attempt-${key.attempt}.json`;
  }
  async putErrorEnvelope(key: ArtifactKey, envelope: StoredErrorEnvelope) {
    this.errors.push({ key, envelope });
    return `s3://test-bucket/generated/${key.experienceId}/${key.artifactType}/attempt-${key.attempt}.error.json`;
  }
}
const silentLog = { info() {}, warn() {}, error() {} };

async function appReturning(content: unknown) {
  const model = new MockModel(content);
  const store = new MemoryStore();
  const deps: GeneratorDeps = { model, store, modelByType: {}, defaultModel: "test/model", log: silentLog };
  const app = await buildApp({ config: TEST_CONFIG, generateDepsOverride: deps });
  return { app, model, store };
}
async function authedPost(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown) {
  const token = await mintToken({ sub: "cexp_01TEST" });
  return app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: payload as object,
  });
}

test('artifact_type: "video" resolves internally to video/v2 (the actual routing fix)', async () => {
  // The mocked model returns v2-shaped content (entities/relationships, not
  // v1's nodes/node_kind) — if the request were still routed to v1's
  // schema/self-check, this would fail with a schema validation error, the
  // same way the real AWS-load-balancer incident's v1-shaped content would
  // fail v2's self-check. Succeeding here IS the proof of correct routing.
  const { app, store } = await appReturning(VALID_CONTENT.video_v2);
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: { authorization: `Bearer ${await mintToken({ sub: "cexp_01TEST" })}`, "content-type": "application/json" },
    payload: {
      experience_id: "cexp_01TEST",
      artifact_type: "video", // the literal string astra always sends
      attempt: 1,
      learning_context: LEARNING_CONTEXT_GIT,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const json = res.json();

  // What astra OBSERVES must be unchanged: it asked for "video", it gets
  // "video" back — the internal schema swap is invisible to it.
  assert.equal(json.artifact_type, "video", "response artifact_type must still be \"video\", matching what astra sent");

  // What actually got PRODUCED is v2: real behavior change, confirmed here.
  assert.equal(json.schema_version, "video/v2", "internally, a plain \"video\" request now produces video/v2 content");
  assert.ok(Array.isArray(json.content.beats));
  const archBeat = json.content.beats.find((b: { visual?: { kind?: string } }) => b.visual?.kind === "architecture");
  assert.ok(archBeat, "v2 fixture's architecture beat must have made it through unmodified");
  assert.ok(Array.isArray(archBeat.visual.entities), "v2 shape (entities), not v1 shape (nodes)");
  assert.equal(archBeat.visual.nodes, undefined, "must NOT be v1's node_kind/nodes shape");

  // Storage path: also unchanged from astra's perspective — still under the
  // "video" segment, not "video_v2", even though the content is v2-shaped.
  assert.equal(store.envelopes.length, 1);
  assert.equal(store.envelopes[0]!.key.artifactType, "video");
  assert.match(json.s3_pointer, /\/video\/attempt-1\.json$/);
  assert.doesNotMatch(json.s3_pointer, /\/video_v2\//);
});

test('artifact_type: "video_v2" (explicit opt-in) still resolves to itself, unchanged behavior', async () => {
  const { app, store } = await appReturning(VALID_CONTENT.video_v2);
  const res = await authedPost(app, {
    experience_id: "cexp_01TEST",
    artifact_type: "video_v2",
    attempt: 1,
    learning_context: LEARNING_CONTEXT_GIT,
  });
  assert.equal(res.statusCode, 200, res.body);
  const json = res.json();
  assert.equal(json.artifact_type, "video_v2");
  assert.equal(json.schema_version, "video/v2");
  assert.equal(store.envelopes[0]!.key.artifactType, "video_v2");
  assert.match(json.s3_pointer, /\/video_v2\/attempt-1\.json$/);
});

test("every other artifact_type is unaffected by the routing change (identity resolution)", async () => {
  const { app, store } = await appReturning(VALID_CONTENT.material);
  const res = await authedPost(app, {
    experience_id: "cexp_01TEST",
    artifact_type: "material",
    attempt: 1,
    learning_context: LEARNING_CONTEXT,
  });
  assert.equal(res.statusCode, 200, res.body);
  const json = res.json();
  assert.equal(json.artifact_type, "material");
  assert.equal(json.schema_version, "material/v1");
  assert.equal(store.envelopes[0]!.key.artifactType, "material");
});

test('a "video" request whose (v2-shaped) content fails self-check reports the failure against video/v2, not video/v1', async () => {
  // If routing had silently stayed on v1, a v2-shaped model response would
  // fail for the WRONG reason (v1 schema rejecting v2 fields entirely,
  // e.g. "must NOT have additional property entities") rather than a real
  // v2 self-check failure. Confirms the self-check actually dispatched on
  // v2's rules, not v1's.
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const beats = bad.beats as Array<Record<string, unknown>>;
  bad.beats = beats.filter((b) => b.stage !== "decision"); // drop a REQUIRED stage
  const { app } = await appReturning(bad);
  const res = await authedPost(app, {
    experience_id: "cexp_01TEST",
    artifact_type: "video",
    attempt: 1,
    learning_context: LEARNING_CONTEXT_GIT,
  });
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "generation_failed");
  assert.match(res.json().error.message, /stage coverage|decision/i);
  // Not a v1-schema-shape rejection (e.g. "additional property") — a real
  // v2-side content-validation failure, confirming v2's tables were used.
  assert.doesNotMatch(res.json().error.message, /additional propert/i);
});
