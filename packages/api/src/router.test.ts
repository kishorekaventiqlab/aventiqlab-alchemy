import { test } from "node:test";
import assert from "node:assert/strict";
import { FakeContentStore, FakeObjectStore } from "./fakes.js";
import { route } from "./router.js";
import { AlchemyService, type Caller } from "./service.js";

const reader: Caller = { scope: "read", actor: "token:read" };
const publisher: Caller = { scope: "publish", actor: "token:publish" };
const svc = () => new AlchemyService(new FakeContentStore(), new FakeObjectStore(), { signedUrlTtlSec: 900, uploadUrlTtlSec: 3600, verifyHashMaxBytes: 1 });

const call = (method: string, path: string, caller = reader, body?: unknown, query: Record<string, string> = {}) =>
  route(svc(), { method, path, query, caller, body: body === undefined ? null : JSON.stringify(body) });

test("health is open and JSON", async () => {
  const r = await call("GET", "/health");
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(JSON.parse(r.body).ok, true);
});

test("unknown routes are 404, wrong methods are 405, bad JSON is 400", async () => {
  assert.equal((await call("GET", "/nope")).statusCode, 404);
  assert.equal((await call("DELETE", "/experiences")).statusCode, 405);
  const bad = await route(svc(), { method: "POST", path: "/publish", query: {}, caller: publisher, body: "{not json" });
  assert.equal(bad.statusCode, 400);
  assert.equal(JSON.parse(bad.body).error.code, "bad_request");
});

test("error envelope is uniform and scope is enforced", async () => {
  const r = await call("POST", "/publish", reader, { experienceId: "x", version: "1.0.0" });
  assert.equal(r.statusCode, 403);
  assert.deepEqual(JSON.parse(r.body), { error: { code: "forbidden", message: "publish scope required" } });
  const nf = await call("GET", "/experiences/does-not-exist");
  assert.equal(nf.statusCode, 404);
  assert.equal(JSON.parse(nf.body).error.code, "not_found");
});

test("path params are decoded and trailing slashes tolerated", async () => {
  const r = await call("GET", "/skills/aws-regions/");
  assert.equal(r.statusCode, 404);
  assert.match(JSON.parse(r.body).error.message, /skill aws-regions/);
  const bad = await call("GET", "/experiences/Not_A_Slug");
  assert.equal(bad.statusCode, 400);
});
