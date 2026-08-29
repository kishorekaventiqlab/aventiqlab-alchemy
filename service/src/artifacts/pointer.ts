/**
 * Parse + validate an s3:// artifact pointer (AL6 plan §3).
 *
 * This is the OQ-6 defense-in-depth: even though astra is authenticated, it
 * must not be able to have alchemy sign an object outside the agreed bucket /
 * prefixes, or an object belonging to a different pipeline run.
 */
import { validationFailed } from "../errors/envelope.js";

export type RetentionClass = "scratch" | "durable";

export interface ParsedPointer {
  key: string;
  /** "generated/" | "renders/" | "produced/" */
  prefix: string;
  /** The experience_id path segment embedded in the key. */
  experienceSegment: string;
  /** scratch = generated/ or renders/ (lifecycle-expirable); durable = produced/. */
  retentionClass: RetentionClass;
}

const ALLOWED_PREFIXES: Array<{ prefix: string; retention: RetentionClass }> = [
  { prefix: "generated/", retention: "scratch" },
  { prefix: "renders/", retention: "scratch" },
  { prefix: "produced/", retention: "durable" },
];

function hasControlOrWhitespace(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c <= 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * @param s3Pointer  the `s3://bucket/key` string from the request body
 * @param bucket     ALCHEMY_CONTENT_BUCKET (config, not hard-coded)
 * @param experienceId  the request body's experience_id — must match the key
 */
export function parseArtifactPointer(
  s3Pointer: unknown,
  bucket: string,
  experienceId: string,
): ParsedPointer {
  if (typeof s3Pointer !== "string" || !s3Pointer) {
    throw validationFailed("`s3_pointer` is required and must be a string.");
  }

  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Pointer);
  if (!m) {
    throw validationFailed("`s3_pointer` must be an s3://bucket/key URI.");
  }
  const [, pointerBucket, key] = m as unknown as [string, string, string];

  if (pointerBucket !== bucket) {
    throw validationFailed(`s3_pointer is for a different bucket than ${bucket}.`);
  }

  // Traversal / malformed-key guards: no parent refs, no empty segments, not a
  // bare prefix, no whitespace or ASCII control characters.
  if (
    key.includes("..") ||
    key.includes("//") ||
    key.endsWith("/") ||
    hasControlOrWhitespace(key)
  ) {
    throw validationFailed("s3_pointer key is malformed.");
  }

  const match = ALLOWED_PREFIXES.find((p) => key.startsWith(p.prefix));
  if (!match) {
    throw validationFailed(
      `s3_pointer key must be under one of: ${ALLOWED_PREFIXES.map((p) => p.prefix).join(", ")}.`,
    );
  }

  // key = "<prefix><experience_id>/<rest...>"
  const afterPrefix = key.slice(match.prefix.length);
  const experienceSegment = afterPrefix.split("/")[0] ?? "";
  if (!experienceSegment) {
    throw validationFailed("s3_pointer key has no experience_id segment.");
  }
  if (experienceSegment !== experienceId) {
    throw validationFailed("s3_pointer does not belong to the given experience_id.");
  }

  return {
    key,
    prefix: match.prefix,
    experienceSegment,
    retentionClass: match.retention,
  };
}
