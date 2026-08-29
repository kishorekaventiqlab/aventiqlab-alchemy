import { test } from "node:test";
import assert from "node:assert/strict";
import { App, Stack } from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ContentBucket } from "../lib/content-bucket.js";

function synth(scratchRetentionDays = 30) {
  const app = new App();
  const stack = new Stack(app, "TestStack", { env: { account: "111111111111", region: "ap-south-1" } });
  const bucket = new ContentBucket(stack, "Content", { scratchRetentionDays, bucketName: "test-content" });
  return { stack, bucket, template: () => Template.fromStack(stack) };
}

test("bucket blocks all public access", () => {
  const t = synth().template();
  t.hasResourceProperties("AWS::S3::Bucket", {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

test("bucket uses SSE-S3 (AES256), not a KMS CMK", () => {
  const t = synth().template();
  t.hasResourceProperties("AWS::S3::Bucket", {
    BucketEncryption: {
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
      ],
    },
  });
});

test("bucket has versioning enabled", () => {
  const t = synth().template();
  t.hasResourceProperties("AWS::S3::Bucket", {
    VersioningConfiguration: { Status: "Enabled" },
  });
});

test("lifecycle: generated/ and renders/ expire at scratchRetentionDays; produced/ never expires", () => {
  const t = synth(30).template();
  t.hasResourceProperties("AWS::S3::Bucket", {
    LifecycleConfiguration: {
      Rules: Match.arrayWith([
        Match.objectLike({
          Id: "expire-generated-scratch",
          Prefix: "generated/",
          ExpirationInDays: 30,
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
          NoncurrentVersionExpiration: { NoncurrentDays: 30 },
          Status: "Enabled",
        }),
        Match.objectLike({
          Id: "expire-render-scratch",
          Prefix: "renders/",
          ExpirationInDays: 30,
          Status: "Enabled",
        }),
        Match.objectLike({
          Id: "produced-keep-forever-bounded-versions",
          Prefix: "produced/",
          NoncurrentVersionExpiration: { NoncurrentDays: 30 },
          Status: "Enabled",
        }),
      ]),
    },
  });
});

test("produced/ lifecycle rule has NO object expiration", () => {
  const t = synth(30).template();
  const buckets = t.findResources("AWS::S3::Bucket");
  const rules = Object.values(buckets)[0]!.Properties.LifecycleConfiguration.Rules as Array<
    Record<string, unknown>
  >;
  const producedRule = rules.find((r) => r.Prefix === "produced/");
  assert.ok(producedRule, "produced/ rule exists");
  assert.equal(producedRule!.ExpirationInDays, undefined, "produced/ must never set ExpirationInDays");
  assert.equal(producedRule!.ExpirationDate, undefined, "produced/ must never set ExpirationDate");
});

test("scratchRetentionDays flows through to the lifecycle rules", () => {
  const t = synth(7).template();
  t.hasResourceProperties("AWS::S3::Bucket", {
    LifecycleConfiguration: {
      Rules: Match.arrayWith([
        Match.objectLike({ Id: "expire-generated-scratch", ExpirationInDays: 7 }),
        Match.objectLike({ Id: "expire-render-scratch", ExpirationInDays: 7 }),
      ]),
    },
  });
});

test("grantGeneratedWrite grants PutObject scoped to generated/*, not the whole bucket", () => {
  const { stack, bucket, template } = synth();
  const role = new Role(stack, "AL3Role", { assumedBy: new ServicePrincipal("lambda.amazonaws.com") });
  bucket.grantGeneratedWrite(role);
  const t = template();
  const policies = t.findResources("AWS::IAM::Policy");
  const doc = JSON.stringify(Object.values(policies)[0]!.Properties.PolicyDocument);
  assert.ok(doc.includes("s3:PutObject"), "grants PutObject");
  assert.ok(doc.includes("/generated/*"), "scoped to the generated/ prefix");
  assert.ok(!doc.includes("/renders/*"), "does not reach renders/");
  assert.ok(!doc.includes("/produced/*"), "does not reach produced/");
});

test("grantReadForPresign grants GetObject on all three prefixes", () => {
  const { stack, bucket, template } = synth();
  const role = new Role(stack, "AL6Role", { assumedBy: new ServicePrincipal("lambda.amazonaws.com") });
  bucket.grantReadForPresign(role);
  const t = template();
  const policies = t.findResources("AWS::IAM::Policy");
  const doc = JSON.stringify(Object.values(policies)[0]!.Properties.PolicyDocument);
  assert.ok(doc.includes("s3:GetObject"), "grants GetObject");
  for (const prefix of ["generated/*", "renders/*", "produced/*"]) {
    assert.ok(doc.includes(prefix), `covers ${prefix}`);
  }
});

test("the bucket is RETAINed on stack delete (no accidental data loss)", () => {
  const t = synth().template();
  t.hasResource("AWS::S3::Bucket", { DeletionPolicy: "Retain" });
});
