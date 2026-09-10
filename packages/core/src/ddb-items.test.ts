import { test } from "node:test";
import assert from "node:assert/strict";
import { validManifest } from "./__fixtures__/manifest.js";
import { artifactItems, contentHash, publicationItem, skillEdgeItems, skillItem, toArtifactRef, versionItem } from "./ddb-items.js";
import { versionPrefix } from "./keys.js";

const now = "2026-09-10T12:00:00.000Z";

test("version + artifact + edge items share the experience partition and the version SK prefix", () => {
  const m = validManifest();
  const prefix = versionPrefix(m.domain, m.level, m.experienceId, m.version);
  const digests = m.artifacts.map((a) => ({ artifactId: a.artifactId, sha256: "0".repeat(64), sizeBytes: 10 }));
  const v = versionItem(m, { s3Prefix: prefix, manifestSha256: "ab", manifestSizeBytes: 2, digests, now, actor: "publisher" });
  assert.equal(v.status, "DRAFT");
  assert.match(v.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(contentHash("ab", [...digests].reverse()), v.contentHash, "content hash is order-independent");
  assert.notEqual(contentHash("ac", digests), v.contentHash);
  assert.equal(v.statusHistory[0]?.to, "DRAFT");
  assert.deepEqual(v.skillIds, ["availability-zones", "aws-regions", "cloud-computing-basics"]);

  const arts = artifactItems(m, digests, prefix, now);
  assert.equal(arts.length, 3);
  for (const a of arts) {
    assert.equal(a.PK, v.PK);
    assert.ok(a.SK.startsWith(`${v.SK}#ART#`));
    assert.ok(a.s3Key.startsWith(prefix));
  }
  assert.equal(toArtifactRef(arts[0]!).urlPath, "/experiences/aws-global-infrastructure/versions/1.0.0/artifacts/video-main/url");

  const edges = skillEdgeItems(m, "PUBLISHED", now);
  assert.equal(edges.length, 4);
  assert.deepEqual(
    edges.map((e) => e.relation).sort(),
    ["ASSESSED", "REQUIRED", "TAUGHT", "TAUGHT"],
  );
  assert.equal(edges[0]?.GSI2PK, "SKILL#aws-regions");
});

test("missing digest is an error, not a silent hole", () => {
  const m = validManifest();
  assert.throws(() => artifactItems(m, [], "p/", now), /missing digest/);
});

test("skill items index by domain and by parent", () => {
  const s = skillItem(
    {
      skillId: "aws-regions",
      name: "AWS Regions",
      domain: "aws",
      description: "What a Region is and how to choose one.",
      parentSkill: "aws-global-infrastructure",
      competencyLevels: [{ level: "exposure", descriptor: "Can say what a Region is." }],
      assessmentDimensions: ["KNOW"],
    },
    now,
  );
  assert.equal(s.GSI1SK, "aws#aws-regions");
  assert.equal(s.GSI2PK, "SKILLPARENT#aws-global-infrastructure");
});

test("publication items record the transition", () => {
  const p = publicationItem({ experienceId: "x", version: "1.0.0", from: "DRAFT", to: "PUBLISHED", actor: "publisher", now, artifactCount: 3, totalBytes: 30 });
  assert.equal(p.SK, `PUB#${now}#000001.000000.000000`);
  assert.equal(p.to, "PUBLISHED");
});
