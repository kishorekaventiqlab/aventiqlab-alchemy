/**
 * Derive the §5.5 Gate-1 `preview` from `content` — programmatically, no
 * second model call (guaranteed consistency, no extra cost/latency).
 */
import type { Al3SupportedType } from "./types.js";

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
  }
}
