/**
 * AL7 — the alchemy Content Studio S3 bucket.
 *
 * Key layout (see docs/content-studio-al7-bucket-plan.md):
 *   generated/{experience_id}/{artifact_type}/attempt-N.json        scratch (CD-1: full response envelope)
 *   generated/{experience_id}/{artifact_type}/attempt-N.error.json  scratch (CD-2: failed-generation trail)
 *   renders/{experience_id}/cycle-C/attempt-A.*                     scratch (AL5 owns the internal structure)
 *   produced/{experience_id}/*                                      DURABLE — never lifecycle-expired
 *
 * Retention is by PREFIX, not object tags — a prefix lifecycle rule and
 * prefix-scoped IAM can't be silently defeated by a missing tag.
 *
 * Encryption: SSE-S3. Access is 100% alchemy-internal (contract OQ-6: astra
 * proxies alchemy's sign endpoint, never reads S3 cross-account), so a CMK's
 * cross-account key policy buys nothing.
 */
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import {
  Bucket,
  BucketEncryption,
  BlockPublicAccess,
  ObjectOwnership,
  type IBucket,
} from "aws-cdk-lib/aws-s3";
import { Grant, type IGrantable } from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface ContentBucketProps {
  /** Days before scratch objects (generated/* and renders/*) expire. */
  scratchRetentionDays: number;
}

export class ContentBucket extends Construct {
  readonly bucket: IBucket;

  constructor(scope: Construct, id: string, props: ContentBucketProps) {
    super(scope, id);

    this.bucket = new Bucket(this, "Bucket", {
      bucketName: "aventiqlab-alchemy-content",
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "expire-generated-scratch",
          prefix: "generated/",
          expiration: Duration.days(props.scratchRetentionDays),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(props.scratchRetentionDays),
        },
        {
          id: "expire-render-scratch",
          prefix: "renders/",
          expiration: Duration.days(props.scratchRetentionDays),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(props.scratchRetentionDays),
        },
        {
          // produced/* is the learner-facing deliverable — NEVER expire it
          // (contract OQ-4 / ADR-0001). Only keep noncurrent versions bounded
          // so an accidental overwrite is recoverable without unbounded cost.
          id: "produced-keep-forever-bounded-versions",
          prefix: "produced/",
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });
  }

  /** AL3 service Lambda: write generated artifacts + their error trail. */
  grantWriteGenerated(grantee: IGrantable): Grant {
    return this.bucket.grantPut(grantee, "generated/*");
  }

  /** AL5 render compute: write render attempts. */
  grantWriteRenders(grantee: IGrantable): Grant {
    return this.bucket.grantPut(grantee, "renders/*");
  }

  /** AL5 "promote to produced": copy the winning render into the durable prefix. */
  grantPromoteToProduced(grantee: IGrantable): Grant {
    // CopyObject needs read on source (renders/*) + put on dest (produced/*).
    this.bucket.grantRead(grantee, "renders/*");
    return this.bucket.grantPut(grantee, "produced/*");
  }

  /**
   * AL6 presigning (same Lambda as AL3): read + presign GET across all prefixes.
   * A presigned URL grants exactly the signer's GetObject on that key, so this
   * grant IS the presign capability — no extra permission needed.
   */
  grantReadForPresign(grantee: IGrantable): Grant {
    this.bucket.grantRead(grantee, "generated/*");
    this.bucket.grantRead(grantee, "renders/*");
    return this.bucket.grantRead(grantee, "produced/*");
  }
}
