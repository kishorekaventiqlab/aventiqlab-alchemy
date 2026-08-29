/**
 * video/v1 stage-coverage check — the shared library (AL8 OQ-5).
 *
 * PUBLISHABLE / VENDORABLE: pure function, zero runtime deps, no AWS, no I/O.
 * astra vendors or pins this single module and imports `stageCoverage` for its
 * §7.2 cross-check; alchemy runs it in the /v1/generate self-check. astra keeps
 * its own jsonschema *shape* check separately — this is the *semantic*
 * stage-coverage check only.
 *
 * Rule source: docs/video-artifact-constitution.md §2a / §F, and
 * docs/video-v1-schema.md §3.
 *
 * Versioned: bump STAGE_COVERAGE_VERSION on any rule change.
 */

export const STAGE_COVERAGE_VERSION = "1.0.0";

export type Stage =
  | "problem"
  | "stakes"
  | "curiosity"
  | "context_mental_model"
  | "options"
  | "trade_offs"
  | "investigation_demonstration"
  | "decision"
  | "best_practice"
  | "takeaway";

export type Tier = "REQUIRED" | "RECOMMENDED" | "OPTIONAL";

export type DurationClass = "short" | "standard" | "deep-dive";

/** Canonical order (constitution §2). */
export const STAGE_ORDER: Stage[] = [
  "problem",
  "stakes",
  "curiosity",
  "context_mental_model",
  "options",
  "trade_offs",
  "investigation_demonstration",
  "decision",
  "best_practice",
  "takeaway",
];

export const STAGE_TIER: Record<Stage, Tier> = {
  problem: "REQUIRED",
  stakes: "RECOMMENDED",
  curiosity: "REQUIRED",
  context_mental_model: "REQUIRED",
  options: "RECOMMENDED",
  trade_offs: "RECOMMENDED",
  investigation_demonstration: "REQUIRED",
  decision: "REQUIRED",
  best_practice: "REQUIRED",
  takeaway: "OPTIONAL",
};

/** The §3a minimum signature — what a "short" video must still have. */
const SHORT_MINIMUM: Stage[] = ["problem", "curiosity", "best_practice"];
/** "short" also needs at least one of these. */
const SHORT_ONE_OF: Stage[] = ["context_mental_model", "investigation_demonstration"];

export interface StageCoverageRow {
  stage: Stage;
  present: boolean;
  tier: Tier;
  /** True if this stage is mandatory for the given duration_class and is absent. */
  missingButRequired: boolean;
}

export interface StageCoverageResult {
  version: string;
  durationClass: DurationClass;
  rows: StageCoverageRow[];
  /** Stages present but out of canonical order (constitution §F check 5). */
  outOfOrder: Stage[];
  /** True iff no REQUIRED-tier (for this class) stage is missing and order is clean. */
  ok: boolean;
  /** Human-readable summary lines for astra's re-prompt note. */
  notes: string[];
}

interface MinimalBeat {
  readonly stage?: string | null;
  /** Only used to skip the investigation container beat (narration === ""). */
  readonly narration?: string;
  readonly visual?: { readonly kind?: string } | null;
}

interface MinimalSpec {
  readonly target_duration_class?: string;
  readonly beats?: readonly MinimalBeat[];
}

/**
 * @param spec  a video/v1 spec (or anything with target_duration_class + beats[])
 */
export function stageCoverage(spec: MinimalSpec): StageCoverageResult {
  const durationClass = normaliseClass(spec.target_duration_class);
  const beats = Array.isArray(spec.beats) ? spec.beats : [];

  // Which stages actually appear, in first-appearance order.
  const seen: Stage[] = [];
  const present = new Set<Stage>();
  for (const b of beats) {
    const st = b.stage;
    if (typeof st === "string" && isStage(st)) {
      if (!present.has(st)) {
        present.add(st);
        seen.push(st);
      }
    }
  }

  const mandatory = mandatoryStages(durationClass);

  const rows: StageCoverageRow[] = STAGE_ORDER.map((stage) => {
    const isPresent = present.has(stage);
    const required = mandatory.has(stage);
    return {
      stage,
      present: isPresent,
      tier: STAGE_TIER[stage],
      missingButRequired: required && !isPresent,
    };
  });

  // Order check: the stages that ARE present must be in canonical order.
  const canonicalIndex = (s: Stage) => STAGE_ORDER.indexOf(s);
  const outOfOrder: Stage[] = [];
  for (let i = 1; i < seen.length; i++) {
    if (canonicalIndex(seen[i]!) < canonicalIndex(seen[i - 1]!)) {
      outOfOrder.push(seen[i]!);
    }
  }

  // "short" special case: at least one of SHORT_ONE_OF.
  const shortOneOfMissing =
    durationClass === "short" && !SHORT_ONE_OF.some((s) => present.has(s));

  const missingRequired = rows.filter((r) => r.missingButRequired).map((r) => r.stage);
  const ok = missingRequired.length === 0 && outOfOrder.length === 0 && !shortOneOfMissing;

  const notes: string[] = [];
  if (missingRequired.length) {
    notes.push(
      `Missing required stage(s) for a "${durationClass}" video: ${missingRequired.join(", ")}.`,
    );
  }
  if (shortOneOfMissing) {
    notes.push(`A "short" video needs at least one of: ${SHORT_ONE_OF.join(", ")}.`);
  }
  if (outOfOrder.length) {
    notes.push(
      `Stage(s) out of canonical order: ${outOfOrder.join(", ")}. Canonical order is ${STAGE_ORDER.join(" -> ")}.`,
    );
  }
  const missingRecommended = rows
    .filter((r) => r.tier === "RECOMMENDED" && !r.present)
    .map((r) => r.stage);
  if (missingRecommended.length && durationClass !== "short") {
    notes.push(
      `Recommended stage(s) absent (not a failure, but review whether the omission is deliberate): ${missingRecommended.join(", ")}.`,
    );
  }

  return { version: STAGE_COVERAGE_VERSION, durationClass, rows, outOfOrder, ok, notes };
}

function mandatoryStages(durationClass: DurationClass): Set<Stage> {
  if (durationClass === "short") {
    return new Set<Stage>(SHORT_MINIMUM);
  }
  // standard + deep-dive: every REQUIRED-tier stage
  return new Set<Stage>(STAGE_ORDER.filter((s) => STAGE_TIER[s] === "REQUIRED"));
}

function normaliseClass(v: string | undefined): DurationClass {
  if (v === "short" || v === "standard" || v === "deep-dive") return v;
  return "standard"; // safest default — demands the most coverage
}

export function isStage(v: string): v is Stage {
  return (STAGE_ORDER as string[]).includes(v);
}
