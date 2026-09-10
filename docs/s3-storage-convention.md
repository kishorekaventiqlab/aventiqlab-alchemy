# 5. S3 Storage Convention

Bucket: `aventiqlab-alchemy-content-880636108741` (name = `aventiqlab-alchemy-content-{account}`; the
suffix keeps it globally unique and unmistakably tied to the Alchemy account).
Code: `packages/core/src/keys.ts` (`versionPrefix`, `manifestKey`, `artifactKey`), `packages/infra/lib/content-bucket.ts`.

## Key layout

```
{domain}/{level}/{experienceId}/{version}/manifest.json
{domain}/{level}/{experienceId}/{version}/_publication.json        ← written by the API at publish
{domain}/{level}/{experienceId}/{version}/video/…
{domain}/{level}/{experienceId}/{version}/reading/…
{domain}/{level}/{experienceId}/{version}/quiz/…
{domain}/{level}/{experienceId}/{version}/arena/…
{domain}/{level}/{experienceId}/{version}/evaluator/…
{domain}/{level}/{experienceId}/{version}/assets/…
```

Example, the sample experience:

```
aws/foundation/aws-global-infrastructure/1.0.0/manifest.json
aws/foundation/aws-global-infrastructure/1.0.0/_publication.json
aws/foundation/aws-global-infrastructure/1.0.0/video/aws-global-infrastructure.mp4
aws/foundation/aws-global-infrastructure/1.0.0/reading/aws-global-infrastructure.md
aws/foundation/aws-global-infrastructure/1.0.0/quiz/quiz.json
aws/foundation/aws-global-infrastructure/1.0.0/arena/arena-definition.json
aws/foundation/aws-global-infrastructure/1.0.0/evaluator/evaluator.json
aws/foundation/aws-global-infrastructure/1.0.0/assets/architecture.svg
aws/foundation/aws-global-infrastructure/1.0.0/assets/aws-map.svg
```

Properties: **deterministic** (computed from four manifest fields), **version-aware**, **human-readable**,
easy to publish from a desktop (a package's relative paths become keys verbatim), easy to debug
(`aws s3 ls s3://…/aws/foundation/aws-global-infrastructure/` shows every version).

`level` is lower-cased. If a later version changes `level` or `domain`, that version simply lives under a
different prefix; the exact prefix is recorded on the `EXPERIENCE_VERSION` row (`s3Prefix`), and nothing is moved.

## Who writes, who reads

| Actor | Access | How |
|---|---|---|
| Publishing CLI | write | presigned PUT per object, minted by the API, 1 h TTL, Content-Type pinned in the signature |
| API Lambda | read + write | its execution role: `s3:GetObject`, `s3:PutObject` on `bucket/*` only. No List, no Delete |
| AventiqLab / learner browser | read | presigned GET minted by the API, default 15 min (`?ttl=` clamps to 60–3600 s) |
| Anyone else | none | Block Public Access on all four settings, TLS enforced by bucket policy |

## Bucket settings

- SSE-S3 (AES-256) default encryption. A KMS CMK buys nothing while every reader is in-account via presigned URLs (**decision**).
- Versioning **on**. Published objects are never overwritten by the API (the version is immutable), so noncurrent versions only arise from re-uploaded *drafts*; they expire after 90 days. Incomplete multipart uploads abort after 7 days.
- `RemovalPolicy.RETAIN`: deleting the stack never deletes content.
- Object ownership `BucketOwnerEnforced` (no ACLs).
- CORS: `GET, HEAD` from `alchemy:allowedOrigins` (cdk.json context; default `https://aventiqlab.com`, `https://www.aventiqlab.com`, `http://localhost:3000`) so a browser can play a presigned video. Presigned URLs are the authorisation; CORS only tells the browser it may read the response. **The platform's Amplify Hosting `*.amplifyapp.com` origin is not recorded in either repo and must be added by the operator before deploy.** Only browser-side artifact fetches need CORS; every metadata call is Lambda-to-API.

## Immutability

A PUBLISHED or ARCHIVED version's prefix must never change. Enforcement is layered:

1. The API refuses to mint upload URLs for an immutable version (`409 immutable_version`).
2. The CLI never holds S3 credentials, so the API is the only path to a PUT.
3. Object versioning keeps history if 1–2 are ever bypassed by an operator.

S3 Object Lock was considered and **rejected** for the foundation: it must be enabled at bucket creation,
complicates draft re-uploads, and the threat model (an operator with console access) is better handled by IAM.
