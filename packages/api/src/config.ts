/** Runtime configuration. Every resource name comes from the environment (set by CDK). */
export interface ApiConfig {
  tableName: string;
  bucketName: string;
  /** Presigned GET lifetime for learner-facing delivery. */
  signedUrlTtlSec: number;
  /** Presigned PUT lifetime handed to the publishing CLI. */
  uploadUrlTtlSec: number;
  /** Objects at or below this size are re-hashed server-side on publish. */
  verifyHashMaxBytes: number;
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number`);
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}

export function loadConfig(): ApiConfig {
  return {
    tableName: required("ALCHEMY_TABLE_NAME"),
    bucketName: required("ALCHEMY_BUCKET_NAME"),
    signedUrlTtlSec: int("ALCHEMY_SIGNED_URL_TTL_SEC", 900, 60, 3600),
    uploadUrlTtlSec: int("ALCHEMY_UPLOAD_URL_TTL_SEC", 3600, 300, 43200),
    verifyHashMaxBytes: int("ALCHEMY_VERIFY_HASH_MAX_BYTES", 32 * 1024 * 1024, 0, 1024 * 1024 * 1024),
  };
}
