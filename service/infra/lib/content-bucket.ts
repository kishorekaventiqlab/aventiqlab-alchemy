/**
 * AL7 — the alchemy Content Studio S3 bucket.
 *
 * Key layout (see docs/content-studio-al7-bucket-plan.md):
 *   generated/{experience_id}/{artifact_type}/attempt-N.json        scratch (CD-1: full response envelope)
 *   generated/{experience_id}/{artifact_type}/attempt-N.error.json  scratch (CD-2: failed-generation trail)
 *   renders/{experience_id}/cycle-C/attempt-A.*                     scratch (AL5 owns the internal structure)
 *   produced/{experience_id}/*                                      DURABLE - never lifecycle-expired
 *
 * Retention is by PREFIX, not object tags - a prefix lifecycle rule and
 * prefix-scoped IAM can't be silently defeated by a missing tag.
 *
 * Encryption: SSE-S3. Access is 100% alchemy-internal (contract OQ-6: astra
 * proxies alchemy's sign endpoint, never reads S3 cross-account), so a CMK's
 * cross-account key policy buys nothing.
 *
 * The grant* methods are reusable helpers. AL7 does NOT wire them to any
 * Lambda - AL3 wires grantGeneratedWrite + grantReadForPresign to its route
 * Lambda; AL5 wires grantRendersWrite + grantPromoteToProduced to the render
 * compute role; AL6 reuses AL3's grantReadForPresign.
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

/** Object-key prefixes. Retention class + IAM scope both key off these. */
export const PREFIX = {
  generated: "generated/",
  renders: "renders/",
  produced: "produced/",
} as const;

export interface ContentBucketProps {
  /** Days before scratch objects (generated/* and renders/*) expire. */
  scratchRetentionDays: number;
  /**
   * Explicit bucket name. Defaults to "aventiqlab-alchemy-content".
   * Overridable for tests / a non-prod account.
   */
  bucketName?: string;
}

export class ContentBucket extends Construct {
  readonly bucket: IBucket;

  constructor(scope: Construct, id: string, props: ContentBucketProps) {
    super(scope, id);

    this.bucket = new Bucket(this, "Bucket", {
      bucketName: props.bucketName ?? "aventiqlab-alchemy-content",
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "expire-generated-scratch",
          prefix: PREFIX.generated,
          expiration: Duration.days(props.scratchRetentionDays),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(props.scratchRetentionDays),
        },
        {
          id: "expire-render-scratch",
          prefix: PREFIX.renders,
          expiration: Duration.days(props.scratchRetentionDays),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(props.scratchRetentionDays),
        },
        {
          // produced/* is the learner-facing deliverable - NEVER expire it
          // (contract OQ-4 / ADR-0001). Only keep noncurrent versions bounded
          // so an accidental overwrite is recoverable without unbounded cost.
          id: "produced-keep-forever-bounded-versions",
          prefix: PREFIX.produced,
          noncurrentVersionExpiration: Duration.days(30),
          abortIncompleteMultipartUploadAfter: Duration.days(7),
        },
      ],
    });
  }

  /** AL3 service Lambda: write generated artifacts + their error trail (generated/*). */
  grantGeneratedWrite(grantee: IGrantable): Grant {
    return this.bucket.grantPut(grantee, `${PREFIX.generated}*`);
  }

  /** AL5 render compute: write render attempts (renders/*). */
  grantRendersWrite(grantee: IGrantable): Grant {
    return this.bucket.grantPut(grantee, `${PREFIX.renders}*`);
  }

  /** AL5 (or astra-triggered promote): write the durable deliverable (produced/*). */
  grantProducedWrite(grantee: IGrantable): Grant {
    return this.bucket.grantPut(grantee, `${PREFIX.produced}*`);
  }

  /**
   * AL5 "promote to produced": CopyObject renders/* -> produced/*.
   * Needs read on the source prefix plus put on the dest prefix.
   */
  grantPromoteToProduced(grantee: IGrantable): Grant {
    this.bucket.grantRead(grantee, `${PREFIX.renders}*`);
    return this.bucket.grantPut(grantee, `${PREFIX.produced}*`);
  }

  /**
   * AL6 presigning (same Lambda as AL3): read + presign GET across all prefixes.
   * A presigned URL grants exactly the signer's GetObject on that key, so this
   * grant IS the presign capability - no extra permission needed.
   */
  grantReadForPresign(grantee: IGrantable): Grant {
    this.bucket.grantRead(grantee, `${PREFIX.generated}*`);
    this.bucket.grantRead(grantee, `${PREFIX.renders}*`);
    return this.bucket.grantRead(grantee, `${PREFIX.produced}*`);
  }
}
