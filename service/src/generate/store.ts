/**
 * S3 writes for /v1/generate (AL7 bucket, generated/ prefix).
 *
 * CD-1: attempt-N.json stores the FULL response envelope + generation metadata.
 * CD-2: attempt-N.error.json stores the raw model output + the parse/validation
 *       error, for astra's escalation trail.
 *
 * Key: generated/{experience_id}/{artifact_type}/attempt-{N}.json
 */
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { StoredEnvelope, StoredErrorEnvelope } from "./types.js";

export interface ArtifactStore {
  putEnvelope(key: ArtifactKey, envelope: StoredEnvelope): Promise<string>;
  putErrorEnvelope(key: ArtifactKey, envelope: StoredErrorEnvelope): Promise<string>;
}

export interface ArtifactKey {
  experienceId: string;
  artifactType: string;
  attempt: number;
}

function objectKey(k: ArtifactKey, suffix: "json" | "error.json"): string {
  return `generated/${k.experienceId}/${k.artifactType}/attempt-${k.attempt}.${suffix}`;
}

export class S3ArtifactStore implements ArtifactStore {
  readonly #s3: S3Client;
  readonly #bucket: string;

  constructor(bucket: string, region: string, s3?: S3Client) {
    this.#bucket = bucket;
    this.#s3 = s3 ?? new S3Client({ region });
  }

  async putEnvelope(key: ArtifactKey, envelope: StoredEnvelope): Promise<string> {
    const k = objectKey(key, "json");
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: k,
        Body: JSON.stringify(envelope, null, 2),
        ContentType: "application/json",
      }),
    );
    return `s3://${this.#bucket}/${k}`;
  }

  async putErrorEnvelope(key: ArtifactKey, envelope: StoredErrorEnvelope): Promise<string> {
    const k = objectKey(key, "error.json");
    await this.#s3.send(
      new PutObjectCommand({
        Bucket: this.#bucket,
        Key: k,
        Body: JSON.stringify(envelope, null, 2),
        ContentType: "application/json",
      }),
    );
    return `s3://${this.#bucket}/${k}`;
  }
}

export { objectKey };
