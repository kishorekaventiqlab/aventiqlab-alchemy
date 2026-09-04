import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken } from "../test-helpers.js";
import { LEARNING_CONTEXT_GIT, VALID_CONTENT } from "./fixtures.js";
import { selfCheck } from "./selfcheck.js";
import { narrationHash, specHash } from "./video-hash.js";
import { stageCoverage } from "../lib/video-stage-coverage.js";
import { VIDEO_SCHEMA_V2 } from "./video-schema-v2.js";
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
class MemoryStore implements ArtifactStore {
  envelopes: Array<{ key: ArtifactKey; envelope: StoredEnvelope }> = [];
  errors: Array<{ key: ArtifactKey; envelope: StoredErrorEnvelope }> = [];
  async putEnvelope(key: ArtifactKey, envelope: StoredEnvelope) {
    this.envelopes.push({ key, envelope });
    return `s3://test-bucket/generated/${key.experienceId}/video_v2/attempt-${key.attempt}.json`;
  }
  async putErrorEnvelope(key: ArtifactKey, envelope: StoredErrorEnvelope) {
    this.errors.push({ key, envelope });
    return `s3://test-bucket/generated/${key.experienceId}/video_v2/attempt-${key.attempt}.error.json`;
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
const videoV2Body = (extra: Record<string, unknown> = {}) => ({
  experience_id: "cexp_01TEST",
  artifact_type: "video_v2",
  attempt: 1,
  learning_context: LEARNING_CONTEXT_GIT,
  ...extra,
});

// ---- Happy path ------------------------------------------------------

test("generates video_v2 -> 200; content is a valid video/v2 spec; alchemy fills the hashes", async () => {
  const { app, store } = await appReturning(VALID_CONTENT.video_v2);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 200, res.body);
  const json = res.json();
  assert.equal(json.artifact_type, "video_v2");
  assert.equal(json.schema_version, "video/v2");
  assert.match(json.s3_pointer, /\/video_v2\/attempt-1\.json$/);

  const spec = json.content;
  assert.notEqual(spec.spec_hash, "sha256:" + "0".repeat(64));
  assert.equal(spec.spec_hash, specHash(spec));
  for (const b of spec.beats) {
    assert.equal(b.narration_hash, narrationHash(b.narration, spec.voice), `beat ${b.id}`);
  }
  assert.equal(store.envelopes.length, 1);
  await app.close();
});

test("video_v2 preview is the derived flat script_outline (CD-10), covering all REQUIRED stages", async () => {
  const { app } = await appReturning(VALID_CONTENT.video_v2);
  const res = await authedPost(app, videoV2Body());
  const preview = res.json().preview;
  assert.ok(Array.isArray(preview.script_outline));
  const joined = preview.script_outline.join(" | ");
  for (const label of ["Problem:", "Curiosity:", "Context/Mental Model:", "Investigation/Demonstration:", "Decision:", "Best Practice:"]) {
    assert.ok(joined.includes(label), `outline has "${label}"`);
  }
  assert.ok(!joined.includes("Title:"));
  await app.close();
});

// ---- self-check: entities/relationships/events wiring --------------

test("architecture relationship pointing at an undeclared entity id -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  (arch.visual as { relationships: Array<Record<string, unknown>> }).relationships.push({ from_id: "commit-1", to_id: "no-such-entity" });
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /not a declared entity/);
  await app.close();
});

test("duplicate entity id within one beat -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  const entities = (arch.visual as { entities: Array<Record<string, unknown>> }).entities;
  entities.push({ ...entities[0]! });
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /duplicate entity id/);
  await app.close();
});

test("investigation event target pointing at an undeclared entity id -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const inv = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation")!;
  (inv.visual as { events: Array<Record<string, unknown>> }).events.push({ t: 5, type: "fail", target: "no-such-entity" });
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /event target .* not a declared entity/);
  await app.close();
});

test("investigation container beat with non-empty narration -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const container = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation")!;
  container.narration = "this should be empty";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /container/);
  await app.close();
});

test("investigation segment pointing at a non-container of_container -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const seg = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation_segment")!;
  (seg.visual as { of_container: string }).of_container = "beat-02-problem";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  await app.close();
});

test("architecture entity in the unsafe margin (schema-valid but too close to the edge) -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  (arch.visual as { entities: Array<Record<string, unknown>> }).entities[0]!.x = 1905; // < 1920 (schema ok) but > the 1880 safe limit
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /outside the safe/);
  await app.close();
});

// ---- self-check: stage coverage reused unmodified -------------------

test("video_v2 missing a REQUIRED stage -> generation_failed via the (shared, unmodified) stage-coverage lib", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  bad.beats = (bad.beats as Array<Record<string, unknown>>).filter((b) => b.stage !== "decision");
  const { app, store } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "generation_failed");
  assert.match(res.json().error.message, /stage coverage|decision/i);
  assert.equal(store.errors.length, 1);
  await app.close();
});

test("stageCoverage: standard video_v2 with all REQUIRED stages is ok (shared lib, unmodified for v2)", () => {
  const r = stageCoverage(VALID_CONTENT.video_v2);
  assert.equal(r.ok, true, r.notes.join("; "));
  assert.equal(r.durationClass, "standard");
  const required = r.rows.filter((row) => row.tier === "REQUIRED");
  assert.ok(required.every((row) => row.present));
});

// ---- self-check: duration-sum reuse (same formula as v1) ------------

test("sum-of-durations check excludes the investigation container (no double count)", () => {
  const spec = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  for (const b of spec.beats as Array<Record<string, unknown>>) {
    b.narration_hash = narrationHash(String(b.narration ?? ""), spec.voice);
  }
  spec.spec_hash = specHash(spec as never);
  const r = selfCheck("video_v2", spec);
  assert.ok(r.ok, r.errors.join("; "));
});

test("selfCheck's sum-of-durations check flags a WAY off estimate", () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  for (const b of bad.beats as Array<Record<string, unknown>>) {
    b.narration_hash = narrationHash(String(b.narration ?? ""), bad.voice);
  }
  bad.spec_hash = specHash(bad as never);
  bad.estimated_duration_minutes = 30;
  const r = selfCheck("video_v2", bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /target_duration_sec|within 15/);
});

test("a wildly wrong model-supplied estimated_duration_minutes no longer fails generation - alchemy recomputes it (shared with v1)", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  bad.estimated_duration_minutes = 30;
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 200, res.body);
  const returned = res.json().content.estimated_duration_minutes as number;
  assert.ok(Math.abs(returned - 30) > 1, "the model's wrong value was NOT what got returned");
  await app.close();
});

// ---- request validation ----------------------------------------------

test("video_v2 with format screencast -> generation_failed (still animated-explainer only)", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  bad.format = "screencast";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  await app.close();
});

test("artifact_type video_v2 is NOT part of the frozen v1.3 V1_ARTIFACT_TYPES enum but is still accepted", async () => {
  const { app } = await appReturning(VALID_CONTENT.video_v2);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 200, res.body);
  await app.close();
});

// ---- the key structural regression guard: zero K8s vocabulary --------

// This is the actual bug the video/v2 migration fixes: v1's architecture and
// investigation visual kinds were lifted directly from one hand-built
// Kubernetes/GPU-autoscaling reference video, causing unrelated-topic videos
// to be able to render Kubernetes visuals. This test asserts the v2 JSON
// Schema's own enum values contain none of that vocabulary anywhere, as a
// structural guard against reintroducing the coupling.
test("video/v2 schema enums contain NO Kubernetes/GPU-specific vocabulary anywhere", () => {
  const serialized = JSON.stringify(VIDEO_SCHEMA_V2);
  const banned = [
    "pod_count",
    "gpu_pct",
    "queue_depth",
    "pending_pods",
    "resolved_pods",
    "node_kind",
    "karpenter",
    "keda",
    '"pod"',
    '"gpu"',
    '"alb"',
    '"scheduler"',
  ];
  for (const term of banned) {
    assert.ok(!serialized.includes(term), `video/v2 schema must not contain "${term}"`);
  }
});

test("video/v2's ENTITY_CATEGORY and EVENT_TYPE enums are genuinely domain-neutral (rendering shapes / mechanism verbs, not K8s nouns)", () => {
  const props = (VIDEO_SCHEMA_V2 as unknown as { properties: { beats: { items: { properties: { visual: { properties: Record<string, unknown> } } } } } })
    .properties.beats.items.properties.visual.properties;
  const entityCategory = (props.entities as { items: { properties: { category: { enum: string[] } } } }).items.properties.category.enum;
  assert.deepEqual(
    [...entityCategory].sort(),
    ["actor", "boundary", "datastore", "external", "policy", "process", "queue", "service"].sort(),
  );
  const eventType = (props.events as { items: { properties: { type: { enum: string[] } } } }).items.properties.type.enum;
  for (const banned of ["scale_pods", "gpu_saturate", "kubectl", "pod_pending"]) {
    assert.ok(!eventType.includes(banned));
  }
});

// ---- mobile-readability density checks (new) --------------------------

test("on_screen_caption over the mobile-readability character limit -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const beat = (bad.beats as Array<Record<string, unknown>>).find((b) => b.id === "beat-02-problem")!;
  beat.on_screen_caption =
    "This is a deliberately long on-screen caption that reproduces far too much of the narration and should trip the mobile-readability density limit for on_screen_caption.";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /on_screen_caption.*mobile-readability|mobile-readability.*on_screen_caption/);
  await app.close();
});

test("on_screen_caption is optional — a beat that omits it still passes", () => {
  const spec = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const beat = (spec.beats as Array<Record<string, unknown>>).find((b) => b.id === "beat-02-problem")!;
  delete beat.on_screen_caption;
  for (const b of spec.beats as Array<Record<string, unknown>>) {
    b.narration_hash = narrationHash(String(b.narration ?? ""), spec.voice);
  }
  spec.spec_hash = specHash(spec as never);
  const r = selfCheck("video_v2", spec);
  assert.ok(r.ok, r.errors.join("; "));
});

test("architecture beat with more than 6 entities -> generation_failed (split into sequential beats instead)", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  const entities = (arch.visual as { entities: Array<Record<string, unknown>> }).entities;
  for (let i = 0; i < 5; i++) {
    entities.push({ id: `extra-${i}`, category: "process", label: `Extra ${i}`, x: 200 + i * 100, y: 700 });
  }
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /density limit|split into sequential beats/);
  await app.close();
});

test("investigation beat with more than 6 entities -> generation_failed (split into sequential beats instead)", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const inv = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation")!;
  const entities = (inv.visual as { entities: Array<Record<string, unknown>> }).entities;
  for (let i = 0; i < 5; i++) {
    entities.push({ id: `extra-${i}`, category: "process", label: `Extra ${i}` });
  }
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /density limit|split into sequential beats/);
  await app.close();
});

test("architecture entity centered near the frame edge with a realistic node size -> generation_failed (bounding-box-aware margin)", async () => {
  const bad = structuredClone(VALID_CONTENT.video_v2) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  // 1800 is well inside the OLD 40px-margin check (1880 limit) but a 220px-wide
  // rendered node centered there would have its right edge at 1910, off the
  // 1920 canvas — the new bounding-box-aware margin (1770) must catch this.
  (arch.visual as { entities: Array<Record<string, unknown>> }).entities[0]!.x = 1800;
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoV2Body());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /outside the safe/);
  await app.close();
});
