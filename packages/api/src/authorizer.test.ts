import { test } from "node:test";
import assert from "node:assert/strict";
import { apiBaseArn, buildPolicy, decide, extractBearer } from "./authorizer.js";

const tokens = { read: "r".repeat(40), publish: "p".repeat(40) };
const methodArn = "arn:aws:execute-api:ap-south-1:880636108741:abc123/prod/GET/experiences";

test("bearer extraction is case-insensitive on header and scheme", () => {
  assert.equal(extractBearer({ Authorization: "Bearer abc" }), "abc");
  assert.equal(extractBearer({ authorization: "bearer abc" }), "abc");
  assert.equal(extractBearer({ authorization: "Basic abc" }), null);
  assert.equal(extractBearer(null), null);
});

test("tokens map to scopes; anything else is rejected", () => {
  assert.deepEqual(decide(tokens.read, tokens), { scope: "read", actor: "token:read" });
  assert.deepEqual(decide(tokens.publish, tokens), { scope: "publish", actor: "token:publish" });
  assert.equal(decide("short", tokens), null);
  assert.equal(decide("x".repeat(40), tokens), null);
  assert.equal(decide(null, tokens), null);
});

test("read tokens get GET-only policies; publish tokens get everything", () => {
  assert.equal(apiBaseArn(methodArn), "arn:aws:execute-api:ap-south-1:880636108741:abc123/prod");
  const read = buildPolicy({ scope: "read", actor: "token:read" }, methodArn);
  assert.deepEqual(read.policyDocument.Statement[0], { Action: "execute-api:Invoke", Effect: "Allow", Resource: ["arn:aws:execute-api:ap-south-1:880636108741:abc123/prod/GET/*"] });
  assert.equal(read.context?.scope, "read");
  const pub = buildPolicy({ scope: "publish", actor: "token:publish" }, methodArn);
  assert.deepEqual((pub.policyDocument.Statement[0] as { Resource: string[] }).Resource, ["arn:aws:execute-api:ap-south-1:880636108741:abc123/prod/*/*"]);
});
