import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken, mintUnsignedToken } from "../test-helpers.js";

async function makeApp() {
  return buildApp({ config: TEST_CONFIG });
}

test("GET /health is 200 and unauthenticated", async () => {
  const app = await makeApp();
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "ok" });
  await app.close();
});

test("GET /v1/whoami without a token is a 401 envelope", async () => {
  const app = await makeApp();
  const res = await app.inject({ method: "GET", url: "/v1/whoami" });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), {
    error: { code: "unauthorized", message: "Missing Authorization header.", retryable: false },
  });
  await app.close();
});

test("GET /v1/whoami with a valid token returns the sub", async () => {
  const app = await makeApp();
  const token = await mintToken({ sub: "cexp_01ROUTE" });
  const res = await app.inject({
    method: "GET",
    url: "/v1/whoami",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { sub: "cexp_01ROUTE" });
  await app.close();
});

test("GET /v1/whoami with a wrong-audience token is a 401 envelope", async () => {
  const app = await makeApp();
  const token = await mintToken({ audience: "astra-content-studio" });
  const res = await app.inject({
    method: "GET",
    url: "/v1/whoami",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "unauthorized");
  await app.close();
});

test("GET /v1/whoami with an alg:none token is a 401 envelope", async () => {
  const app = await makeApp();
  const res = await app.inject({
    method: "GET",
    url: "/v1/whoami",
    headers: { authorization: `Bearer ${mintUnsignedToken()}` },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "unauthorized");
  await app.close();
});

test("an unknown route is a validation_failed envelope, not a bare 404", async () => {
  const app = await makeApp();
  const res = await app.inject({ method: "GET", url: "/v1/nope" });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  await app.close();
});
