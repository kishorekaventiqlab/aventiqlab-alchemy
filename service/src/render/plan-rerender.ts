/**
 * planReRender — pure function deciding what a cycle > 1 render needs to redo,
 * given astra's Vision QA verdict (contract §7.4, CD-20).
 *
 * CD-20: astra applies layout_bug / pacing_issue spec edits ITSELF (a
 * deterministic transform on its side) before calling /v1/render. alchemy
 * renders what it's given. alchemy owns only the narration_flaw single-beat
 * regen and a pacing_issue tail-buffer bump.
 */
import { ServiceError } from "../errors/envelope.js";
import type { VisionQaFeedback } from "./types.js";

export interface ReRenderPlan {
  /** Beat ids whose narration alchemy must regenerate (a model call each). */
  regenBeatIds: string[];
  /** True when every beat's cached audio can be reused as-is. */
  reuseAllAudio: boolean;
  /** Extra seconds of tail buffer to pass into retimeBeats (pacing_issue). */
  tailBufferBumpSec: number;
}

/**
 * @param cycle     the render cycle (1 = first render, no feedback)
 * @param feedback  astra's Vision QA verdict, or null on cycle 1
 */
export function planReRender(cycle: number, feedback: VisionQaFeedback | null | undefined): ReRenderPlan {
  if (cycle <= 1 || !feedback) {
    // First render — synthesize everything (the tts-cache still helps if a
    // narration_hash already exists from a prior experience).
    return { regenBeatIds: [], reuseAllAudio: false, tailBufferBumpSec: 0 };
  }

  switch (feedback.category) {
    case "pass":
      // A "pass" verdict shouldn't trigger a re-render, but if it does: no-op re-render.
      return { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 0 };

    case "layout_bug":
      // astra already edited the video_spec (CD-20). Render it with cached audio.
      return { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 0 };

    case "pacing_issue":
      // astra may have edited target_duration_sec values; alchemy also bumps the
      // tail buffer so on-screen content doesn't outlast the narration.
      return { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 1.5 };

    case "narration_flaw": {
      const beatId = feedback.evidence?.beat_id;
      if (typeof beatId !== "string" || !beatId.trim()) {
        throw new ServiceError(
          "validation_failed",
          "vision_qa_feedback.category is 'narration_flaw' but evidence.beat_id is missing.",
        );
      }
      return { regenBeatIds: [beatId], reuseAllAudio: false, tailBufferBumpSec: 0 };
    }

    case "content_flaw":
      // Never arrives — astra escalates (§8, 0 retries).
      throw new ServiceError(
        "validation_failed",
        "vision_qa_feedback.category 'content_flaw' is not a re-renderable category — astra escalates these.",
      );

    default:
      throw new ServiceError(
        "validation_failed",
        `Unknown vision_qa_feedback.category "${String((feedback as { category?: unknown }).category)}".`,
      );
  }
}
