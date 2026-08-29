/**
 * The S3 seam for AL6: HeadObject + presigned GET. Injectable so the route can
 * be tested without live AWS.
 */
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface HeadResult {
  exists: boolean;
  contentType?: string;
}

export interface PresignInput {
  key: string;
  ttlSeconds: number;
  /** Pinned as ResponseContentType so the browser gets the right type. */
  responseContentType: string;
}

export interface ArtifactSigner {
  head(key: string): Promise<HeadResult>;
  presignGet(input: PresignInput): Promise<string>;
}

/** Thrown by head() only for non-404 failures (throttle, permission, outage). */
export class S3HeadError extends Error {
  constructor(
    message: string,
    readonly cause: unknown,
  ) {
    super(message);
    this.name = "S3HeadError";
  }
}

function isNotFound(err: unknown): boolean {
  const name = (err as { name?: string }).name;
  const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

export class S3ArtifactSigner implements ArtifactSigner {
  readonly #s3: S3Client;
  readonly #bucket: string;

  constructor(bucket: string, region: string, s3?: S3Client) {
    this.#bucket = bucket;
    this.#s3 = s3 ?? new S3Client({ region });
  }

  async head(key: string): Promise<HeadResult> {
    try {
      const res = await this.#s3.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key }));
      return { exists: true, contentType: res.ContentType };
    } catch (err) {
      if (isNotFound(err)) return { exists: false };
      throw new S3HeadError(`HeadObject failed for ${key}`, err);
    }
  }

  async presignGet(input: PresignInput): Promise<string> {
    // The URL is signed with this client's credentials and grants exactly their
    // GetObject permission for this key + expiry. Under a Lambda execution role
    // the credentials outlive the (<=1h) TTL, so `expiresIn` is always honoured.
    return getSignedUrl(
      this.#s3,
      new GetObjectCommand({
        Bucket: this.#bucket,
        Key: input.key,
        ResponseContentType: input.responseContentType,
      }),
      { expiresIn: input.ttlSeconds },
    );
  }
}
