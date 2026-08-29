import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken } from "../test-helpers.js";
import type { PromoteS3 } from "./promote-route.js";

const EID = "cexp_01TEST";
const BUCKET = "aventiqlab-alchemy-content";

class FakePromoteS3 implements PromoteS3 {
  objects = new Set<string>();
  copies: Array<{ src: string; dest: string }> = [];
  winningKey: string | null = null;

  async findWinningRender(): Promise<string | null> {
    return this.winningKey;
  }
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  async copy(src: string, dest: string): Promise<void> {
    this.copies.push({ src, dest });
    this.objects.add(dest);
  }
}

async function appWith(s3: PromoteS3) {
  return buildApp({ config: TEST_CONFIG, promoteOverride: { s3, bucket: BUCKET } });
}

async function promote(app: Awaited<ReturnType<typeof buildApp>>, body: unknown, sub = EID) {
  const token = await mintToken({ sub });
  return app.inject({
    method: "POST",
    url: "/v1/artifacts/promote",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: body as object,
  });
}

test("promote copies the winning render + poster to produced/ and returns the pointers", async () => {
  const s3 = new FakePromoteS3();
  s3.winningKey = `renders/${EID}/cycle-2/attempt-3.mp4`;
  s3.objects.add(`renders/${EID}/cycle-2/attempt-3.mp4`);
  s3.objects.add(`renders/${EID}/cycle-2/attempt-3.poster.png`);
  const app = await appWith(s3);

  const res = await promote(app, { experience_id: EID, cycle: 2 });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual(res.json(), {
    produced: {
      s3_pointer: `s3://${BUCKET}/produced/${EID}/video.mp4`,
      poster_s3_pointer: `s3://${BUCKET}/produced/${EID}/video.poster.png`,
    },
  });
  assert.deepEqual(s3.copies, [
    { src: `renders/${EID}/cycle-2/attempt-3.mp4`, dest: `produced/${EID}/video.mp4` },
    { src: `renders/${EID}/cycle-2/attempt-3.poster.png`, dest: `produced/${EID}/video.poster.png` },
  ]);
  await app.close();
});

test("promote is idempotent — a second call is a no-op 200", async () => {
  const s3 = new FakePromoteS3();
  s3.winningKey = `renders/${EID}/cycle-1/attempt-1.mp4`;
  s3.objects.add(`renders/${EID}/cycle-1/attempt-1.mp4`);
  s3.objects.add(`renders/${EID}/cycle-1/attempt-1.poster.png`);
  const app = await appWith(s3);

  await promote(app, { experience_id: EID, cycle: 1 });
  const copiesAfterFirst = s3.copies.length;
  const res2 = await promote(app, { experience_id: EID, cycle: 1 });
  assert.equal(res2.statusCode, 200);
  assert.equal(s3.copies.length, copiesAfterFirst, "no extra copies on the second call");
  await app.close();
});

test("promote with no winning render -> validation_failed (a missing render is a bug)", async () => {
  const s3 = new FakePromoteS3();
  s3.winningKey = null;
  const app = await appWith(s3);
  const res = await promote(app, { experience_id: EID, cycle: 5 });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  await app.close();
});

test("promote where the winning render has no poster -> validation_failed", async () => {
  const s3 = new FakePromoteS3();
  s3.winningKey = `renders/${EID}/cycle-1/attempt-1.mp4`;
  s3.objects.add(`renders/${EID}/cycle-1/attempt-1.mp4`); // no poster
  const app = await appWith(s3);
  const res = await promote(app, { experience_id: EID, cycle: 1 });
  assert.equal(res.statusCode, 422);
  await app.close();
});

test("promote sub != experience_id -> unauthorized", async () => {
  const app = await appWith(new FakePromoteS3());
  const res = await promote(app, { experience_id: EID, cycle: 1 }, "cexp_OTHER");
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("promote bad body -> validation_failed", async () => {
  const app = await appWith(new FakePromoteS3());
  const res = await promote(app, { experience_id: EID });
  assert.equal(res.statusCode, 422);
  await app.close();
});

test("promote no token -> 401", async () => {
  const app = await appWith(new FakePromoteS3());
  const res = await app.inject({ method: "POST", url: "/v1/artifacts/promote", payload: { experience_id: EID, cycle: 1 } });
  assert.equal(res.statusCode, 401);
  await app.close();
});
