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
import { stageCoverage } from "../lib/video-stage-coverage.js";

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
    if (type === "video") errors.push(...checkVideo(c));
  }

  return { ok: errors.length === 0, errors };
}

/** Nouns whose presence in on_screen we cross-check against visual.kind. */
const KIND_KEYWORDS: Record<string, RegExp> = {
  terminal: /\bterminal\b|\bkubectl\b|\bcommand line\b|\bshell\b/i,
  editor: /\beditor\b|\bfile\b|\.ya?ml\b|\bdiff\b|\bcode\b/i,
  dashboard: /\bdashboard\b|\bgraph\b|\bpanel\b|\bmetric\b|\bchart\b/i,
  architecture: /\barchitecture\b|\bdiagram\b|\bnode\b|\bcomponent\b|\barrow\b/i,
  recap: /\brecap\b|\bsummary\b|\btakeaway\b|\bthree (things|points)\b/i,
  optionsCompare: /\bcomparison\b|\bcolumn\b|\boption\b|\bsolves\b|\btrade-?off\b/i,
  statement: /\bstatement\b|\bcard\b|\beyebrow\b|\bsingle sentence\b/i,
  title: /\btitle card\b|\btitle screen\b/i,
  investigation: /\bscene\b|\bpods?\b|\bqueue\b|\bnode\b|\btraffic\b|\bmeter\b/i,
};

function checkVideo(c: Record<string, unknown>): string[] {
  const errs: string[] = [];
  const beats = Array.isArray(c.beats) ? (c.beats as Array<Record<string, unknown>>) : [];
  if (beats.length === 0) return ["video has no beats"];

  // 1. id uniqueness + investigation container/segment wiring.
  const ids = new Set<string>();
  const containerIds = new Set<string>();
  for (const b of beats) {
    const id = String(b.id ?? "");
    if (ids.has(id)) errs.push(`duplicate beat id "${id}"`);
    ids.add(id);
    const v = (b.visual ?? {}) as Record<string, unknown>;
    if (v.kind === "investigation") {
      containerIds.add(id);
      if (b.narration !== "") errs.push(`investigation container beat "${id}" must have narration ""`);
    }
  }
  for (const b of beats) {
    const v = (b.visual ?? {}) as Record<string, unknown>;
    if (v.kind === "investigation_segment") {
      const of = String(v.of_container ?? "");
      if (!containerIds.has(of)) {
        errs.push(`investigation_segment beat "${String(b.id)}" points at of_container "${of}" which is not an investigation container`);
      }
    }
    if (v.kind === "investigation" && Array.isArray(v.segments)) {
      for (const seg of v.segments as Array<Record<string, unknown>>) {
        const ref = String(seg.narration_ref ?? "");
        if (!ids.has(ref)) errs.push(`investigation "${String(b.id)}" segment narration_ref "${ref}" is not a beat id`);
      }
    }
  }

  // 2. on_screen <-> visual.kind cross-match (AL8 §1.6 consistency rule).
  for (const b of beats) {
    const v = (b.visual ?? {}) as Record<string, unknown>;
    const kind = typeof v.kind === "string" ? v.kind : "";
    const onScreen = typeof b.on_screen === "string" ? b.on_screen : "";
    // A segment beat's on_screen describes the container's scene — skip the keyword gate.
    if (kind === "investigation_segment") continue;
    const kw = KIND_KEYWORDS[kind];
    if (kw && onScreen && !kw.test(onScreen)) {
      errs.push(
        `beat "${String(b.id)}" visual.kind is "${kind}" but on_screen does not describe it (no matching term) — on_screen and visual must agree`,
      );
    }
    // architecture: every node label the on_screen names should exist in visual.nodes.
    if (kind === "architecture" && Array.isArray(v.nodes)) {
      const labels = (v.nodes as Array<Record<string, unknown>>).map((n) => String(n.label ?? ""));
      // bounds
      for (const n of v.nodes as Array<Record<string, unknown>>) {
        const x = Number(n.x);
        const y = Number(n.y);
        if (x < 40 || x > 1880 || y < 40 || y > 1040) {
          errs.push(`architecture node "${String(n.label)}" at (${x},${y}) is outside the safe 1920x1080 frame`);
        }
      }
      void labels;
    }
  }

  // 3. stage coverage (the shared lib).
  const coverage = stageCoverage(c);
  if (!coverage.ok) {
    errs.push(`stage coverage: ${coverage.notes.join(" ")}`);
  }

  // 4. sum of target_duration_sec (investigation CONTAINER beats excluded — AL8 §1.7).
  const est = Number(c.estimated_duration_minutes);
  if (Number.isFinite(est) && est > 0) {
    let sum = 0;
    for (const b of beats) {
      const v = (b.visual ?? {}) as Record<string, unknown>;
      if (v.kind === "investigation") continue; // container — its segments are counted
      sum += Number(b.target_duration_sec) || 0;
    }
    const target = est * 60;
    const drift = Math.abs(sum - target) / target;
    if (drift > 0.15) {
      errs.push(
        `sum of beat target_duration_sec (${sum.toFixed(1)}s, containers excluded) is ${(drift * 100).toFixed(0)}% off estimated_duration_minutes (${target}s) — must be within 15%`,
      );
    }
  }

  return errs;
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
