/**
 * narration_hash + spec_hash for video/v1 (AL8 docs/video-v1-schema.md §1.5, §5).
 *
 * Both formulas are PINNED — astra reload/dumps the spec for its per-cycle S3
 * snapshot and must compute identical values.
 */
import { createHash } from "node:crypto";

/** Canonical JSON: recursively sorted keys, no insignificant whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/**
 * §1.5: input = narration + "\n" + json.dumps(voice, sort_keys=True,
 * separators=(",",":"));  narration_hash = "sha256:" + hex(sha256(input))
 */
export function narrationHash(narration: string, voice: unknown): string {
  const input = `${narration}\n${canonicalJson(voice)}`;
  return "sha256:" + createHash("sha256").update(input, "utf8").digest("hex");
}

interface VideoBeatLike {
  id: unknown;
  stage: unknown;
  narration: unknown;
  on_screen: unknown;
  visual: unknown;
}

interface VideoSpecLike {
  central_question?: unknown;
  title?: unknown;
  format?: unknown;
  beats?: VideoBeatLike[];
}

/**
 * §5 / OQ-6: hash the load-bearing projection ONLY —
 *   beats[].{id, stage, narration, on_screen, visual}
 *   + top-level {central_question, title, format}
 * Excluded: all duration estimates, every narration_hash, experience_id, voice,
 * spec_hash. So a regeneration that changes only a timing guess hashes identically.
 */
export function specHash(spec: VideoSpecLike): string {
  const projection = {
    central_question: spec.central_question,
    title: spec.title,
    format: spec.format,
    beats: (spec.beats ?? []).map((b) => ({
      id: b.id,
      stage: b.stage ?? null,
      narration: b.narration,
      on_screen: b.on_screen,
      visual: b.visual,
    })),
  };
  return "sha256:" + createHash("sha256").update(canonicalJson(projection), "utf8").digest("hex");
}
