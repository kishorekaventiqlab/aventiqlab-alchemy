import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken } from "../test-helpers.js";
import { LEARNING_CONTEXT, VALID_CONTENT } from "./fixtures.js";
import { selfCheck } from "./selfcheck.js";
import { deriveScriptOutline } from "./preview.js";
import { narrationHash, specHash } from "./video-hash.js";
import { stageCoverage } from "../lib/video-stage-coverage.js";
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
    return `s3://test-bucket/generated/${key.experienceId}/video/attempt-${key.attempt}.json`;
  }
  async putErrorEnvelope(key: ArtifactKey, envelope: StoredErrorEnvelope) {
    this.errors.push({ key, envelope });
    return `s3://test-bucket/generated/${key.experienceId}/video/attempt-${key.attempt}.error.json`;
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
const videoBody = (extra: Record<string, unknown> = {}) => ({
  experience_id: "cexp_01TEST",
  artifact_type: "video",
  attempt: 1,
  learning_context: LEARNING_CONTEXT,
  ...extra,
});

// ---- Happy path ------------------------------------------------------

test("generates video -> 200; content is a valid video/v1 spec; alchemy fills the hashes", async () => {
  const { app, store } = await appReturning(VALID_CONTENT.video);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 200, res.body);
  const json = res.json();
  assert.equal(json.artifact_type, "video");
  assert.equal(json.schema_version, "video/v1");
  assert.match(json.s3_pointer, /\/video\/attempt-1\.json$/);

  const spec = json.content;
  // hashes were computed by alchemy, not the placeholder from the fixture
  assert.notEqual(spec.spec_hash, "sha256:" + "0".repeat(64));
  assert.equal(spec.spec_hash, specHash(spec));
  for (const b of spec.beats) {
    assert.equal(b.narration_hash, narrationHash(b.narration, spec.voice), `beat ${b.id}`);
  }
  // stored envelope carries the same
  assert.equal(store.envelopes.length, 1);
  await app.close();
});

test("video preview is the derived flat script_outline (CD-10), not a per-beat object", async () => {
  const { app } = await appReturning(VALID_CONTENT.video);
  const res = await authedPost(app, videoBody());
  const preview = res.json().preview;
  assert.ok(Array.isArray(preview.script_outline));
  assert.ok(preview.script_outline.every((l: unknown) => typeof l === "string"));
  // one line per REQUIRED stage present in the fixture
  const joined = preview.script_outline.join(" | ");
  for (const label of ["Problem:", "Curiosity:", "Context/Mental Model:", "Investigation/Demonstration:", "Decision:", "Best Practice:"]) {
    assert.ok(joined.includes(label), `outline has "${label}"`);
  }
  // NOT present: the title beat (stage: null) contributes no line
  assert.ok(!joined.includes("Title:"));
  await app.close();
});

// ---- spec_hash dedup semantics (OQ-6) ------------------------------

test("spec_hash is stable when only a timing estimate changes", () => {
  const a = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const b = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  (b.beats as Array<Record<string, unknown>>)[1]!.target_duration_sec = 999;
  b.estimated_duration_minutes = 47;
  assert.equal(specHash(a as never), specHash(b as never), "timing-only change must not move spec_hash");
});

test("spec_hash moves when narration changes", () => {
  const a = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const b = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  (b.beats as Array<Record<string, unknown>>)[1]!.narration = "totally different words";
  assert.notEqual(specHash(a as never), specHash(b as never));
});

// ---- narration_hash formula (nit 2) --------------------------------

test("narration_hash matches the pinned formula for the empty-narration case", () => {
  const voice = { provider: "chatterbox-v3", voice_id: "default", params: { exaggeration: 0.5, cfg_weight: 0.5 } };
  // input = "" + "\n" + canonical(voice)
  const h = narrationHash("", voice);
  assert.match(h, /^sha256:[0-9a-f]{64}$/);
  // reordering the voice keys must not change the hash (canonical JSON)
  const reordered = { params: { cfg_weight: 0.5, exaggeration: 0.5 }, voice_id: "default", provider: "chatterbox-v3" };
  assert.equal(narrationHash("", reordered), h);
});

// ---- self-check: stage coverage -----------------------------------

test("video missing a REQUIRED stage -> generation_failed via the stage-coverage lib", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  // drop the decision beat
  bad.beats = (bad.beats as Array<Record<string, unknown>>).filter((b) => b.stage !== "decision");
  const { app, store } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  assert.equal(res.json().error.code, "generation_failed");
  assert.match(res.json().error.message, /stage coverage|decision/i);
  assert.equal(store.errors.length, 1); // CD-2 trail
  await app.close();
});

test("video with stages out of canonical order -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const beats = bad.beats as Array<Record<string, unknown>>;
  // swap problem and decision stage labels so order is violated
  const p = beats.find((b) => b.stage === "problem")!;
  const d = beats.find((b) => b.stage === "decision")!;
  p.stage = "decision";
  d.stage = "problem";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  await app.close();
});

// ---- self-check: on_screen <-> visual cross-match (AL8 §1.6) ------

test("video beat whose on_screen contradicts its visual.kind -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  arch.on_screen = "A person talking to camera about autoscaling."; // no diagram/node/arrow terms
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /on_screen/);
  await app.close();
});

test("video architecture node in the unsafe margin (schema-valid but too close to the edge) -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  (arch.visual as { nodes: Array<Record<string, unknown>> }).nodes[0]!.x = 1905; // < 1920 (schema ok) but > the 1880 safe limit
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /outside the safe/);
  await app.close();
});

// ---- self-check: investigation wiring ----------------------------

test("investigation container beat with non-empty narration -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const container = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation")!;
  container.narration = "this should be empty";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /container/);
  await app.close();
});

test("investigation segment pointing at a non-container of_container -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const seg = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation_segment")!;
  (seg.visual as { of_container: string }).of_container = "beat-02-problem";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  await app.close();
});

// ---- self-check: sum-of-durations, container excluded ------------

test("sum-of-durations check excludes the investigation container (no double count)", () => {
  // The fixture's estimated_duration_minutes = 2 (120s). Segment + statement
  // targets sum to ~123s; the container's 40s must NOT be added on top.
  const spec = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  for (const b of spec.beats as Array<Record<string, unknown>>) {
    b.narration_hash = narrationHash(String(b.narration ?? ""), spec.voice);
  }
  spec.spec_hash = specHash(spec as never);
  const r = selfCheck("video", spec);
  assert.ok(r.ok, r.errors.join("; "));
});

test("sum-of-durations WAY off estimate -> generation_failed", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  bad.estimated_duration_minutes = 30; // 1800s vs ~123s of beats
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error.message, /target_duration_sec|within 15/);
  await app.close();
});

// ---- request validation -----------------------------------------

test("video with format screencast -> generation_failed (OQ-1: v1 is animated-explainer only)", async () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  bad.format = "screencast";
  const { app } = await appReturning(bad);
  const res = await authedPost(app, videoBody());
  assert.equal(res.statusCode, 502); // schema `format: {const: "animated-explainer"}`
  await app.close();
});

// ---- the shared stage-coverage lib directly ---------------------

test("stageCoverage: standard video with all REQUIRED stages is ok", () => {
  const r = stageCoverage(VALID_CONTENT.video);
  assert.equal(r.ok, true, r.notes.join("; "));
  assert.equal(r.durationClass, "standard");
  const required = r.rows.filter((row) => row.tier === "REQUIRED");
  assert.ok(required.every((row) => row.present));
});

test("stageCoverage: structured output, not a bare bool (astra's condition b)", () => {
  const r = stageCoverage({ target_duration_class: "standard", beats: [{ stage: "problem" }] });
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.rows));
  const decision = r.rows.find((row) => row.stage === "decision")!;
  assert.deepEqual({ stage: decision.stage, present: decision.present, tier: decision.tier }, {
    stage: "decision",
    present: false,
    tier: "REQUIRED",
  });
  assert.ok(r.notes.length > 0, "has notes for astra's re-prompt");
});

test("stageCoverage: a short video needs only the minimum signature", () => {
  const short = {
    target_duration_class: "short",
    beats: [{ stage: "problem" }, { stage: "curiosity" }, { stage: "investigation_demonstration" }, { stage: "best_practice" }],
  };
  assert.equal(stageCoverage(short).ok, true);
});

// ---- deriveScriptOutline unit ----------------------------------

test("deriveScriptOutline collapses a multi-beat stage to one line and skips stage-less beats", () => {
  const beats = [
    { stage: null, narration: "silent title" },
    { stage: "context_mental_model", narration: "First part of the model. More text here." },
    { stage: "context_mental_model", narration: "Second part of the model." },
    { stage: "best_practice", narration: "Check node capacity first." },
  ];
  const outline = deriveScriptOutline(beats);
  assert.equal(outline.length, 2);
  assert.equal(outline[0], "Context/Mental Model: First part of the model.");
  assert.equal(outline[1], "Best Practice: Check node capacity first.");
});
