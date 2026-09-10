import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePackage, type PackageReport } from "@aventiqlab/alchemy-core/package-validator";
import type { RegisterVersionRequest, RegisterVersionResponse } from "@aventiqlab/alchemy-core";
import { FakeContentStore, FakeObjectStore } from "./fakes.js";
import { ApiError } from "./http.js";
import { AlchemyService, type Caller } from "./service.js";

const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content/aws-global-infrastructure");
const publisher: Caller = { scope: "publish", actor: "token:publish" };
const reader: Caller = { scope: "read", actor: "token:read" };

function fixedClock() {
  let t = Date.parse("2026-09-10T12:00:00.000Z");
  return { now: () => new Date((t += 1000)).toISOString() };
}

function makeService(objects = new FakeObjectStore(), store = new FakeContentStore()) {
  const svc = new AlchemyService(store, objects, { signedUrlTtlSec: 900, uploadUrlTtlSec: 3600, verifyHashMaxBytes: 1024 * 1024 }, fixedClock());
  return { svc, store, objects };
}

async function rejects(p: Promise<unknown>, status: number, code: string) {
  await assert.rejects(p, (e: unknown) => {
    assert.ok(e instanceof ApiError, `expected ApiError, got ${String(e)}`);
    assert.equal(e.status, status, `status ${e.status} (${e.code}: ${e.message})`);
    assert.equal(e.code, code);
    return true;
  });
}

/** Simulate the CLI: register, then PUT every file to the presigned key. */
async function registerAndUpload(svc: AlchemyService, objects: FakeObjectStore, report: PackageReport): Promise<RegisterVersionResponse> {
  const body: RegisterVersionRequest = {
    manifest: report.manifest!,
    artifacts: report.artifacts.map((a) => ({ artifactId: a.artifactId, sha256: a.sha256, sizeBytes: a.sizeBytes })),
    manifestDigest: report.manifestDigest!,
  };
  const res = await svc.registerVersion(report.manifest!.experienceId, body, publisher);
  for (const u of res.uploads) {
    const local = u.artifactId === "manifest" ? path.join(report.packageDir, "manifest.json") : report.artifacts.find((a) => a.artifactId === u.artifactId)!.absolutePath;
    objects.upload(u.key, await readFile(local), u.headers["content-type"]);
  }
  return res;
}

describe("desktop -> package -> validate -> publish -> deliver", () => {
  let report: PackageReport;
  before(async () => {
    report = await validatePackage(SAMPLE);
    assert.ok(report.ok, JSON.stringify(report.issues));
  });

  test("full happy path with the sample experience", async () => {
    const { svc, objects } = makeService();
    const id = report.manifest!.experienceId;

    // skills first (the CLI does this from skills/)
    for (const s of report.skills) await svc.upsertSkill(s.skillId, s, publisher);
    // the sample references one external prerequisite skill
    await svc.upsertSkill("cloud-computing-basics", {
      skillId: "cloud-computing-basics", name: "Cloud computing basics", domain: "cloud",
      description: "What cloud computing is: on-demand, pay-as-you-go, elastic resources.",
      competencyLevels: [{ level: "exposure", descriptor: "Can say what the cloud is in one sentence." }],
      assessmentDimensions: ["KNOW"],
    }, publisher);

    const reg = await registerAndUpload(svc, objects, report);
    assert.equal(reg.status, "DRAFT");
    assert.equal(reg.s3Prefix, `aws/foundation/${id}/1.0.0/`);
    assert.equal(reg.uploads.length, report.artifacts.length + 1);
    assert.ok(reg.uploads.every((u) => u.key.startsWith(reg.s3Prefix)));
    assert.ok(reg.uploads.some((u) => u.key === `${reg.s3Prefix}manifest.json`));

    // readers cannot see drafts
    await rejects(svc.getExperience(id, undefined, reader), 404, "not_found");
    assert.equal((await svc.listExperiences({}, reader)).items.length, 0);
    // publishers can preview them
    const draft = await svc.getExperience(id, "1.0.0", publisher);
    assert.equal(draft.version?.status, "DRAFT");

    const pub = await svc.publish({ experienceId: id, version: "1.0.0" }, publisher);
    assert.equal(pub.status, "PUBLISHED");
    assert.equal(pub.artifactCount, report.artifacts.length);
    assert.ok(pub.verified.every((v) => v.sha256Verified), "all sample files are under the hash threshold");
    assert.equal(pub.previousPublishedVersion, null);
    assert.ok(objects.objects.has(`${reg.s3Prefix}_publication.json`), "publication marker written next to the content");

    // the AventiqLab-facing read
    const exp = await svc.getExperience(id, undefined, reader);
    assert.equal(exp.experience.status, "PUBLISHED");
    assert.equal(exp.experience.latestPublishedVersion, "1.0.0");
    assert.equal(exp.version?.version, "1.0.0");
    assert.deepEqual(exp.version?.manifest.skills.taught.map((s) => s.skillId), ["aws-regions", "availability-zones", "edge-locations", "aws-accounts"]);
    assert.equal(exp.version?.manifest.prerequisites[0]?.experienceId, "cloud-computing-basics");
    assert.equal(exp.version?.manifest.learningObjectives.length, 4);
    assert.equal(exp.version?.artifacts.length, report.artifacts.length);
    assert.ok(exp.version?.artifacts.every((a) => a.urlPath.startsWith(`/experiences/${id}/versions/1.0.0/artifacts/`)));
    assert.equal(exp.links.content, `/experiences/${id}/content?version=1.0.0`);

    const content = await svc.getContent(id, undefined, undefined, reader);
    assert.equal(content.version, "1.0.0");
    assert.ok(content.artifacts.every((a) => a.url.includes("op=get") && a.expiresAt > "2026"));
    const video = content.artifacts.find((a) => a.kind === "video")!;
    assert.ok(video.url.endsWith(`${reg.s3Prefix}video/aws-global-infrastructure.mp4?X-Amz-Expires=900&op=get`));

    const one = await svc.getArtifactUrl(id, "1.0.0", "quiz-main", 60, reader);
    assert.ok(one.artifact.url.includes("X-Amz-Expires=60"));

    const list = await svc.listExperiences({ domain: "aws" }, reader);
    assert.equal(list.items.length, 1);
    assert.equal((await svc.listExperiences({ domain: "gcp" }, reader)).items.length, 0);
    assert.deepEqual((await svc.listVersions(id, reader)).items.map((v) => v.version), ["1.0.0"]);

    // the future ASTRA query
    const taughtBy = await svc.skillExperiences("aws-regions", "TAUGHT", reader);
    assert.deepEqual(taughtBy.items.map((i) => [i.experienceId, i.version, i.level]), [[id, "1.0.0", "knowledge"]]);
    const requires = await svc.skillExperiences("cloud-computing-basics", undefined, reader);
    assert.equal(requires.items[0]?.relation, "REQUIRED");
    const skills = await svc.listSkills({ domain: "aws" });
    assert.equal(skills.items.length, 5);
    assert.equal((await svc.getSkill("aws-regions")).skill.parentSkill, "aws-global-infrastructure");

    // immutability
    await rejects(svc.publish({ experienceId: id, version: "1.0.0" }, publisher), 409, "immutable_version");
    const sameDigests = report.artifacts.map((a) => ({ artifactId: a.artifactId, sha256: a.sha256, sizeBytes: a.sizeBytes }));
    await rejects(svc.registerVersion(id, { manifest: report.manifest, artifacts: sameDigests, manifestDigest: report.manifestDigest }, publisher), 409, "conflict");
    await rejects(svc.setVersionStatus(id, "1.0.0", { status: "DRAFT" }, publisher), 409, "conflict");

    // a new version must be greater, and stays invisible to readers until published
    const next = structuredClone(report);
    next.manifest!.version = "1.1.0";
    next.manifest!.changelog = "Clarified AZ naming.";
    await registerAndUpload(svc, objects, next);
    assert.equal((await svc.getExperience(id, undefined, reader)).version?.version, "1.0.0");
    assert.deepEqual((await svc.listVersions(id, publisher)).items.map((v) => v.version), ["1.0.0", "1.1.0"]);
    await svc.setVersionStatus(id, "1.1.0", { status: "SUBMITTED" }, publisher);
    await svc.setVersionStatus(id, "1.1.0", { status: "APPROVED", note: "LGTM" }, publisher);
    const pub2 = await svc.publish({ experienceId: id, version: "1.1.0" }, publisher);
    assert.equal(pub2.previousPublishedVersion, "1.0.0");
    assert.equal((await svc.getExperience(id, undefined, reader)).version?.version, "1.1.0");
    assert.deepEqual((await svc.getVersion(id, "1.1.0", reader)).statusHistory.map((h) => h.to), ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED"]);

    // archiving the latest rolls the pointer back
    await svc.setVersionStatus(id, "1.1.0", { status: "ARCHIVED" }, publisher);
    const after = await svc.getExperience(id, undefined, reader);
    assert.equal(after.experience.latestPublishedVersion, "1.0.0");
    await rejects(svc.getVersion(id, "1.1.0", reader), 404, "not_found");
    assert.equal((await svc.getVersion(id, "1.1.0", publisher)).status, "ARCHIVED");
  });

  test("publish refuses when uploads are missing or tampered", async () => {
    const { svc, objects } = makeService();
    for (const s of report.skills) await svc.upsertSkill(s.skillId, s, publisher);
    await svc.upsertSkill("cloud-computing-basics", { skillId: "cloud-computing-basics", name: "Cloud basics", domain: "cloud", description: "Baseline cloud vocabulary for beginners.", competencyLevels: [{ level: "exposure", descriptor: "Knows the term cloud computing." }], assessmentDimensions: ["KNOW"] }, publisher);
    const reg = await registerAndUpload(svc, objects, report);
    const id = report.manifest!.experienceId;

    const quizKey = `${reg.s3Prefix}quiz/quiz.json`;
    const original = objects.objects.get(quizKey)!;
    objects.objects.delete(quizKey);
    await assert.rejects(svc.publish({ experienceId: id, version: "1.0.0" }, publisher), (e: ApiError) => {
      assert.equal(e.code, "artifacts_not_ready");
      assert.deepEqual(e.details, [{ artifactId: "quiz-main", problem: "not uploaded" }]);
      return true;
    });

    objects.upload(quizKey, Buffer.concat([original.body, Buffer.from(" ")]), original.contentType);
    await assert.rejects(svc.publish({ experienceId: id, version: "1.0.0" }, publisher), (e: ApiError) => {
      assert.match((e.details as { problem: string }[])[0]!.problem, /^size /);
      return true;
    });

    const tampered = Buffer.from(original.body);
    tampered[tampered.length - 2] = tampered[tampered.length - 2]! ^ 0x01;
    objects.upload(quizKey, tampered, original.contentType);
    await assert.rejects(svc.publish({ experienceId: id, version: "1.0.0" }, publisher), (e: ApiError) => {
      assert.deepEqual(e.details, [{ artifactId: "quiz-main", problem: "sha256 mismatch" }]);
      return true;
    });

    // still a draft, nothing leaked
    assert.equal((await svc.getVersion(id, "1.0.0", publisher)).status, "DRAFT");
    await rejects(svc.getExperience(id, undefined, reader), 404, "not_found");
  });

  test("registration validates manifest, digests and skill references", async () => {
    const { svc } = makeService();
    const id = report.manifest!.experienceId;
    const good = { manifest: report.manifest!, artifacts: report.artifacts.map((a) => ({ artifactId: a.artifactId, sha256: a.sha256, sizeBytes: a.sizeBytes })), manifestDigest: report.manifestDigest! };

    await rejects(svc.registerVersion(id, { ...good, manifest: { ...good.manifest, difficulty: 9 } }, publisher), 422, "validation_failed");
    await rejects(svc.registerVersion("other-id", good, publisher), 400, "bad_request");
    await rejects(svc.registerVersion(id, { ...good, artifacts: good.artifacts.slice(1) }, publisher), 422, "validation_failed");
    await rejects(svc.registerVersion(id, { ...good, manifestDigest: undefined as never }, publisher), 422, "validation_failed");
    // no skills registered yet
    await assert.rejects(svc.registerVersion(id, good, publisher), (e: ApiError) => {
      assert.equal(e.code, "unknown_skill");
      assert.deepEqual(e.details, ["availability-zones", "aws-accounts", "aws-regions", "cloud-computing-basics", "edge-locations"]);
      return true;
    });
    // readers can't publish anything
    await rejects(svc.registerVersion(id, good, reader), 403, "forbidden");
    await rejects(svc.publish({ experienceId: id, version: "1.0.0" }, reader), 403, "forbidden");
    await rejects(svc.upsertSkill("x", {}, reader), 403, "forbidden");
  });

  test("re-registering a draft replaces stale artifact and skill rows", async () => {
    const { svc, objects, store } = makeService();
    for (const s of report.skills) await svc.upsertSkill(s.skillId, s, publisher);
    await svc.upsertSkill("cloud-computing-basics", { skillId: "cloud-computing-basics", name: "Cloud basics", domain: "cloud", description: "Baseline cloud vocabulary for beginners.", competencyLevels: [{ level: "exposure", descriptor: "Knows the term cloud computing." }], assessmentDimensions: ["KNOW"] }, publisher);
    await registerAndUpload(svc, objects, report);
    const before = [...store.items.keys()].filter((k) => k.includes("#ART#")).length;
    assert.equal(before, report.artifacts.length);

    const smaller = structuredClone(report);
    const dropped = smaller.manifest!.artifacts.pop()!; // last artifact is an optional asset
    smaller.artifacts = smaller.artifacts.filter((a) => a.artifactId !== dropped.artifactId);
    smaller.manifest!.skills.required = [];
    smaller.manifest!.prerequisites = [];
    await registerAndUpload(svc, objects, smaller);
    const after = [...store.items.keys()].filter((k) => k.includes("#ART#")).length;
    assert.equal(after, report.artifacts.length - 1);
    assert.equal([...store.items.keys()].filter((k) => k.includes("#SKILL#REQUIRED#")).length, 0);
  });

  test("createExperience seeds a catalog shell and refuses to rewrite published identity", async () => {
    const { svc } = makeService();
    const created = await svc.createExperience({ experienceId: "cloud-computing-basics", title: "Cloud Computing Basics", summary: "What the cloud is, for people who have never used it.", domain: "cloud", category: "foundations", level: "FOUNDATION", difficulty: 1 }, publisher);
    assert.equal(created.experience.status, "DRAFT");
    assert.equal(created.version, null);
    await rejects(svc.createExperience({ experienceId: "Bad Id" }, publisher), 400, "bad_request");
    await rejects(svc.getExperience("cloud-computing-basics", undefined, reader), 404, "not_found");
  });
});
