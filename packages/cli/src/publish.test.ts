/**
 * End-to-end: the real CLI publish flow against the real API router, with
 * DynamoDB and S3 replaced by in-memory fakes. This is the "desktop ->
 * package -> validate -> publish -> S3 -> DynamoDB -> API" demonstration from
 * the brief, runnable offline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentResponse, ExperienceResponse } from "@aventiqlab/alchemy-core";
import { FakeContentStore, FakeObjectStore } from "@aventiqlab/alchemy-api/fakes";
import { route } from "@aventiqlab/alchemy-api/router";
import { AlchemyService, type Caller } from "@aventiqlab/alchemy-api/service";
import { PackageInvalidError, runPublish } from "./publish.js";
import { unwrap, type ApiResult, type Transport } from "./transport.js";

const SAMPLE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../content/aws-global-infrastructure");

/** Talks to the API in-process, exactly as HTTP would (JSON in, JSON out). */
class InProcessTransport implements Transport {
  constructor(
    private readonly svc: AlchemyService,
    private readonly objects: FakeObjectStore,
    private readonly caller: Caller,
  ) {}

  async request<T>(method: "GET" | "POST" | "PUT", fullPath: string, body?: unknown): Promise<ApiResult<T>> {
    const [p, qs] = fullPath.split("?");
    const query: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(qs ?? "")) query[k] = v;
    const res = await route(this.svc, { method, path: p!, query, caller: this.caller, body: body === undefined ? null : JSON.stringify(body) });
    return { status: res.statusCode, body: JSON.parse(res.body) as T };
  }

  async upload(url: string, headers: Record<string, string>, filePath: string): Promise<void> {
    const key = new URL(url).pathname.slice(1);
    this.objects.upload(key, await readFile(filePath), headers["content-type"]);
  }
}

function harness() {
  const store = new FakeContentStore();
  const objects = new FakeObjectStore();
  const svc = new AlchemyService(store, objects, { signedUrlTtlSec: 900, uploadUrlTtlSec: 3600, verifyHashMaxBytes: 64 * 1024 * 1024 });
  return {
    svc,
    store,
    objects,
    publisher: new InProcessTransport(svc, objects, { scope: "publish", actor: "token:publish" }),
    reader: new InProcessTransport(svc, objects, { scope: "read", actor: "token:read" }),
  };
}

const externalSkill = {
  skillId: "cloud-computing-basics",
  name: "Cloud computing basics",
  domain: "cloud",
  description: "What cloud computing is: on-demand, pay-as-you-go, elastic resources.",
  competencyLevels: [{ level: "exposure", descriptor: "Can say what the cloud is in one sentence." }],
  assessmentDimensions: ["KNOW"],
};

test("alchemy publish ./aws-global-infrastructure, then GET /experiences/aws-global-infrastructure", async () => {
  const h = harness();
  unwrap(await h.publisher.request("PUT", "/skills/cloud-computing-basics", externalSkill), "seed prerequisite skill");

  const lines: string[] = [];
  const summary = await runPublish(SAMPLE, h.publisher, { log: (l) => lines.push(l) });
  assert.equal(summary.status, "PUBLISHED");
  assert.deepEqual(summary.skillsUpserted, ["availability-zones", "aws-accounts", "aws-global-infrastructure", "aws-regions", "edge-locations"]);
  assert.equal(summary.uploaded.length, 8, "7 artifacts + manifest.json");
  assert.ok(summary.uploaded.every((u) => u.key.startsWith("aws/foundation/aws-global-infrastructure/1.0.0/")));
  assert.equal(summary.publication?.artifactCount, 7);
  assert.ok(lines.some((l) => l.startsWith("published aws-global-infrastructure@1.0.0")));

  // S3: artifacts uploaded under the deterministic prefix
  const keys = [...h.objects.objects.keys()].sort();
  assert.ok(keys.includes("aws/foundation/aws-global-infrastructure/1.0.0/manifest.json"));
  assert.ok(keys.includes("aws/foundation/aws-global-infrastructure/1.0.0/video/aws-global-infrastructure.mp4"));
  assert.ok(keys.includes("aws/foundation/aws-global-infrastructure/1.0.0/_publication.json"));

  // DynamoDB: metadata registered (1 meta + 1 version + 7 artifacts + 9 skill edges + 1 publication + 6 skills)
  const types = [...h.store.items.values()].reduce<Record<string, number>>((acc, i) => ((acc[i.entityType] = (acc[i.entityType] ?? 0) + 1), acc), {});
  assert.deepEqual(types, { EXPERIENCE: 1, EXPERIENCE_VERSION: 1, ARTIFACT: 7, EXPERIENCE_SKILL: 9, PUBLICATION: 1, SKILL: 6 });

  // API: the AventiqLab-facing response
  const exp = unwrap(await h.reader.request<ExperienceResponse>("GET", "/experiences/aws-global-infrastructure"), "get");
  assert.equal(exp.experience.title, "AWS Global Infrastructure");
  assert.equal(exp.version?.version, "1.0.0");
  assert.ok(exp.version!.manifest.skills.taught.length >= 4);
  assert.deepEqual(exp.version!.manifest.prerequisites.map((p) => p.experienceId), ["cloud-computing-basics"]);
  assert.equal(exp.version!.manifest.learningObjectives.length, 4);
  assert.equal(exp.version!.artifacts.length, 7);

  const content = unwrap(await h.reader.request<ContentResponse>("GET", exp.links.content!), "content");
  assert.ok(content.artifacts.every((a) => a.url.startsWith("https://")));
  const video = content.artifacts.find((a) => a.kind === "video")!;
  assert.equal(video.sizeBytes, (await readFile(path.join(SAMPLE, "video/aws-global-infrastructure.mp4"))).length);

  // second run of the same version is refused: published versions are immutable
  await assert.rejects(runPublish(SAMPLE, h.publisher, { skipSkills: true }), /immutable|not greater/);
});

test("publish stops before the API on an invalid package", async () => {
  const h = harness();
  await assert.rejects(runPublish(path.join(SAMPLE, "quiz"), h.publisher), PackageInvalidError);
  assert.equal(h.store.items.size, 0);
});

test("--draft-only leaves a reviewable draft that readers cannot see", async () => {
  const h = harness();
  unwrap(await h.publisher.request("PUT", "/skills/cloud-computing-basics", externalSkill), "seed");
  const summary = await runPublish(SAMPLE, h.publisher, { draftOnly: true });
  assert.equal(summary.status, "DRAFT");
  assert.equal((await h.reader.request("GET", "/experiences/aws-global-infrastructure")).status, 404);
  assert.equal((await h.publisher.request("GET", "/experiences/aws-global-infrastructure?version=1.0.0")).status, 200);
});
