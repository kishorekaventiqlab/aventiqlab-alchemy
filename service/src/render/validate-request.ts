/**
 * Validate the POST /v1/render request body (contract §7.4).
 *
 * The video_spec is validated with the SAME AL3 self-check used by
 * /v1/generate for artifact_type "video" — one source of truth for what a
 * valid video/v1 spec is.
 */
import { ServiceError, validationFailed } from "../errors/envelope.js";
import { selfCheck } from "../generate/selfcheck.js";
import { VISION_QA_CATEGORIES, type RenderRequest, type VisionQaFeedback } from "./types.js";

export function validateRenderRequest(body: unknown): RenderRequest {
  if (typeof body !== "object" || body === null) {
    throw validationFailed("Request body must be a JSON object.");
  }
  const b = body as Record<string, unknown>;

  if (typeof b.experience_id !== "string" || !b.experience_id.trim()) {
    throw validationFailed("`experience_id` is required.");
  }
  if (typeof b.cycle !== "number" || !Number.isInteger(b.cycle) || b.cycle < 1) {
    throw validationFailed("`cycle` must be an integer >= 1.");
  }
  if (typeof b.video_spec !== "object" || b.video_spec === null) {
    throw validationFailed("`video_spec` is required and must be an object.");
  }

  const spec = b.video_spec as Record<string, unknown>;
  if (spec.schema_version !== "video/v1") {
    throw new ServiceError(
      "unsupported_type",
      `video_spec.schema_version must be "video/v1", got "${String(spec.schema_version)}".`,
    );
  }
  const check = selfCheck("video", spec);
  if (!check.ok) {
    throw validationFailed(`video_spec failed validation: ${check.errors.join("; ")}`);
  }

  let feedback: VisionQaFeedback | null = null;
  if (b.vision_qa_feedback != null) {
    if (typeof b.vision_qa_feedback !== "object") {
      throw validationFailed("`vision_qa_feedback` must be an object or null.");
    }
    const f = b.vision_qa_feedback as Record<string, unknown>;
    if (typeof f.category !== "string" || !(VISION_QA_CATEGORIES as readonly string[]).includes(f.category)) {
      throw validationFailed(
        `vision_qa_feedback.category must be one of: ${VISION_QA_CATEGORIES.join(", ")}.`,
      );
    }
    feedback = {
      category: f.category as VisionQaFeedback["category"],
      reason: typeof f.reason === "string" ? f.reason : undefined,
      evidence: typeof f.evidence === "object" && f.evidence !== null ? (f.evidence as Record<string, unknown>) : undefined,
    };
  }

  return {
    experience_id: b.experience_id,
    cycle: b.cycle,
    video_spec: spec,
    vision_qa_feedback: feedback,
  };
}
