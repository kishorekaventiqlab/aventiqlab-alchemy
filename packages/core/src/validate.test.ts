import { test } from "node:test";
import assert from "node:assert/strict";
import { validManifest } from "./__fixtures__/manifest.js";
import { referencedSkillIds, validateManifest, validateSkill } from "./validate.js";

const messages = (r: { issues: { path: string; message: string }[] }) => r.issues.map((i) => `${i.path}: ${i.message}`);

test("the fixture manifest is valid", () => {
  const r = validateManifest(validManifest());
  assert.deepEqual(messages(r), []);
  assert.ok(r.manifest);
});

test("schema rejects bad ids, versions and unknown fields", () => {
  const m = validManifest() as unknown as Record<string, unknown>;
  m.experienceId = "AWS Global";
  m.version = "1.0";
  m.bogus = 1;
  const r = validateManifest(m);
  assert.ok(!r.ok);
  assert.ok(messages(r).some((s) => s.startsWith("/experienceId")));
  assert.ok(messages(r).some((s) => s.startsWith("/version")));
  assert.ok(messages(r).some((s) => s.includes("bogus")));
});

test("artifact folder must match kind and ids/paths must be unique", () => {
  const m = validManifest();
  m.artifacts.push({ artifactId: "quiz", kind: "reading", path: "video/dup.md", contentType: "text/markdown" });
  m.artifacts.push({ artifactId: "another", kind: "asset", path: "video/main.mp4", contentType: "video/mp4" });
  const r = validateManifest(m);
  const msgs = messages(r);
  assert.ok(msgs.some((s) => s.includes('duplicate artifactId "quiz"')));
  assert.ok(msgs.some((s) => s.includes('must live under "reading/"')));
  assert.ok(msgs.some((s) => s.includes('duplicate path "video/main.mp4"')));
});

test("completion and mastery criteria must reference real artifacts of the right kind", () => {
  const m = validManifest();
  m.completionCriteria.requiredArtifactIds.push("nope");
  m.completionCriteria.quiz = { artifactId: "reading-main", passingScorePercent: 50 };
  m.masteryCriteria.evaluator = { artifactId: "quiz", minimumLevel: "knowledge" };
  m.masteryCriteria.evidenceRequired = ["arena"];
  const msgs = messages(validateManifest(m));
  assert.ok(msgs.some((s) => s.includes('unknown artifactId "nope"')));
  assert.ok(msgs.some((s) => s.includes('must be kind "quiz"')));
  assert.ok(msgs.some((s) => s.includes('must be kind "skill-evaluator"')));
  assert.ok(msgs.some((s) => s.includes('evidence "arena" requires an artifact of kind "arena"')));
});

test("skill cross-references are checked", () => {
  const m = validManifest();
  m.skills.required.push({ skillId: "aws-regions", minimumLevel: "exposure" });
  m.skills.assessed.push({ skillId: "availability-zones", level: "knowledge", evidence: ["evaluator"] });
  m.learningObjectives.push({ id: "lo-2", statement: "Something about an undeclared skill here.", skillIds: ["ghost"] });
  m.prerequisites.push({ experienceId: "aws-global-infrastructure" });
  const msgs = messages(validateManifest(m));
  assert.ok(msgs.some((s) => s.includes("both required and taught")));
  assert.ok(msgs.some((s) => s.includes('evidence "evaluator" requires an artifact of kind "skill-evaluator"')));
  assert.ok(msgs.some((s) => s.includes('skill "ghost" is not declared')));
  assert.ok(msgs.some((s) => s.includes("own prerequisite")));
});

test("referencedSkillIds is the sorted union of all sections", () => {
  assert.deepEqual(referencedSkillIds(validManifest()), ["availability-zones", "aws-regions", "cloud-computing-basics"]);
});

test("skills validate structurally and semantically", () => {
  const ok = validateSkill({
    skillId: "aws-regions",
    name: "AWS Regions",
    domain: "aws",
    description: "What a Region is, how Regions differ, and how to choose one.",
    parentSkill: "aws-global-infrastructure",
    competencyLevels: [{ level: "exposure", descriptor: "Can say what a Region is." }],
    assessmentDimensions: ["KNOW"],
  });
  assert.deepEqual(messages(ok), []);
  const bad = validateSkill({
    skillId: "x",
    name: "Self-parented skill",
    domain: "aws",
    description: "A skill that is its own parent, which is wrong.",
    parentSkill: "x",
    competencyLevels: [
      { level: "exposure", descriptor: "dup dup dup dup" },
      { level: "exposure", descriptor: "dup dup dup dup" },
    ],
    assessmentDimensions: ["KNOW"],
    status: "DEPRECATED",
  });
  const msgs = messages(bad);
  assert.ok(msgs.some((s) => s.includes("own parent")));
  assert.ok(msgs.some((s) => s.includes("duplicate competency level")));
  assert.ok(msgs.some((s) => s.includes("replacement")));
});
