import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken } from "../test-helpers.js";
import { VALID_CONTENT } from "../generate/fixtures.js";
import { MemoryRenderJobStore } from "./job-store.js";
import { renderJobId } from "./id.js";
import type { RenderLauncher } from "./launcher.js";
import type { RenderJob } from "./types.js";

const EID = "cexp_01TEST";

class FakeLauncher implements RenderLauncher {
  stashes: unknown[] = [];
  launches: unknown[] = [];
  failLaunch = false;
  async stashRequest(req: unknown, id: string): Promise<string> {
    this.stashes.push({ req, id });
    return `renders/${EID}/cycle-1/request.json`;
  }
  async launch(params: unknown): Promise<void> {
    if (this.failLaunch) throw new Error("RunTask denied");
    this.launches.push(params);
  }
}

async function appWith(store: MemoryRenderJobStore, launcher: RenderLauncher) {
  return buildApp({ config: TEST_CONFIG, renderOverride: { store, launcher } });
}

async function postRender(app: Awaited<ReturnType<typeof buildApp>>, body: unknown, sub = EID) {
  const token = await mintToken({ sub });
  return app.inject({
    method: "POST",
    url: "/v1/render",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: body as object,
  });
}

function renderBody(extra: Record<string, unknown> = {}) {
  return { experience_id: EID, cycle: 1, video_spec: VALID_CONTENT.video, vision_qa_feedback: null, ...extra };
}

// ---- POST /v1/render ------------------------------------------------

test("POST /v1/render -> 202 { render_job_id, status: pending }; job created + task launched", async () => {
  const store = new MemoryRenderJobStore();
  const launcher = new FakeLauncher();
  const app = await appWith(store, launcher);

  const res = await postRender(app, renderBody());
  assert.equal(res.statusCode, 202, res.body);
  const json = res.json();
  assert.match(json.render_job_id, /^rj_[0-9A-HJKMNP-TV-Z]+$/);
  assert.equal(json.status, "pending");
  assert.equal(json.experience_id, EID);

  const job = await store.get(json.render_job_id);
  assert.ok(job);
  assert.equal(job.status, "pending");
  assert.equal(launcher.launches.length, 1);
  assert.equal(launcher.stashes.length, 1);
  await app.close();
});

test("POST /v1/render with a second render while one is active -> 409 invalid_pipeline_state", async () => {
  const store = new MemoryRenderJobStore();
  const app = await appWith(store, new FakeLauncher());
  const first = await postRender(app, renderBody());
  assert.equal(first.statusCode, 202);
  const second = await postRender(app, renderBody({ cycle: 2 }));
  assert.equal(second.statusCode, 409);
  assert.equal(second.json().error.code, "invalid_pipeline_state");
  await app.close();
});

test("POST /v1/render with a bad video_spec -> validation_failed, no job", async () => {
  const store = new MemoryRenderJobStore();
  const app = await appWith(store, new FakeLauncher());
  const bad = structuredClone(VALID_CONTENT.video) as Record<string, unknown>;
  bad.beats = (bad.beats as Array<Record<string, unknown>>).filter((b) => b.stage !== "decision"); // missing REQUIRED stage
  const res = await postRender(app, renderBody({ video_spec: bad }));
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  assert.equal(store.jobs.size, 0);
  await app.close();
});

test("POST /v1/render with an unknown schema_version -> unsupported_type", async () => {
  const store = new MemoryRenderJobStore();
  const app = await appWith(store, new FakeLauncher());
  const bad = { ...VALID_CONTENT.video, schema_version: "video/v99" };
  const res = await postRender(app, renderBody({ video_spec: bad }));
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "unsupported_type");
  await app.close();
});

test("POST /v1/render with schema_version video/v2 but v1-shaped content -> validation_failed (v2 is supported, this content is not valid v2)", async () => {
  const store = new MemoryRenderJobStore();
  const app = await appWith(store, new FakeLauncher());
  const bad = { ...VALID_CONTENT.video, schema_version: "video/v2" };
  const res = await postRender(app, renderBody({ video_spec: bad }));
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  await app.close();
});

test("POST /v1/render with a real video/v2 spec -> 202, accepted", async () => {
  const store = new MemoryRenderJobStore();
  const launcher = new FakeLauncher();
  const app = await appWith(store, launcher);
  const res = await postRender(app, renderBody({ video_spec: VALID_CONTENT.video_v2 }));
  assert.equal(res.statusCode, 202, res.body);
  assert.equal(launcher.launches.length, 1);
  await app.close();
});

test("POST /v1/render with content_flaw feedback -> validation_failed before any launch", async () => {
  const store = new MemoryRenderJobStore();
  const launcher = new FakeLauncher();
  const app = await appWith(store, launcher);
  const res = await postRender(app, renderBody({ cycle: 2, vision_qa_feedback: { category: "content_flaw" } }));
  assert.equal(res.statusCode, 422);
  assert.equal(launcher.launches.length, 0);
  assert.equal(store.jobs.size, 0);
  await app.close();
});

test("POST /v1/render where RunTask fails -> job marked failed, 500", async () => {
  const store = new MemoryRenderJobStore();
  const launcher = new FakeLauncher();
  launcher.failLaunch = true;
  const app = await appWith(store, launcher);
  const res = await postRender(app, renderBody());
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().error.code, "internal_error");
  // the job exists but is failed (so a poll doesn't hang)
  const jobs = [...store.jobs.values()];
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0]!.status, "failed");
  await app.close();
});

test("POST /v1/render sub != experience_id -> unauthorized", async () => {
  const store = new MemoryRenderJobStore();
  const app = await appWith(store, new FakeLauncher());
  const res = await postRender(app, renderBody(), "cexp_SOMEONE_ELSE");
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("POST /v1/render no token -> 401", async () => {
  const app = await appWith(new MemoryRenderJobStore(), new FakeLauncher());
  const res = await app.inject({ method: "POST", url: "/v1/render", payload: renderBody() });
  assert.equal(res.statusCode, 401);
  await app.close();
});

// ---- GET /v1/render/{id} -----------------------------------------

async function getRender(app: Awaited<ReturnType<typeof buildApp>>, id: string, sub = EID) {
  const token = await mintToken({ sub });
  return app.inject({ method: "GET", url: `/v1/render/${id}`, headers: { authorization: `Bearer ${token}` } });
}

function seedJob(store: MemoryRenderJobStore, patch: Partial<RenderJob>): RenderJob {
  const id = renderJobId();
  const now = new Date().toISOString();
  const job: RenderJob = {
    render_job_id: id,
    experience_id: EID,
    cycle: 1,
    status: "pending",
    phase: null,
    request_s3_key: "renders/x/request.json",
    created_at: now,
    updated_at: now,
    ttl: 0,
    ...patch,
  };
  store.jobs.set(id, job);
  return job;
}

test("GET a pending job -> { status: pending, phase }", async () => {
  const store = new MemoryRenderJobStore();
  const job = seedJob(store, { status: "running", phase: "rendering", started_at: "2026-08-29T00:00:00Z" });
  const app = await appWith(store, new FakeLauncher());
  const res = await getRender(app, job.render_job_id);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), {
    render_job_id: job.render_job_id,
    experience_id: EID,
    cycle: 1,
    started_at: "2026-08-29T00:00:00Z",
    status: "running",
    phase: "rendering",
  });
  await app.close();
});

test("GET a done job -> { mechanical_qa, output, rendered_spec_pointer }", async () => {
  const store = new MemoryRenderJobStore();
  const job = seedJob(store, {
    status: "done",
    finished_at: "2026-08-29T00:10:00Z",
    mechanical_qa: { passed: true, checks: [{ name: "Audio track exists", pass: true, detail: "aac" }] },
    output: { s3_pointer: "s3://b/renders/x/cycle-1/attempt-1.mp4", duration_sec: 329, poster_s3_pointer: "s3://b/.../poster.png" },
    rendered_spec_pointer: "s3://b/renders/x/cycle-1/attempt-1.video_spec.json",
  });
  const app = await appWith(store, new FakeLauncher());
  const res = await getRender(app, job.render_job_id);
  assert.equal(res.statusCode, 200);
  const j = res.json();
  assert.equal(j.status, "done");
  assert.equal(j.mechanical_qa.passed, true);
  assert.equal(j.output.duration_sec, 329);
  assert.match(j.rendered_spec_pointer, /video_spec\.json$/);
  await app.close();
});

test("GET a done job whose mechanical_qa failed -> still status done, passed:false, output present", async () => {
  const store = new MemoryRenderJobStore();
  const job = seedJob(store, {
    status: "done",
    mechanical_qa: { passed: false, checks: [{ name: "Audio is not silent", pass: false, detail: "silent at t=5s" }] },
    output: { s3_pointer: "s3://b/x.mp4", duration_sec: 100, poster_s3_pointer: "s3://b/x.png" },
    rendered_spec_pointer: "s3://b/x.json",
  });
  const app = await appWith(store, new FakeLauncher());
  const res = await getRender(app, job.render_job_id);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().status, "done");
  assert.equal(res.json().mechanical_qa.passed, false);
  await app.close();
});

test("GET a failed job -> { error }", async () => {
  const store = new MemoryRenderJobStore();
  const job = seedJob(store, {
    status: "failed",
    error: { code: "render_failed", message: "Remotion exited 1", retryable: true },
  });
  const app = await appWith(store, new FakeLauncher());
  const res = await getRender(app, job.render_job_id);
  assert.equal(res.json().status, "failed");
  assert.equal(res.json().error.code, "render_failed");
  assert.equal(res.json().error.retryable, true);
  await app.close();
});

test("GET unknown id -> 404 render_job_not_found", async () => {
  const app = await appWith(new MemoryRenderJobStore(), new FakeLauncher());
  const res = await getRender(app, "rj_01ARZ3NDEKTSV4RRFFQ69G5FAV");
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, "render_job_not_found");
  await app.close();
});

test("GET a job for a different experience -> 404 (no existence leak)", async () => {
  const store = new MemoryRenderJobStore();
  const job = seedJob(store, {});
  const app = await appWith(store, new FakeLauncher());
  const res = await getRender(app, job.render_job_id, "cexp_OTHER");
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("GET a malformed id -> validation_failed", async () => {
  const app = await appWith(new MemoryRenderJobStore(), new FakeLauncher());
  const res = await getRender(app, "not-a-job-id");
  assert.equal(res.statusCode, 422);
  await app.close();
});
