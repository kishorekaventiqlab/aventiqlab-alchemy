/**
 * Self-validation of a generated `content` object before returning it to astra
 * (contract §4 of the AL3 plan).
 *
 * astra's jsonschema + capability cross-check stays AUTHORITATIVE. This is a
 * cheap local gate that:
 *   - catches structural / enum problems the model got wrong
 *   - runs the arithmetic the schema can't (weight_percent sums to 100, quiz
 *     answer keys resolve, material headings match key_sections)
 *
 * On failure -> the caller writes attempt-N.error.json (CD-2) and returns
 * `generation_failed` (retryable) with the reason as the message.
 *
 * It does NOT check capability-ref resolution (astra owns that — it has the
 * capability map and the context.target_capabilities[].resolved flags) or
 * pedagogical quality (astra's Reasoning + the human gates).
 */
import { Ajv, type ValidateFunction } from "ajv";
import { DELIVERABLE_SCHEMA } from "./schemas.js";
import type { Al3SupportedType } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
const validators = new Map<string, ValidateFunction>();

function validatorFor(type: Al3SupportedType): ValidateFunction {
  const existing = validators.get(type);
  if (existing) return existing;
  const compiled = ajv.compile(DELIVERABLE_SCHEMA[type] as object);
  validators.set(type, compiled);
  return compiled;
}

export interface SelfCheckResult {
  ok: boolean;
  errors: string[];
}

export function selfCheck(type: Al3SupportedType, content: unknown): SelfCheckResult {
  const errors: string[] = [];

  const validate = validatorFor(type);
  if (!validate(content)) {
    for (const e of validate.errors ?? []) {
      errors.push(`schema: ${e.instancePath || "(root)"} ${e.message ?? "invalid"}`);
    }
  }

  // Arithmetic / cross-field checks the schema can't express.
  if (errors.length === 0 && typeof content === "object" && content !== null) {
    const c = content as Record<string, unknown>;
    if (type === "skill_evaluator") errors.push(...checkSkillEvaluator(c));
    if (type === "quiz") errors.push(...checkQuiz(c));
    if (type === "material") errors.push(...checkMaterial(c));
  }

  return { ok: errors.length === 0, errors };
}

function checkSkillEvaluator(c: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const dims = c.scoring_dimensions;
  if (Array.isArray(dims)) {
    const sum = dims.reduce((acc, d) => acc + (Number((d as { weight_percent?: unknown }).weight_percent) || 0), 0);
    if (sum !== 100) errs.push(`scoring_dimensions weight_percent must sum to 100, got ${sum}`);
    const names = dims.map((d) => (d as { dimension?: unknown }).dimension);
    if (new Set(names).size !== names.length) errs.push("scoring_dimensions has duplicate dimensions");
  }
  const levels = c.proficiency_levels;
  if (Array.isArray(levels)) {
    const want = ["Beginner", "Intermediate", "Advanced", "Expert", "Architect"];
    const got = new Set(levels.map((l) => (l as { level?: unknown }).level));
    const missing = want.filter((w) => !got.has(w));
    if (missing.length) errs.push(`proficiency_levels missing: ${missing.join(", ")}`);
  }
  const required = (c.pass_conditions as { required_dimensions?: unknown })?.required_dimensions;
  if (Array.isArray(required) && Array.isArray(dims)) {
    const declared = new Set(dims.map((d) => (d as { dimension?: unknown }).dimension));
    for (const r of required) {
      if (!declared.has(r)) errs.push(`pass_conditions.required_dimensions "${r}" is not in scoring_dimensions`);
    }
  }
  return errs;
}

function checkQuiz(c: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const questions = c.questions;
  if (!Array.isArray(questions)) return errs;
  const ids = new Set<string>();
  const usedTypes = new Set<string>();
  for (const [i, qRaw] of questions.entries()) {
    const q = qRaw as Record<string, unknown>;
    const id = String(q.id ?? `#${i}`);
    if (ids.has(id)) errs.push(`quiz question id "${id}" is duplicated`);
    ids.add(id);
    if (typeof q.type === "string") usedTypes.add(q.type);

    const type = q.type;
    if (type === "multiple-choice" || type === "scenario-judgment") {
      const options = q.options as Record<string, unknown> | undefined;
      const correct = q.correct;
      if (!options || typeof options !== "object") {
        errs.push(`question "${id}" (${String(type)}) needs an options map`);
      } else if (typeof correct !== "string" || !(correct in options)) {
        errs.push(`question "${id}" correct "${String(correct)}" is not a key of options`);
      }
    } else if (type === "ordering") {
      if (!Array.isArray(q.ordering) || q.ordering.length < 2) {
        errs.push(`question "${id}" (ordering) needs an ordering array of >= 2 items`);
      }
    } else if (type === "short-answer") {
      if (typeof q.answer !== "string" || !q.answer.trim()) {
        errs.push(`question "${id}" (short-answer) needs a non-empty answer`);
      }
    }
  }
  // question_types should describe what was actually used.
  const declared = c.question_types;
  if (Array.isArray(declared)) {
    for (const used of usedTypes) {
      if (!declared.includes(used)) errs.push(`question_types is missing "${used}" which a question uses`);
    }
  }
  return errs;
}

function checkMaterial(c: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const keySections = c.key_sections;
  const body = c.body_markdown;
  if (!Array.isArray(keySections) || typeof body !== "string") return errs;

  const headings = [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]!.trim());
  const wanted = keySections.map((s) => String(s).trim());

  // Every key_section must appear as a "##" heading (order-preserving check).
  let cursor = 0;
  for (const section of wanted) {
    const idx = headings.indexOf(section, cursor);
    if (idx === -1) {
      errs.push(`material body_markdown has no "## ${section}" heading (or it is out of order)`);
    } else {
      cursor = idx + 1;
    }
  }
  return errs;
}
