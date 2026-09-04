/**
 * Request / response + job-record shapes for the async render flow
 * (contract §7.4 / §7.5, AL5 rev-2 plan, CD-17).
 */

/** Vision QA verdict categories (contract §5.5). content_flaw never reaches /v1/render. */
export const VISION_QA_CATEGORIES = ["pass", "layout_bug", "pacing_issue", "narration_flaw", "content_flaw"] as const;
export type VisionQaCategory = (typeof VISION_QA_CATEGORIES)[number];

export interface VisionQaFeedback {
  category: VisionQaCategory;
  reason?: string;
  evidence?: { beat_id?: string; [k: string]: unknown };
}

/** POST /v1/render request body — contract §7.4. */
export interface RenderRequest {
  experience_id: string;
  cycle: number;
  video_spec: Record<string, unknown>;
  vision_qa_feedback?: VisionQaFeedback | null;
}

/** POST /v1/render response — 202. */
export interface RenderAccepted {
  render_job_id: string;
  experience_id: string;
  cycle: number;
  status: "pending";
}

export type RenderJobStatus = "pending" | "running" | "done" | "failed";
export type RenderPhase = "synthesizing" | "rendering" | "validating" | null;

export interface MechanicalQa {
  passed: boolean;
  checks: Array<{ name: string; pass: boolean; detail: string }>;
}

/**
 * Mobile visual QA verdict (video-studio/scripts/validate-render-visual.ts).
 * Unlike mechanical_qa (always computed), this is genuinely ABSENT when the
 * render worker has no vision-model key configured — never defaulted to a
 * failing stand-in the way mechanical_qa is, since "not run" and "ran and
 * failed" are different states a caller (astra) needs to tell apart.
 */
export interface VisualQa {
  passed: boolean;
  failureReasons: string[];
  categoryMinimums: Record<string, number>;
}

export interface RenderOutput {
  s3_pointer: string;
  duration_sec: number;
  poster_s3_pointer: string;
}

/** The job record (DynamoDB `alchemy-render-jobs`). */
export interface RenderJob {
  render_job_id: string;
  experience_id: string;
  cycle: number;
  status: RenderJobStatus;
  phase: RenderPhase;
  request_s3_key: string;
  mechanical_qa?: MechanicalQa;
  visual_qa?: VisualQa;
  output?: RenderOutput;
  /** F3: s3:// pointer to the video_spec alchemy actually rendered. */
  rendered_spec_pointer?: string;
  error?: { code: string; message: string; retryable: boolean };
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  /** epoch seconds — DynamoDB TTL. */
  ttl: number;
}

/** GET /v1/render/{id} response — one of three shapes. */
export type RenderJobView =
  | {
      render_job_id: string;
      experience_id: string;
      cycle: number;
      status: "pending" | "running";
      started_at?: string;
      phase: RenderPhase;
    }
  | {
      render_job_id: string;
      experience_id: string;
      cycle: number;
      status: "done";
      started_at?: string;
      finished_at?: string;
      mechanical_qa: MechanicalQa;
      /** Absent when visual QA didn't run (no vision-model key configured) — see VisualQa's own doc comment. */
      visual_qa?: VisualQa;
      output: RenderOutput;
      rendered_spec_pointer: string;
    }
  | {
      render_job_id: string;
      experience_id: string;
      cycle: number;
      status: "failed";
      started_at?: string;
      finished_at?: string;
      error: { code: string; message: string; retryable: boolean };
    };

export function jobToView(job: RenderJob): RenderJobView {
  const base = {
    render_job_id: job.render_job_id,
    experience_id: job.experience_id,
    cycle: job.cycle,
    started_at: job.started_at,
  };
  if (job.status === "done") {
    return {
      ...base,
      status: "done",
      finished_at: job.finished_at,
      mechanical_qa: job.mechanical_qa ?? { passed: false, checks: [] },
      visual_qa: job.visual_qa,
      output: job.output ?? { s3_pointer: "", duration_sec: 0, poster_s3_pointer: "" },
      rendered_spec_pointer: job.rendered_spec_pointer ?? "",
    };
  }
  if (job.status === "failed") {
    return {
      ...base,
      status: "failed",
      finished_at: job.finished_at,
      error: job.error ?? { code: "internal_error", message: "render failed", retryable: false },
    };
  }
  return { ...base, status: job.status, phase: job.phase };
}

/** POST /v1/artifacts/promote — CD-18. */
export interface PromoteRequest {
  experience_id: string;
  cycle: number;
}
export interface PromoteResponse {
  produced: { s3_pointer: string; poster_s3_pointer: string };
}
