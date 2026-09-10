import { test } from "node:test";
import assert from "node:assert/strict";
import { artifactKey, ddb, manifestKey, versionPrefix } from "./keys.js";

test("S3 prefix is deterministic, version-aware and human-readable", () => {
  const p = versionPrefix("aws", "FOUNDATION", "aws-global-infrastructure", "1.0.0");
  assert.equal(p, "aws/foundation/aws-global-infrastructure/1.0.0/");
  assert.equal(manifestKey(p), `${p}manifest.json`);
  assert.equal(artifactKey(p, "video/main.mp4"), `${p}video/main.mp4`);
});

test("artifact keys refuse traversal and absolute paths", () => {
  const p = versionPrefix("aws", "FOUNDATION", "x", "1.0.0");
  assert.throws(() => artifactKey(p, "../other/manifest.json"));
  assert.throws(() => artifactKey(p, "/etc/passwd"));
});

test("DynamoDB keys keep one experience in one partition, versions sorted", () => {
  assert.equal(ddb.experiencePk("x"), "EXP#x");
  assert.equal(ddb.versionSk("1.2.3"), "VER#000001.000002.000003");
  assert.ok(ddb.versionSk("1.10.0") > ddb.versionSk("1.9.0"));
  assert.ok(ddb.artifactSk("1.0.0", "quiz").startsWith(ddb.versionSk("1.0.0")));
  assert.ok(ddb.skillEdgeSk("1.0.0", "TAUGHT", "aws-regions").startsWith(ddb.versionSk("1.0.0")));
  assert.equal(ddb.gsi2SkillEdgePk("aws-regions"), "SKILL#aws-regions");
});
