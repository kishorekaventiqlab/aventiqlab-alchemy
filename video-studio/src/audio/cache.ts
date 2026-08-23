import { createHash } from "node:crypto";

/**
 * Content hash for a single narration beat's synthesis inputs. If the
 * caption text, provider, or voice hasn't changed, the hash is stable and
 * the generation script can skip re-synthesizing that beat's audio — this
 * is what lets a long script only regenerate the handful of beats whose
 * narration actually changed.
 *
 * Ported from the animation_poc project's src/audio/cache.ts.
 */
export const audioContentHash = (text: string, providerId: string, voice: string): string =>
  createHash("sha256").update(`${providerId}::${voice}::${text}`).digest("hex").slice(0, 16);
