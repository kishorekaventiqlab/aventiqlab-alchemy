import { test } from "node:test";
import assert from "node:assert/strict";
import { JwtVerifier, bearerFromHeader } from "./jwt.js";
import { ServiceError } from "../errors/envelope.js";
import { TEST_CONFIG, mintToken, mintUnsignedToken } from "../test-helpers.js";

const verifier = new JwtVerifier({
  secret: TEST_CONFIG.jwtSecret,
  issuer: TEST_CONFIG.jwtIssuer,
  audience: TEST_CONFIG.jwtAudience,
  clockToleranceSec: TEST_CONFIG.jwtClockToleranceSec,
});

async function expectUnauthorized(fn: () => Promise<unknown>): Promise<void> {
  await assert.rejects(fn(), (err: unknown) => {
    assert.ok(err instanceof ServiceError, "expected a ServiceError");
    assert.equal(err.code, "unauthorized");
    assert.equal(err.httpStatus, 401);
    assert.equal(err.retryable, false);
    return true;
  });
}

test("accepts a valid astra -> alchemy token and returns sub", async () => {
  const token = await mintToken({ sub: "cexp_01ABC" });
  const auth = await verifier.verify(token);
  assert.equal(auth.sub, "cexp_01ABC");
});

test("rejects a token signed with the wrong secret", async () => {
  const token = await mintToken({ secret: "another-secret-at-least-32-chars-xxxxx" });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects a token with the wrong issuer", async () => {
  const token = await mintToken({ issuer: "aventiqlab-backend" });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects a token with the wrong audience", async () => {
  const token = await mintToken({ audience: "astra-content-studio" });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects an expired token", async () => {
  const token = await mintToken({ expiresInSec: -60 });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects a token with no exp claim", async () => {
  const token = await mintToken({ expiresInSec: null });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects a token with no sub claim", async () => {
  const token = await mintToken({ omitSub: true });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects an alg:none token", async () => {
  await expectUnauthorized(() => verifier.verify(mintUnsignedToken()));
});

test("rejects an HS384 token even with the right secret", async () => {
  const token = await mintToken({ alg: "HS384" });
  await expectUnauthorized(() => verifier.verify(token));
});

test("rejects an empty token", async () => {
  await expectUnauthorized(() => verifier.verify(""));
});

test("bearerFromHeader extracts the token", () => {
  assert.equal(bearerFromHeader("Bearer abc.def.ghi"), "abc.def.ghi");
});

test("bearerFromHeader rejects a missing header", () => {
  assert.throws(() => bearerFromHeader(undefined), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, "unauthorized");
    return true;
  });
});

test("bearerFromHeader rejects a non-Bearer scheme", () => {
  assert.throws(() => bearerFromHeader("Basic abc123"), (err: unknown) => {
    assert.ok(err instanceof ServiceError);
    assert.equal(err.code, "unauthorized");
    return true;
  });
});
