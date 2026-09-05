/**
 * Regression pin for learning_context.visual_plan (video_v2 only): astra's
 * Context Review step produces an instructor-approved architecture diagram
 * and forwards it verbatim on video generation requests; its shape mirrors
 * video/v2's own `architecture` visual (entities/relationships) so no
 * translation layer is needed. Presence alone is the approval signal —
 * astra's PipelineRun can only reach GENERATING after the instructor's
 * Context Review confirm, so there is no proposed-but-unconfirmed state.
 *
 * Real-model verification (3 live Gemini calls, not part of this repo) showed
 * ALL architecture beats (context_mental_model, decision, best_practice)
 * reusing the exact approved entity ids with zero invented substitutes once
 * this prompt block was added — this file pins the deterministic, testable
 * part: buildPrompt's own construction of that block.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPrompt } from "./prompts.js";
import { LEARNING_CONTEXT_GIT } from "./fixtures.js";
import type { LearningContext } from "./types.js";

const VISUAL_PLAN = {
  entities: [
    { id: "commit-main-a", category: "process", label: "Commit A" },
    { id: "ref-main", category: "actor", label: "main", sublabel: "branch ref" },
  ],
  relationships: [{ from_id: "ref-main", to_id: "commit-main-a" }],
  mechanism_summary: "main points at the latest commit.",
};

test("video_v2 prompt includes the visual_plan block, with entity/relationship data verbatim, when present", () => {
  const ctx: LearningContext = { ...LEARNING_CONTEXT_GIT, visual_plan: VISUAL_PLAN };
  const prompt = buildPrompt("video_v2", ctx, null);

  assert.match(prompt.user, /INSTRUCTOR HAS ALREADY REVIEWED AND APPROVED THIS EXACT DIAGRAM/);
  assert.match(prompt.user, /"commit-main-a"/);
  assert.match(prompt.user, /"ref-main"/);
  assert.match(prompt.user, /category: "process"/);
  assert.match(prompt.user, /sublabel: "branch ref"/);
  assert.match(prompt.user, /from_id: "ref-main", to_id: "commit-main-a"/);
  assert.match(prompt.user, /main points at the latest commit/);

  // The reuse instruction must cover both the first beat AND every later one
  // (decision/best_practice) — a partial fix (first beat only) would silently
  // reproduce today's cross-beat-continuity gap for the approved diagram too.
  assert.match(prompt.user, /FIRST architecture-kind beat/);
  assert.match(prompt.user, /EVERY LATER architecture-kind beat/);
});

test("video_v2 prompt has NO visual_plan block when the field is absent (default, unaffected requests)", () => {
  const prompt = buildPrompt("video_v2", LEARNING_CONTEXT_GIT, null);
  assert.doesNotMatch(prompt.user, /APPROVED THIS EXACT DIAGRAM/);
});

test("video_v2 prompt has NO visual_plan block when visual_plan.entities is empty", () => {
  const ctx: LearningContext = { ...LEARNING_CONTEXT_GIT, visual_plan: { entities: [], relationships: [] } };
  const prompt = buildPrompt("video_v2", ctx, null);
  assert.doesNotMatch(prompt.user, /APPROVED THIS EXACT DIAGRAM/);
});

test("visual_plan on a NON-video_v2 type is ignored entirely (astra only sends it for video anyway)", () => {
  const ctx: LearningContext = { ...LEARNING_CONTEXT_GIT, visual_plan: VISUAL_PLAN };
  const prompt = buildPrompt("material", ctx, null);
  assert.doesNotMatch(prompt.user, /APPROVED THIS EXACT DIAGRAM/);
});

test("video (v1) ignores visual_plan even if present — v1 generation is retired, this is v2-only", () => {
  const ctx: LearningContext = { ...LEARNING_CONTEXT_GIT, visual_plan: VISUAL_PLAN };
  const prompt = buildPrompt("video", ctx, null);
  assert.doesNotMatch(prompt.user, /APPROVED THIS EXACT DIAGRAM/);
});
