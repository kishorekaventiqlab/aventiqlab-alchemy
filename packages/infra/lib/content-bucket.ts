/**
 * The canonical artifact store. Key layout (docs/s3-storage-convention.md):
 *
 *   {domain}/{level}/{experienceId}/{version}/manifest.json
 *   {domain}/{level}/{experienceId}/{version}/{video|reading|quiz|arena|evaluator|assets}/...
 *   {domain}/{level}/{experienceId}/{version}/_publication.json   (written by the API on publish)
 *
 * Private, SSE-S3, versioned, RETAIN. The only principals that touch it are the
 * API Lambda (PutObject for presigned uploads, GetObject for presigned reads
 * and publish-time verification). Nothing is ever public; delivery is by
 * short-lived presigned GET minted by the API.
 */
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods, ObjectOwnership, type IBucket } from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export interface ContentBucketProps {
  /** Origins allowed to GET presigned artifact URLs from a browser (video playback). */
  allowedOrigins: string[];
  bucketName?: string;
}

export class ContentBucket extends Construct {
  readonly bucket: IBucket;

  constructor(scope: Construct, id: string, props: ContentBucketProps) {
    super(scope, id);
    const account = Stack.of(this).account;

    this.bucket = new Bucket(this, "Bucket", {
      bucketName: props.bucketName ?? `aventiqlab-alchemy-content-${account}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          // Published versions are immutable, so noncurrent versions only arise from
          // re-uploaded drafts. Keep them briefly for recovery, then drop them.
          id: "bound-noncurrent-versions",
          noncurrentVersionExpiration: Duration.days(90),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
      cors: [
        {
          allowedMethods: [HttpMethods.GET, HttpMethods.HEAD],
          allowedOrigins: props.allowedOrigins,
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag", "Content-Length", "Content-Type", "Accept-Ranges", "Content-Range"],
          maxAge: 3600,
        },
      ],
    });
  }
}
