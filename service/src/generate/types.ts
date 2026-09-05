/**
 * Request / response shapes for POST /v1/generate, locked to the frozen
 * contract v1.3 §7.1 / §7.2 (+ contract decisions CD-1..CD-5).
 */

/** The 5 v1 artifact types (contract §3.1). `battleground` is not generatable. */
export const V1_ARTIFACT_TYPES = ["material", "video", "source_code_lab", "quiz", "skill_evaluator"] as const;
export type V1ArtifactType = (typeof V1_ARTIFACT_TYPES)[number];

/**
 * Types AL3 generates. `video` landed with AL8 (the video/v1 per-beat schema).
 * `video_v2` is NOT part of the frozen v1.3 contract's `V1_ARTIFACT_TYPES` —
 * it's an additive, alchemy-internal artifact_type for the topic-neutral
 * video/v2 schema (video-schema-v2.ts), opted into explicitly by a caller
 * that sends artifact_type: "video_v2". video/v1 stays exactly as-is.
 */
export const AL3_SUPPORTED_TYPES = [
  "material",
  "source_code_lab",
  "quiz",
  "skill_evaluator",
  "video",
  "video_v2",
] as const;
export type Al3SupportedType = (typeof AL3_SUPPORTED_TYPES)[number];

export function isAl3SupportedType(t: string): t is Al3SupportedType {
  return (AL3_SUPPORTED_TYPES as readonly string[]).includes(t);
}

/** §3.8 schema-version tag per type. astra owns these; alchemy emits the match. */
export const SCHEMA_VERSION: Record<Al3SupportedType, string> = {
  material: "material/v1",
  source_code_lab: "source-code-lab/v1",
  quiz: "quiz/v1",
  skill_evaluator: "skill-evaluator/v1",
  video: "video/v1",
  video_v2: "video/v2",
};

/** Request body — contract §7.1. */
export interface GenerateRequest {
  experience_id: string;
  artifact_type: string;
  attempt: number;
  /** The confirmed §5.4 Learning IR object. Carries `schema_version` (CD-4). */
  learning_context: LearningContext;
  /** On a retry (attempt > 1): the exact validator error astra got. */
  prior_error?: string | null;
}

/**
 * The §5.4 Learning IR. Only the fields AL3's generators read are typed
 * precisely; the rest are carried through. Every string here is UNTRUSTED
 * (may contain instructor free-text edits per §6.1 / CD-3).
 */
export interface LearningContext {
  schema_version: string;
  learning_context_id?: string;
  title?: string;
  topic?: string;
  learner_level?: string;
  tone?: string;
  progression_archetype?: string;
  learner_profile_refs?: string[];
  target_capabilities?: Array<{ id: string; resolved?: boolean; name?: string }>;
  learning_outcomes?: Array<Record<string, unknown>>;
  scenario?: string;
  business_context?: string;
  technical_environment?: {
    platform?: string;
    infrastructure_summary?: string;
    key_services?: string[];
  };
  starting_state?: string;
  learner_mission?: string;
  expected_investigation?: string[];
  expected_decisions?: Array<{
    decision_point?: string;
    options_considered?: string[];
    sound_reasoning?: string;
  }>;
  trade_offs?: Array<{ tension?: string; choice_a?: string; choice_b?: string }>;
  constraints?: string[];
  failure_modes?: string[];
  success_conditions?: string[];
  mental_model?: string[];
  core_concept?: string;
  learner_problem?: string;
  /**
   * The instructor-reviewed architecture diagram from astra's Context Review
   * step (video artifact_type only — astra strips this for other types).
   * Its mere presence on a real /v1/generate call is itself the approval
   * signal: astra's PipelineRun can only reach GENERATING after the
   * instructor's Context Review confirm action, so there is no
   * proposed-but-unconfirmed state that could reach here. Shape mirrors
   * video/v2's own `architecture` visual payload (entities/relationships)
   * so no translation is needed before prompts.ts consumes it directly.
   */
  visual_plan?: {
    entities: Array<{ id: string; category: string; label: string; sublabel?: string }>;
    relationships: Array<{ from_id: string; to_id: string }>;
    mechanism_summary?: string;
  };
  [key: string]: unknown;
}

/** Response body — contract §7.2 (CD-1: s3_pointer stores the full envelope). */
export interface GenerateResponse {
  artifact_type: Al3SupportedType;
  schema_version: string;
  content: Record<string, unknown>;
  preview: Record<string, unknown>;
  s3_pointer: string;
}

/** What's actually stored at s3_pointer (CD-1): response + generation metadata. */
export interface StoredEnvelope extends GenerateResponse {
  metadata: GenerationMetadata;
}

export interface GenerationMetadata {
  experience_id: string;
  attempt: number;
  prompt_version: string;
  model: string;
  generated_at: string;
}

/** What's stored at attempt-N.error.json on a failed generation (CD-2). */
export interface StoredErrorEnvelope {
  artifact_type: string;
  experience_id: string;
  attempt: number;
  error: { code: string; message: string };
  raw_model_output: string | null;
  prompt_version: string;
  model: string;
  failed_at: string;
}
