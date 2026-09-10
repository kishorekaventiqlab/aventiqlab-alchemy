import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSemver, isSemver, padSemver, parseSemver, unpadSemver } from "./semver.js";

test("parses and rejects semver", () => {
  assert.deepEqual(parseSemver("1.2.3"), { major: 1, minor: 2, patch: 3 });
  assert.ok(isSemver("0.0.1"));
  assert.ok(!isSemver("1.2"));
  assert.ok(!isSemver("01.2.3"));
  assert.ok(!isSemver("1.2.3-beta"));
  assert.throws(() => parseSemver("v1.2.3"));
});

test("compare orders numerically, not lexically", () => {
  assert.ok(compareSemver("1.10.0", "1.9.0") > 0);
  assert.ok(compareSemver("2.0.0", "1.99.99") > 0);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
});

test("padded form sorts like semver and round-trips", () => {
  const versions = ["1.10.0", "1.9.0", "2.0.0", "0.0.1"];
  const sorted = [...versions].sort((a, b) => padSemver(a).localeCompare(padSemver(b)));
  assert.deepEqual(sorted, ["0.0.1", "1.9.0", "1.10.0", "2.0.0"]);
  assert.equal(unpadSemver(padSemver("1.10.0")), "1.10.0");
  assert.throws(() => padSemver("1000000.0.0"));
});
