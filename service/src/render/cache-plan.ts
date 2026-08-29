/**
 * Cache-key logic (AL5 rev-2 plan §4.2, CD-21).
 *
 * The TTS cache is keyed on each beat's `narration_hash` from the video_spec
 * (AL8 pinned the formula — no re-hash). This module decides, given a spec and
 * a set of beat ids the render must regenerate, which narration units are cache
 * hits vs misses.
 *
 * A "narration unit" is a standalone audible beat OR an investigation segment
 * beat — both carry their own narration + narration_hash. Investigation
 * CONTAINER beats (narration "") and silent title beats contribute nothing.
 */

export interface NarrationUnit {
  beatId: string;
  narrationHash: string;
  /** The verbatim narration text (needed on a cache miss to synthesize). */
  narration: string;
}

export interface CachePlan {
  units: NarrationUnit[];
  /** narration_hash values expected to be in the cache (not regenerated). */
  cacheableHashes: string[];
  /** beatIds that must be (re)synthesized regardless of cache — narration_flaw regen. */
  forcedMissBeatIds: string[];
}

interface SpecBeatLike {
  id?: unknown;
  narration?: unknown;
  narration_hash?: unknown;
  visual?: { kind?: unknown } | null;
}

/**
 * @param spec           a video/v1 video_spec (after any narration_flaw regen)
 * @param regenBeatIds   beat ids whose narration was just regenerated — their
 *                       cached wav (if any) must NOT be reused
 */
export function buildCachePlan(spec: { beats?: SpecBeatLike[] }, regenBeatIds: string[]): CachePlan {
  const regen = new Set(regenBeatIds);
  const beats = Array.isArray(spec.beats) ? spec.beats : [];
  const units: NarrationUnit[] = [];

  for (const b of beats) {
    const kind = (b.visual ?? {}).kind;
    if (kind === "investigation") continue; // container — no audio
    const narration = typeof b.narration === "string" ? b.narration : "";
    if (narration.trim() === "") continue; // silent title (or an empty beat)
    const beatId = String(b.id ?? "");
    const narrationHash = String(b.narration_hash ?? "");
    units.push({ beatId, narrationHash, narration });
  }

  const forcedMissBeatIds = units.filter((u) => regen.has(u.beatId)).map((u) => u.beatId);
  const cacheableHashes = units
    .filter((u) => !regen.has(u.beatId) && u.narrationHash)
    .map((u) => u.narrationHash);

  return { units, cacheableHashes, forcedMissBeatIds };
}
