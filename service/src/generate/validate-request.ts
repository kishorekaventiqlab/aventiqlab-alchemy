/**
 * Validate the POST /v1/generate request body (contract §7.1) and resolve the
 * artifact type.
 *
 * CD-4: the learning-ir version lives INSIDE learning_context.schema_version.
 * An unknown version -> validation_failed.
 */
import { ServiceError, validationFailed } from "../errors/envelope.js";
import {
  V1_ARTIFACT_TYPES,
  isAl3SupportedType,
  type Al3SupportedType,
  type GenerateRequest,
} from "./types.js";

const SUPPORTED_LEARNING_IR_VERSIONS = new Set(["learning-ir/v1"]);

export interface ValidatedRequest {
  req: GenerateRequest;
  /**
   * The literal artifact_type astra sent — echoed back in the response's
   * own `artifact_type` field and used for the S3 storage path segment.
   * Astra has zero concept of video/v1 vs video/v2 (confirmed: it always
   * sends "video", never "video_v2"), so everything it can observe must
   * stay byte-identical to today regardless of which schema was actually
   * used internally.
   */
  type: Al3SupportedType;
  /**
   * The resolved dispatch key actually used for schema/prompt/self-check
   * lookup and the emitted `schema_version`. Identity to `type` for every
   * artifact type except a plain "video" request, which resolves to
   * "video_v2" — routing new video generations to the topic-neutral,
   * mobile-readable schema instead of the frozen (and Kubernetes-shaped)
   * video/v1 one. An explicit "video_v2" request still resolves to itself
   * (no remapping needed — it already means v2). video/v1's own schema/
   * prompt/self-check stay fully reachable: by already-generated content
   * (schema_version is baked in at generation time) and by anything that
   * explicitly asks for the frozen contract type in the future.
   */
  internalType: Al3SupportedType;
}

/** "video" -> "video_v2" for new generations; identity for every other type (including an explicit "video_v2" request). */
function resolveInternalType(type: Al3SupportedType): Al3SupportedType {
  return type === "video" ? "video_v2" : type;
}

export function validateGenerateRequest(body: unknown): ValidatedRequest {
  if (typeof body !== "object" || body === null) {
    throw validationFailed("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.experience_id !== "string" || !b.experience_id.trim()) {
    throw validationFailed("`experience_id` is required.");
  }
  if (typeof b.artifact_type !== "string") {
    throw validationFailed("`artifact_type` is required.");
  }
  if (typeof b.attempt !== "number" || !Number.isInteger(b.attempt) || b.attempt < 1) {
    throw validationFailed("`attempt` must be an integer >= 1.");
  }
  if (b.prior_error != null && typeof b.prior_error !== "string") {
    throw validationFailed("`prior_error` must be a string or null.");
  }

  // artifact_type: known v1 type? generatable at all? supported by AL3 yet?
  // "video_v2" is a deliberate exception to the V1_ARTIFACT_TYPES gate below:
  // it's NOT part of the frozen contract v1.3 §3.1 enum (video/v1 stays
  // exactly as astra signed off on it) — it's an additive, alchemy-internal
  // artifact_type for the topic-neutral video/v2 schema, reached only by a
  // caller that explicitly opts in by sending artifact_type: "video_v2".
  const at = b.artifact_type;
  if (at !== "video_v2" && !(V1_ARTIFACT_TYPES as readonly string[]).includes(at)) {
    if (at === "battleground") {
      throw new ServiceError("unsupported_type", "`battleground` is not a generatable content type.");
    }
    throw new ServiceError("unsupported_type", `Unknown artifact_type "${at}".`);
  }
  if (!isAl3SupportedType(at)) {
    throw new ServiceError("unsupported_type", `artifact_type "${at}" is not supported.`);
  }

  // learning_context + its version (CD-4)
  const ctx = b.learning_context;
  if (typeof ctx !== "object" || ctx === null) {
    throw validationFailed("`learning_context` is required and must be an object.");
  }
  const version = (ctx as Record<string, unknown>).schema_version;
  if (typeof version !== "string") {
    throw validationFailed("`learning_context.schema_version` is required.");
  }
  if (!SUPPORTED_LEARNING_IR_VERSIONS.has(version)) {
    throw validationFailed(
      `Unsupported learning_context.schema_version "${version}" — expected one of: ${[...SUPPORTED_LEARNING_IR_VERSIONS].join(", ")}.`,
    );
  }

  return {
    req: {
      experience_id: b.experience_id,
      artifact_type: at,
      attempt: b.attempt,
      learning_context: ctx as GenerateRequest["learning_context"],
      prior_error: (b.prior_error as string | undefined) ?? null,
    },
    type: at,
    internalType: resolveInternalType(at),
  };
}
