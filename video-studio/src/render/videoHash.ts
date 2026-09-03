/**
 * The pinned narration_hash + spec_hash formulas (AL8 §1.5, §5) — a copy of
 * service/src/generate/video-hash.ts kept in sync by hand (contract §3.8, no
 * codegen between the service and video-studio). The worker recomputes these
 * after a narration_flaw beat regen.
 */
import { createHash } from 'node:crypto';

/**
 * The pinned formulas only read this shared, format-agnostic projection —
 * identical for video/v1 and video/v2 (only `visual`'s per-kind payload
 * differs between schema versions, and it's carried through opaquely here).
 */
export interface HashableSpec {
  central_question: string;
  title: string;
  format: string;
  beats: Array<{
    id: string;
    stage?: string | null;
    narration: string;
    on_screen: string;
    visual: unknown;
  }>;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** input = narration + "\n" + canonical_json(voice); "sha256:" + hex(sha256(input)) */
export function narrationHash(narration: string, voice: unknown): string {
  const input = `${narration}\n${canonicalJson(voice)}`;
  return 'sha256:' + createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * The load-bearing projection only (OQ-6): beats[].{id,stage,narration,on_screen,visual}
 * + top {central_question,title,format}. Everything else excluded.
 */
export function specHash(spec: HashableSpec): string {
  const projection = {
    central_question: spec.central_question,
    title: spec.title,
    format: spec.format,
    beats: spec.beats.map((b) => ({
      id: b.id,
      stage: b.stage ?? null,
      narration: b.narration,
      on_screen: b.on_screen,
      visual: b.visual,
    })),
  };
  return 'sha256:' + createHash('sha256').update(canonicalJson(projection), 'utf8').digest('hex');
}
