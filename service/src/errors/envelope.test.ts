import { test } from "node:test";
import assert from "node:assert/strict";
import { ServiceError, unauthorized, validationFailed, notConfigured } from "./envelope.js";
import { ERROR_CODES } from "./codes.js";

test("ServiceError carries the code's httpStatus and retryable flag", () => {
  const e = new ServiceError("model_provider_quota_exceeded", "out of credits");
  assert.equal(e.httpStatus, 503);
  assert.equal(e.retryable, false);
  assert.equal(e.code, "model_provider_quota_exceeded");
});

test("toEnvelope produces the contract §9 shape", () => {
  const e = new ServiceError("generation_failed", "self-check failed: weight_percent sums to 90");
  assert.deepEqual(e.toEnvelope(), {
    error: {
      code: "generation_failed",
      message: "self-check failed: weight_percent sums to 90",
      retryable: true,
    },
  });
});

test("convenience constructors set the right codes", () => {
  assert.equal(unauthorized().code, "unauthorized");
  assert.equal(validationFailed("bad body").code, "validation_failed");
  assert.equal(notConfigured("no secret").code, "not_configured");
});

test("every contract error code has a sane spec", () => {
  for (const [code, spec] of Object.entries(ERROR_CODES)) {
    assert.ok(spec.httpStatus >= 400 && spec.httpStatus <= 599, `${code} httpStatus`);
    assert.equal(typeof spec.retryable, "boolean", `${code} retryable`);
  }
  // Spot-check the ones the contract is explicit about.
  assert.equal(ERROR_CODES.model_provider_quota_exceeded.retryable, false);
  assert.equal(ERROR_CODES.model_provider_unavailable.retryable, true);
  assert.equal(ERROR_CODES.unauthorized.httpStatus, 401);
  assert.equal(ERROR_CODES.artifact_expired.httpStatus, 404);
});
