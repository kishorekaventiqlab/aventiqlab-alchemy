import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCachePlan } from "./cache-plan.js";

const spec = {
  beats: [
    { id: "beat-01-title", narration: "", narration_hash: "sha256:t", visual: { kind: "title" } },
    { id: "beat-02-problem", narration: "It is slow.", narration_hash: "sha256:aa", visual: { kind: "statement" } },
    { id: "beat-03-inv", narration: "", narration_hash: "sha256:c", visual: { kind: "investigation" } },
    { id: "beat-03a-seg", narration: "At rest.", narration_hash: "sha256:bb", visual: { kind: "investigation_segment" } },
    { id: "beat-03b-seg", narration: "Full now.", narration_hash: "sha256:cc", visual: { kind: "investigation_segment" } },
    { id: "beat-04-decision", narration: "Do both.", narration_hash: "sha256:dd", visual: { kind: "statement" } },
  ],
};

test("narration units = audible beats + investigation segments; NOT container or silent title", () => {
  const plan = buildCachePlan(spec, []);
  assert.deepEqual(
    plan.units.map((u) => u.beatId).sort(),
    ["beat-02-problem", "beat-03a-seg", "beat-03b-seg", "beat-04-decision"],
  );
});

test("with no regen, every unit's narration_hash is cacheable", () => {
  const plan = buildCachePlan(spec, []);
  assert.deepEqual(plan.cacheableHashes.sort(), ["sha256:aa", "sha256:bb", "sha256:cc", "sha256:dd"]);
  assert.deepEqual(plan.forcedMissBeatIds, []);
});

test("a regenerated beat is a forced miss and drops out of cacheableHashes", () => {
  const plan = buildCachePlan(spec, ["beat-03b-seg"]);
  assert.deepEqual(plan.forcedMissBeatIds, ["beat-03b-seg"]);
  assert.ok(!plan.cacheableHashes.includes("sha256:cc"));
  assert.ok(plan.cacheableHashes.includes("sha256:bb"));
});

test("regenerating an id that isn't a narration unit is a no-op", () => {
  const plan = buildCachePlan(spec, ["beat-03-inv"]);
  assert.deepEqual(plan.forcedMissBeatIds, []);
});
