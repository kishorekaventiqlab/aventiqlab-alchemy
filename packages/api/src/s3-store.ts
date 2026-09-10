import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectHead, ObjectStore } from "./ports.js";

export class S3ObjectStore implements ObjectStore {
  constructor(
    private readonly bucket: string,
    private readonly s3: S3Client = new S3Client({}),
  ) {}

  async presignPut(key: string, contentType: string, ttlSec: number): Promise<{ url: string; headers: Record<string, string> }> {
    const url = await getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: ttlSec });
    // ContentType is part of the signature, so the uploader must send exactly this header.
    return { url, headers: { "content-type": contentType } };
  }

  async presignGet(key: string, ttlSec: number, responseContentType?: string): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key, ResponseContentType: responseContentType }),
      { expiresIn: ttlSec },
    );
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const out = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: out.ContentLength ?? 0, etag: out.ETag ?? "" };
    } catch (e) {
      const name = (e as { name?: string }).name;
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === "NotFound" || name === "NoSuchKey" || status === 404) return null;
      throw e;
    }
  }

  async sha256(key: string): Promise<string> {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const body = out.Body;
    if (!body) throw new Error(`empty body for ${key}`);
    const hash = createHash("sha256");
    const stream = body instanceof Readable ? body : Readable.fromWeb(body.transformToWebStream() as never);
    for await (const chunk of stream) hash.update(chunk as Buffer);
    return hash.digest("hex");
  }

  async putJson(key: string, body: unknown): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: JSON.stringify(body, null, 2), ContentType: "application/json" }),
    );
  }
}
