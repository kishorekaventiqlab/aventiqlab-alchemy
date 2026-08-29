import { test } from "node:test";
import assert from "node:assert/strict";
import { planReRender } from "./plan-rerender.js";
import { ServiceError } from "../errors/envelope.js";

test("cycle 1 (no feedback) -> synth everything", () => {
  assert.deepEqual(planReRender(1, null), { regenBeatIds: [], reuseAllAudio: false, tailBufferBumpSec: 0 });
  assert.deepEqual(planReRender(1, undefined), { regenBeatIds: [], reuseAllAudio: false, tailBufferBumpSec: 0 });
});

test("layout_bug -> render astra's edited spec with cached audio", () => {
  const p = planReRender(2, { category: "layout_bug" });
  assert.deepEqual(p, { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 0 });
});

test("pacing_issue -> reuse audio + bump the tail buffer", () => {
  const p = planReRender(3, { category: "pacing_issue" });
  assert.equal(p.reuseAllAudio, true);
  assert.equal(p.regenBeatIds.length, 0);
  assert.ok(p.tailBufferBumpSec > 0);
});

test("narration_flaw -> regenerate exactly the flagged beat", () => {
  const p = planReRender(2, { category: "narration_flaw", evidence: { beat_id: "beat-07-investigation" } });
  assert.deepEqual(p.regenBeatIds, ["beat-07-investigation"]);
  assert.equal(p.reuseAllAudio, false);
});

test("narration_flaw with no beat_id -> validation_failed", () => {
  assert.throws(
    () => planReRender(2, { category: "narration_flaw", evidence: {} }),
    (e: unknown) => e instanceof ServiceError && e.code === "validation_failed",
  );
});

test("content_flaw -> validation_failed (never re-renderable)", () => {
  assert.throws(
    () => planReRender(2, { category: "content_flaw" }),
    (e: unknown) => e instanceof ServiceError && e.code === "validation_failed",
  );
});

test("an unknown category -> validation_failed", () => {
  assert.throws(
    () => planReRender(2, { category: "gremlins" as never }),
    (e: unknown) => e instanceof ServiceError && e.code === "validation_failed",
  );
});

test("a 'pass' verdict on cycle > 1 -> harmless no-op re-render", () => {
  const p = planReRender(2, { category: "pass" });
  assert.deepEqual(p, { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 0 });
});
