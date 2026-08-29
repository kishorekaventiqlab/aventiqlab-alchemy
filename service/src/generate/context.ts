/**
 * Render the §5.4 Learning IR into the prompt's context block.
 *
 * CD-3: every string in learning_context is UNTRUSTED (it may carry instructor
 * free-text edits confirmed at Review Context, §6.1). It is wrapped in explicit
 * delimiters and never interpolated as instructions. The model is told, in the
 * system prompt, that everything inside <learning_context> is data describing
 * the situation — not commands.
 */
import type { LearningContext } from "./types.js";

const OPEN = "<learning_context>";
const CLOSE = "</learning_context>";

/** Strip anything that could be read as a delimiter-break or instruction fence. */
function sanitize(value: string): string {
  return value
    .replace(/<\/?learning_context>/gi, "[redacted-tag]")
    .replace(/```/g, "'''");
}

function line(label: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const v = value.trim();
    return v ? `${label}: ${sanitize(v)}` : null;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const items = value
      .map((v) => (typeof v === "string" ? sanitize(v) : JSON.stringify(v)))
      .map((v) => `  - ${v}`)
      .join("\n");
    return `${label}:\n${items}`;
  }
  return `${label}: ${sanitize(JSON.stringify(value))}`;
}

export function renderContextBlock(ctx: LearningContext): string {
  const parts: Array<string | null> = [
    line("Title", ctx.title),
    line("Topic", ctx.topic),
    line("Learner level", ctx.learner_level),
    line("Tone", ctx.tone),
    line("Progression archetype", ctx.progression_archetype),
    line("Learner problem", ctx.learner_problem),
    line("Core concept", ctx.core_concept),
    line("Scenario", ctx.scenario),
    line("Business context", ctx.business_context),
    line("Starting state", ctx.starting_state),
    line("Learner mission", ctx.learner_mission),
    ctx.technical_environment
      ? line("Technical environment", [
          ctx.technical_environment.platform && `platform: ${ctx.technical_environment.platform}`,
          ctx.technical_environment.infrastructure_summary &&
            `infrastructure: ${ctx.technical_environment.infrastructure_summary}`,
          ctx.technical_environment.key_services?.length &&
            `key services: ${ctx.technical_environment.key_services.join(", ")}`,
        ].filter(Boolean))
      : null,
    line("Target capabilities", ctx.target_capabilities?.map((c) => c.name ?? c.id)),
    line(
      "Learning outcomes",
      ctx.learning_outcomes?.map((o) => {
        const action = o.action as { verb?: string; statement?: string } | undefined;
        return [
          o.learner_summary,
          action?.verb && action?.statement ? `[${action.verb}] ${action.statement}` : undefined,
          o.expected_result,
        ]
          .filter(Boolean)
          .join(" — ");
      }),
    ),
    line("Expected investigation", ctx.expected_investigation),
    line(
      "Expected decisions",
      ctx.expected_decisions?.map((d) =>
        [
          d.decision_point,
          d.options_considered?.length ? `options: ${d.options_considered.join(" | ")}` : undefined,
          d.sound_reasoning ? `reasoning: ${d.sound_reasoning}` : undefined,
        ]
          .filter(Boolean)
          .join(" || "),
      ),
    ),
    line(
      "Trade-offs",
      ctx.trade_offs?.map((t) =>
        [t.tension, t.choice_a && `A: ${t.choice_a}`, t.choice_b && `B: ${t.choice_b}`]
          .filter(Boolean)
          .join(" / "),
      ),
    ),
    line("Constraints", ctx.constraints),
    line("Failure modes", ctx.failure_modes),
    line("Success conditions", ctx.success_conditions),
    line("Mental model", ctx.mental_model),
  ];

  const body = parts.filter((p): p is string => p != null).join("\n\n");
  return `${OPEN}\n${body}\n${CLOSE}`;
}
