import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../app.js";
import { TEST_CONFIG, mintToken } from "../test-helpers.js";
import { parseArtifactPointer } from "./pointer.js";
import { contentTypeForKey } from "./content-type.js";
import { ServiceError } from "../errors/envelope.js";
import { S3HeadError, type ArtifactSigner, type HeadResult, type PresignInput } from "./s3-signer.js";

const BUCKET = "aventiqlab-alchemy-content";
const EID = "cexp_01TEST";

// ---- Fake signer --------------------------------------------------------

class FakeSigner implements ArtifactSigner {
  headCalls: string[] = [];
  presignCalls: PresignInput[] = [];
  constructor(
    private readonly headImpl: (key: string) => HeadResult | Promise<HeadResult> | never,
    private readonly presignImpl: (input: PresignInput) => string = (i) =>
      `https://${BUCKET}.s3.ap-south-1.amazonaws.com/${i.key}?X-Amz-Expires=${i.ttlSeconds}`,
  ) {}
  async head(key: string): Promise<HeadResult> {
    this.headCalls.push(key);
    return this.headImpl(key);
  }
  async presignGet(input: PresignInput): Promise<string> {
    this.presignCalls.push(input);
    return this.presignImpl(input);
  }
}

async function appWith(signer: ArtifactSigner) {
  return buildApp({ config: TEST_CONFIG, signOverride: { signer, bucket: BUCKET } });
}

async function post(app: Awaited<ReturnType<typeof buildApp>>, payload: unknown, subOverride?: string) {
  const token = await mintToken({ sub: subOverride ?? EID });
  return app.inject({
    method: "POST",
    url: "/v1/artifacts/sign",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: payload as object,
  });
}

const ptr = (key: string) => `s3://${BUCKET}/${key}`;

// ---- Happy paths -------------------------------------------------------

test("valid produced/ pointer -> 200 with url, ~15min expiry, video/mp4", async () => {
  const signer = new FakeSigner(() => ({ exists: true, contentType: "video/mp4" }));
  const app = await appWith(signer);
  const res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(res.statusCode, 200, res.body);
  const json = res.json();
  assert.match(json.url, /^https:\/\//);
  assert.equal(json.content_type, "video/mp4");
  const expiresIn = new Date(json.expires_at).getTime() - Date.now();
  assert.ok(expiresIn > 890_000 && expiresIn <= 900_000, `expiry ~900s, got ${expiresIn}ms`);
  assert.equal(signer.presignCalls[0]!.ttlSeconds, 900);
  assert.equal(signer.presignCalls[0]!.responseContentType, "video/mp4");
  await app.close();
});

test("valid generated/*.json pointer -> 200, content_type application/json from the object", async () => {
  const signer = new FakeSigner(() => ({ exists: true, contentType: "application/json" }));
  const app = await appWith(signer);
  const res = await post(app, {
    experience_id: EID,
    s3_pointer: ptr(`generated/${EID}/quiz/attempt-1.json`),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().content_type, "application/json");
  await app.close();
});

test("content_type falls back to the key suffix when the object has none", async () => {
  const signer = new FakeSigner(() => ({ exists: true })); // no contentType
  const app = await appWith(signer);
  const res = await post(app, { experience_id: EID, s3_pointer: ptr(`renders/${EID}/cycle-1/attempt-1.mp4`) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().content_type, "video/mp4");
  await app.close();
});

// ---- Pointer validation (OQ-6 defense in depth) -----------------------

test("wrong bucket -> validation_failed", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  const res = await post(app, {
    experience_id: EID,
    s3_pointer: `s3://some-other-bucket/produced/${EID}/video.mp4`,
  });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  await app.close();
});

test("disallowed prefix -> validation_failed", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  const res = await post(app, { experience_id: EID, s3_pointer: ptr(`secrets/${EID}/x`) });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  await app.close();
});

test("pointer whose experience_id segment != body experience_id -> validation_failed", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  const res = await post(app, {
    experience_id: EID,
    s3_pointer: ptr(`produced/cexp_01OTHER/video.mp4`),
  });
  assert.equal(res.statusCode, 422);
  assert.match(res.json().error.message, /experience_id/);
  await app.close();
});

test("pointer with .. traversal -> validation_failed", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  const res = await post(app, {
    experience_id: EID,
    s3_pointer: ptr(`produced/${EID}/../../../etc/passwd`),
  });
  assert.equal(res.statusCode, 422);
  await app.close();
});

test("non-s3 URI -> validation_failed", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  const res = await post(app, { experience_id: EID, s3_pointer: `https://example.com/x` });
  assert.equal(res.statusCode, 422);
  await app.close();
});

// ---- Auth ------------------------------------------------------------

test("body experience_id != JWT sub -> unauthorized", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  // token minted for a different run
  const res = await post(
    app,
    { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) },
    "cexp_01SOMEONEELSE",
  );
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().error.code, "unauthorized");
  await app.close();
});

test("no token -> 401 envelope", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: true })));
  const res = await app.inject({
    method: "POST",
    url: "/v1/artifacts/sign",
    payload: { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

// ---- Missing object semantics (CD-7) --------------------------------

test("missing generated/ object -> artifact_expired (404)", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: false })));
  const res = await post(app, {
    experience_id: EID,
    s3_pointer: ptr(`generated/${EID}/material/attempt-2.json`),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, "artifact_expired");
  assert.equal(res.json().error.retryable, false);
  await app.close();
});

test("missing renders/ object -> artifact_expired (404)", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: false })));
  const res = await post(app, {
    experience_id: EID,
    s3_pointer: ptr(`renders/${EID}/cycle-1/attempt-1.mp4`),
  });
  assert.equal(res.statusCode, 404);
  assert.equal(res.json().error.code, "artifact_expired");
  await app.close();
});

test("GUARD: missing produced/ object -> validation_failed (422), NOT artifact_expired", async () => {
  const app = await appWith(new FakeSigner(() => ({ exists: false })));
  const res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(res.statusCode, 422);
  assert.equal(res.json().error.code, "validation_failed");
  assert.notEqual(res.json().error.code, "artifact_expired");
  await app.close();
});

// ---- S3 errors -----------------------------------------------------

test("HeadObject non-404 failure -> internal_error (500)", async () => {
  const app = await appWith(
    new FakeSigner(() => {
      throw new S3HeadError("throttled", new Error("SlowDown"));
    }),
  );
  const res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().error.code, "internal_error");
  await app.close();
});

test("presign failure -> internal_error (500)", async () => {
  const signer = new FakeSigner(
    () => ({ exists: true, contentType: "video/mp4" }),
    () => {
      throw new Error("STS unavailable");
    },
  );
  const app = await appWith(signer);
  const res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(res.statusCode, 500);
  assert.equal(res.json().error.code, "internal_error");
  await app.close();
});

// ---- TTL override --------------------------------------------------

test("ALCHEMY_SIGNED_URL_TTL_SEC is respected and clamped", async () => {
  const signer = new FakeSigner(() => ({ exists: true, contentType: "video/mp4" }));
  const app = await appWith(signer);

  process.env.ALCHEMY_SIGNED_URL_TTL_SEC = "300";
  let res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(signer.presignCalls.at(-1)!.ttlSeconds, 300);

  process.env.ALCHEMY_SIGNED_URL_TTL_SEC = "999999"; // clamp to 3600
  res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(signer.presignCalls.at(-1)!.ttlSeconds, 3600);

  process.env.ALCHEMY_SIGNED_URL_TTL_SEC = "1"; // clamp to 60
  res = await post(app, { experience_id: EID, s3_pointer: ptr(`produced/${EID}/video.mp4`) });
  assert.equal(signer.presignCalls.at(-1)!.ttlSeconds, 60);
  assert.equal(res.statusCode, 200);

  delete process.env.ALCHEMY_SIGNED_URL_TTL_SEC;
  await app.close();
});

// ---- Unit coverage ----------------------------------------------------

test("parseArtifactPointer classifies retention by prefix", () => {
  assert.equal(parseArtifactPointer(ptr(`generated/${EID}/quiz/attempt-1.json`), BUCKET, EID).retentionClass, "scratch");
  assert.equal(parseArtifactPointer(ptr(`renders/${EID}/cycle-1/attempt-1.mp4`), BUCKET, EID).retentionClass, "scratch");
  assert.equal(parseArtifactPointer(ptr(`produced/${EID}/video.mp4`), BUCKET, EID).retentionClass, "durable");
});

test("parseArtifactPointer rejects a bare prefix (no object key)", () => {
  assert.throws(
    () => parseArtifactPointer(ptr(`produced/${EID}/`), BUCKET, EID),
    (e: unknown) => e instanceof ServiceError && e.code === "validation_failed",
  );
});

test("contentTypeForKey suffix map", () => {
  assert.equal(contentTypeForKey("x/y/z.mp4"), "video/mp4");
  assert.equal(contentTypeForKey("x/y/z.png"), "image/png");
  assert.equal(contentTypeForKey("x/y/z.json"), "application/json");
  assert.equal(contentTypeForKey("x/y/znoext"), "application/octet-stream");
});
