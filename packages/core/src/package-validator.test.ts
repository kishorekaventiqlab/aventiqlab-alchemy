import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackage } from "./package-validator.js";

const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content/aws-global-infrastructure");

test("the shipped sample package validates cleanly", async () => {
  const r = await validatePackage(SAMPLE);
  assert.deepEqual(r.issues, []);
  assert.ok(r.ok);
  assert.equal(r.manifest?.experienceId, "aws-global-infrastructure");
  assert.equal(r.artifacts.length, r.manifest?.artifacts.length);
  for (const a of r.artifacts) {
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
    assert.ok(a.sizeBytes > 0);
  }
  assert.ok(r.manifestDigest && r.manifestDigest.sizeBytes > 0);
  // sample ships every skill it references except the external prerequisite skill
  const shipped = new Set(r.skills.map((s) => s.skillId));
  assert.ok(shipped.has("aws-regions"));
  assert.deepEqual(
    r.warnings.map((w) => w.path),
    ["skills/cloud-computing-basics.json"],
  );
});

test("a missing required artifact and a broken quiz are reported by path", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "alchemy-pkg-"));
  try {
    await cp(SAMPLE, dir, { recursive: true });
    await rm(path.join(dir, "reading/aws-global-infrastructure.md"));
    const quizPath = path.join(dir, "quiz/quiz.json");
    const quiz = JSON.parse(await (await import("node:fs/promises")).readFile(quizPath, "utf8"));
    quiz.questions[0].correctOptionIds = ["z"];
    await writeFile(quizPath, JSON.stringify(quiz));
    const r = await validatePackage(dir);
    assert.ok(!r.ok);
    const msgs = r.issues.map((i) => `${i.path}: ${i.message}`);
    assert.ok(msgs.some((s) => s.startsWith("reading/aws-global-infrastructure.md: required artifact file not found")));
    assert.ok(msgs.some((s) => s.includes('quiz/quiz.json/questions/0/correctOptionIds: unknown option "z"')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a package without manifest.json fails fast", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "alchemy-empty-"));
  try {
    const r = await validatePackage(dir);
    assert.ok(!r.ok);
    assert.equal(r.issues[0]?.path, "manifest.json");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
