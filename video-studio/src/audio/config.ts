import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * All configurable knobs for the audio pipeline, loaded from video-studio/.env
 * (see .env.example) with sensible defaults so the pipeline still works with
 * no .env present. Nothing here is machine-specific in code — every path a
 * developer might need to change (Python interpreter, voice reference)
 * comes from environment variables, never a hardcoded absolute path.
 *
 * Chatterbox V3 (https://github.com/resemble-ai/chatterbox) is this
 * project's sole TTS backend — see docs/experiments/chatterbox-v3-tts.md
 * for the comparison against Piper that led to standardizing on it.
 */
export type AudioConfig = {
  repoRoot: string;
  chatterbox: {
    pythonBin: string;
    scriptPath: string;
    voiceRefPath?: string;
    device: string;
  };
};

let cached: AudioConfig | null = null;

export const loadAudioConfig = (repoRoot: string): AudioConfig => {
  if (cached) return cached;

  const envPath = join(repoRoot, ".env");
  if (existsSync(envPath)) loadDotenv({ path: envPath });

  const resolveMaybeRelative = (value: string): string =>
    value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) ? value : resolve(repoRoot, value);

  cached = {
    repoRoot,
    chatterbox: {
      pythonBin: resolveMaybeRelative(
        process.env.CHATTERBOX_PYTHON ?? "tools/chatterbox/.venv/bin/python",
      ),
      scriptPath: resolve(repoRoot, "tools/chatterbox/synthesize.py"),
      voiceRefPath: process.env.CHATTERBOX_VOICE_REF
        ? resolveMaybeRelative(process.env.CHATTERBOX_VOICE_REF)
        : undefined,
      device: process.env.CHATTERBOX_DEVICE ?? "auto",
    },
  };
  return cached;
};

/** The voice identifier used in cache hashing and manifest entries. */
export const voiceName = (config: AudioConfig): string =>
  config.chatterbox.voiceRefPath ? "aventiqlab-narrator" : "chatterbox-default";
