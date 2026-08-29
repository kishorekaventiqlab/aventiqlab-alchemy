/**
 * The reusable audio-synthesis core (AL5 rev-2 plan §4.1).
 *
 * `synthesizeAudioPlan` takes AL4's `AudioPlanEntry[]` (from `loadVideoSpec`)
 * and produces a render audio manifest — one .wav per narration unit + its
 * measured duration.
 *
 * The TTS-cache abstraction (`AudioCache`) is injected: the Content Studio
 * render backs it with S3 (`tts-cache/{narration_hash}.wav`, CD-21); a local
 * dev run backs it with a directory.
 *
 * `scripts/generate-audio.ts` (the hand-authored path) is a thin wrapper over
 * this — see §4.1 of the plan.
 */
import { existsSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TTSProvider } from "./TTSProvider.js";
import type { AudioPlanEntry } from "../spec/loadVideoSpec.js";

export interface RenderAudioManifestEntry {
  audioFile: string;
  /** Path relative to the workdir's `audio/` dir (what Remotion staticFile resolves). */
  audioPath: string;
  durationSeconds: number;
  /** The cache key used (a narration_hash), for the manifest / debugging. */
  cacheKey: string;
  fromCache: boolean;
}

export interface RenderAudioManifest {
  generatedAt: string;
  entries: RenderAudioManifestEntry[];
}

/** A content-addressed audio cache keyed on narration_hash (CD-21). */
export interface AudioCache {
  /** Copy the cached wav for `key` into `destAbsPath`. Returns false on a miss. */
  fetch(key: string, destAbsPath: string): Promise<boolean>;
  /** Store `srcAbsPath` under `key`. */
  put(key: string, srcAbsPath: string): Promise<void>;
}

export interface SynthesizeOptions {
  /** Absolute path to the render workdir (the `audio/` subdir is created under it). */
  workdir: string;
  provider: TTSProvider;
  cache: AudioCache;
  /**
   * Per-beat cache keys — the narration_hash from the video_spec. Keyed by the
   * plan entry's `beatId`. A key of `undefined` forces a fresh synthesis (a
   * narration_flaw regen — the caller strips the key for that beat).
   */
  keyForBeat: (beatId: string) => string | undefined;
  log?: (line: string) => void;
}

/** Read the duration (seconds) from a canonical 16-bit PCM WAV header. */
async function wavDurationSeconds(filePath: string): Promise<number> {
  const buf = await readFile(filePath);
  const byteRate = buf.readUInt32LE(28);
  // find the "data" chunk size (offset 40 for a canonical header; scan as a fallback)
  let dataSize = buf.readUInt32LE(40);
  if (byteRate && dataSize && 44 + dataSize <= buf.length + 4) {
    return dataSize / byteRate;
  }
  // fallback scan
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  return byteRate ? dataSize / byteRate : 0;
}

export async function synthesizeAudioPlan(
  plan: AudioPlanEntry[],
  opts: SynthesizeOptions,
): Promise<RenderAudioManifest> {
  const audioDir = join(opts.workdir, "audio");
  mkdirSync(audioDir, { recursive: true });
  const log = opts.log ?? (() => {});

  const entries: RenderAudioManifestEntry[] = [];

  for (const item of plan) {
    const dest = join(audioDir, item.audioFile);
    const key = opts.keyForBeat(item.beatId);

    if (key) {
      const hit = await opts.cache.fetch(key, dest);
      if (hit) {
        const dur = await wavDurationSeconds(dest);
        entries.push({ audioFile: item.audioFile, audioPath: item.audioFile, durationSeconds: dur, cacheKey: key, fromCache: true });
        log(`  [cache hit]  ${item.audioFile} (${dur.toFixed(2)}s)`);
        continue;
      }
    }

    const result = await opts.provider.synthesize(item.caption, dest, {});
    const dur = result.durationSeconds || (await wavDurationSeconds(dest));
    if (key && existsSync(dest)) {
      await opts.cache.put(key, dest);
    }
    entries.push({
      audioFile: item.audioFile,
      audioPath: item.audioFile,
      durationSeconds: dur,
      cacheKey: key ?? "(no-key)",
      fromCache: false,
    });
    log(`  [synthesized] ${item.audioFile} (${dur.toFixed(2)}s)`);
  }

  return { generatedAt: new Date().toISOString(), entries };
}

/** manifest -> { audioFile: seconds } for retimeBeats (AL4). */
export function measuredAudioMap(manifest: RenderAudioManifest): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of manifest.entries) out[e.audioFile] = e.durationSeconds;
  return out;
}
