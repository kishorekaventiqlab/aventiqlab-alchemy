/**
 * Derive the §5.5 Gate-1 `preview` from `content` — programmatically, no
 * second model call (guaranteed consistency, no extra cost/latency).
 */
import type { Al3SupportedType } from "./types.js";
import { STAGE_ORDER, type Stage, isStage } from "../lib/video-stage-coverage.js";

const STAGE_LABEL: Record<Stage, string> = {
  problem: "Problem",
  stakes: "Stakes",
  curiosity: "Curiosity",
  context_mental_model: "Context/Mental Model",
  options: "Options",
  trade_offs: "Trade-offs",
  investigation_demonstration: "Investigation/Demonstration",
  decision: "Decision",
  best_practice: "Best Practice",
  takeaway: "Takeaway",
};

/**
 * CD-10: the flat script_outline: string[] preview is DERIVED from beats[].
 * One line per narrative stage (first beat of each stage), in canonical order;
 * stage-less beats (a bare title card) are skipped; multiple beats sharing a
 * stage collapse to one line.
 */
export function deriveScriptOutline(beats: Array<Record<string, unknown>>): string[] {
  const firstBeatOfStage = new Map<Stage, Record<string, unknown>>();
  for (const b of beats) {
    const st = b.stage;
    if (typeof st === "string" && isStage(st) && !firstBeatOfStage.has(st)) {
      firstBeatOfStage.set(st, b);
    }
  }
  const lines: string[] = [];
  for (const stage of STAGE_ORDER) {
    const b = firstBeatOfStage.get(stage);
    if (!b) continue;
    const hint = typeof b.outline_hint === "string" && b.outline_hint.trim() ? b.outline_hint.trim() : undefined;
    const summary = hint ?? oneLine(String(b.narration ?? b.on_screen ?? ""));
    lines.push(`${STAGE_LABEL[stage]}: ${summary}`);
  }
  return lines;
}

function oneLine(text: string): string {
  const firstSentence = text.trim().split(/(?<=[.?!])\s/)[0] ?? text.trim();
  return firstSentence.length > 140 ? firstSentence.slice(0, 137).trimEnd() + "..." : firstSentence;
}

export function derivePreview(type: Al3SupportedType, content: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "material": {
      const body = String(content.body_markdown ?? "");
      const excerpt = body.replace(/^#.*$/gm, "").trim().split(/\s+/).slice(0, 40).join(" ");
      return {
        title: content.title,
        format: content.format,
        reading_time_minutes: content.reading_time_minutes,
        key_sections: content.key_sections ?? [],
        excerpt,
      };
    }
    case "quiz": {
      const questions = Array.isArray(content.questions) ? content.questions : [];
      const first = (questions[0] ?? {}) as Record<string, unknown>;
      const sample: Record<string, unknown> = {
        id: first.id,
        type: first.type,
        prompt: first.prompt,
        explanation: first.explanation,
      };
      if (first.options) sample.options = first.options;
      if (first.correct) sample.correct = first.correct;
      if (first.answer) sample.answer = first.answer;
      if (first.ordering) sample.ordering = first.ordering;
      return {
        question_count: questions.length,
        question_types: content.question_types ?? [],
        passing_threshold_percent: content.passing_threshold_percent,
        sample,
      };
    }
    case "source_code_lab": {
      const tasks = Array.isArray(content.tasks) ? content.tasks : [];
      return {
        title: content.title,
        repo_or_starter_ref: content.repo_or_starter_ref,
        environment_requirements: content.environment_requirements ?? [],
        tasks: tasks.map((t) => (t as { title?: unknown }).title).filter(Boolean),
        hints_available: content.hints_available ?? false,
      };
    }
    case "skill_evaluator": {
      return {
        scenario: content.scenario,
        opening_question: content.opening_question,
        skills_evaluated: content.skills_evaluated ?? [],
        scoring_dimensions: content.scoring_dimensions ?? [],
        pass_conditions: content.pass_conditions ?? {},
      };
    }
    case "video": {
      const beats = Array.isArray(content.beats) ? (content.beats as Array<Record<string, unknown>>) : [];
      return {
        title: content.title,
        format: content.format,
        estimated_duration_minutes: content.estimated_duration_minutes,
        // CD-10: the flat string[] the §5.5 preview + artifact-spec expect.
        script_outline: deriveScriptOutline(beats),
      };
    }
  }
}
