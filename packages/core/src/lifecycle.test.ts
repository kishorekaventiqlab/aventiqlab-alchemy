import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTransition, canTransition, isImmutable, LifecycleError } from "./lifecycle.js";

test("published versions are immutable and can only be archived", () => {
  assert.ok(isImmutable("PUBLISHED"));
  assert.ok(isImmutable("ARCHIVED"));
  assert.ok(!isImmutable("DRAFT"));
  assert.ok(canTransition("PUBLISHED", "ARCHIVED"));
  assert.ok(!canTransition("PUBLISHED", "DRAFT"));
  assert.ok(!canTransition("ARCHIVED", "PUBLISHED"));
});

test("MVP allows publish straight from draft, and review states round-trip", () => {
  assert.ok(canTransition("DRAFT", "PUBLISHED"));
  assert.ok(canTransition("DRAFT", "SUBMITTED"));
  assert.ok(canTransition("SUBMITTED", "APPROVED"));
  assert.ok(canTransition("APPROVED", "DRAFT"));
  assert.throws(() => assertTransition("ARCHIVED", "DRAFT"), LifecycleError);
});
