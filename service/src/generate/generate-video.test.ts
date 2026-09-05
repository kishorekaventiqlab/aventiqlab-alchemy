/**
 * video/v1's schema/self-check/hash formulas are frozen but NO LONGER
 * REACHABLE via a live POST /v1/generate call — "video" now routes to v2
 * internally for new generations (validate-request.ts's
 * resolveInternalType), so a real HTTP request with artifact_type: "video"
 * produces video/v2 content today, not video/v1 (see
 * generate-video-v2.test.ts for that live-route behavior, and
 * generator-routing.test.ts for the routing/resolution change itself).
 *
 * These tests instead exercise checkVideo()/VIDEO_SCHEMA/the hash formulas
 * DIRECTLY (unit-level, not through the HTTP route), since that logic must
 * stay correct for RENDERING already-stored video/v1 content — its
 * schema_version is baked in at generation time and never revisited — even
 * though nothing generates fresh v1 content anymore.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { VALID_CONTENT } from "./fixtures.js";
import { selfCheck } from "./selfcheck.js";
import { derivePreview, deriveScriptOutline } from "./preview.js";
import { narrationHash, specHash } from "./video-hash.js";
import { stageCoverage } from "../lib/video-stage-coverage.js";

/** Mirrors generator.ts's fillVideoHashes — applied directly since these tests bypass generateArtifact entirely. */
function fillVideoHashes(spec: Record<string, unknown>): void {
  const voice = spec.voice ?? {};
  const beats = Array.isArray(spec.beats) ? (spec.beats as Array<Record<string, unknown>>) : [];
  for (const b of beats) {
    b.narration_hash = narrationHash(String(b.narration ?? ""), voice);
  }
  spec.spec_hash = specHash(spec as never);
}

// ---- Happy path ------------------------------------------------------

test("a valid video/v1 spec passes checkVideo() once alchemy's own hashes are filled in", () => {
  const spec = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  fillVideoHashes(spec);

  // hashes were computed by alchemy, not the placeholder from the fixture
  assert.notEqual(spec.spec_hash, "sha256:" + "0".repeat(64));
  assert.equal(spec.spec_hash, specHash(spec));
  for (const b of spec.beats as Array<Record<string, unknown>>) {
    assert.equal(b.narration_hash, narrationHash(String(b.narration), spec.voice));
  }

  const r = selfCheck("video", spec);
  assert.ok(r.ok, r.errors.join("; "));
});

test("video preview is the derived flat script_outline (CD-10), not a per-beat object", () => {
  const preview = derivePreview("video", VALID_CONTENT.video as unknown as Record<string, unknown>);
  assert.ok(Array.isArray(preview.script_outline));
  assert.ok((preview.script_outline as unknown[]).every((l: unknown) => typeof l === "string"));
  // one line per REQUIRED stage present in the fixture
  const joined = (preview.script_outline as string[]).join(" | ");
  for (const label of ["Problem:", "Curiosity:", "Context/Mental Model:", "Investigation/Demonstration:", "Decision:", "Best Practice:"]) {
    assert.ok(joined.includes(label), `outline has "${label}"`);
  }
  // NOT present: the title beat (stage: null) contributes no line
  assert.ok(!joined.includes("Title:"));
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

test("video missing a REQUIRED stage -> checkVideo() fails via the stage-coverage lib", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  // drop the decision beat
  bad.beats = (bad.beats as Array<Record<string, unknown>>).filter((b) => b.stage !== "decision");
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /stage coverage|decision/i);
});

test("video with stages out of canonical order -> checkVideo() fails", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const beats = bad.beats as Array<Record<string, unknown>>;
  // swap problem and decision stage labels so order is violated
  const p = beats.find((b) => b.stage === "problem")!;
  const d = beats.find((b) => b.stage === "decision")!;
  p.stage = "decision";
  d.stage = "problem";
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
});

// ---- self-check: on_screen <-> visual cross-match (AL8 §1.6) ------

test("video beat whose on_screen contradicts its visual.kind -> checkVideo() fails", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  arch.on_screen = "A person talking to camera about autoscaling."; // no "architecture" anchor word
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /on_screen/);
});

test("video architecture node in the unsafe margin (schema-valid but too close to the edge) -> checkVideo() fails", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const arch = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "architecture")!;
  (arch.visual as { nodes: Array<Record<string, unknown>> }).nodes[0]!.x = 1905; // < 1920 (schema ok) but > the 1880 safe limit
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /outside the safe/);
});

// ---- self-check: investigation wiring ----------------------------

test("investigation container beat with non-empty narration -> checkVideo() fails", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const container = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation")!;
  container.narration = "this should be empty";
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /container/);
});

test("investigation segment pointing at a non-container of_container -> checkVideo() fails", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  const seg = (bad.beats as Array<Record<string, unknown>>).find((b) => (b.visual as { kind?: string }).kind === "investigation_segment")!;
  (seg.visual as { of_container: string }).of_container = "beat-02-problem";
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
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

// selfCheck's own duration-drift detection, tested directly: generator.ts's
// fillVideoEstimatedDuration overwrites estimated_duration_minutes
// server-side before selfCheck ever runs — exercised at the HTTP level via
// generate-video-v2.test.ts's "shared with v1" test (that recompute gate,
// `internalType === "video" || internalType === "video_v2"`, applies
// identically to both schema versions, and "video" is the only live route
// today). This test pins the corresponding unit-level guarantee: checkVideo()'s
// own duration-sum check still does real work independent of the recompute,
// same pattern as the "excludes the investigation container" test above.
test("selfCheck's sum-of-durations check flags a WAY off estimate", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  fillVideoHashes(bad);
  bad.estimated_duration_minutes = 30; // 1800s vs ~123s of beats
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /target_duration_sec|within 15/);
});

// ---- request validation -----------------------------------------

test("video with format screencast -> checkVideo() fails (OQ-1: v1 is animated-explainer only)", () => {
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  bad.format = "screencast";
  fillVideoHashes(bad);
  const r = selfCheck("video", bad);
  assert.equal(r.ok, false); // schema `format: {const: "animated-explainer"}`
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
