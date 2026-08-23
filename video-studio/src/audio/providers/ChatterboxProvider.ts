import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import type { AudioResult, TTSOptions, TTSProvider } from "../TTSProvider";

export type ChatterboxProviderConfig = {
  /** Path to the Python interpreter that has chatterbox-tts installed (e.g. a venv's python). */
  pythonBin: string;
  /** Path to tools/chatterbox/synthesize.py. */
  scriptPath: string;
  /** Path to a reference voice WAV for voice conditioning (Chatterbox's audio_prompt_path). Optional — falls back to the library's built-in default voice if omitted. */
  voiceRefPath?: string;
  /** "cuda" | "mps" | "cpu" | "auto" (default) — "auto" lets the Python side detect the best available device. */
  device?: string;
};

/** Reads the duration in seconds of a 16-bit PCM WAV file from its header. */
const readWavDurationSeconds = async (filePath: string): Promise<number> => {
  const buffer = await readFile(filePath);
  const sampleRate = buffer.readUInt32LE(24);
  const byteRate = buffer.readUInt32LE(28);
  const dataSize = buffer.readUInt32LE(40);
  if (!sampleRate || !byteRate) {
    throw new Error(`Could not read WAV header from ${filePath}`);
  }
  return dataSize / byteRate;
};

const runPythonSynthesize = (
  pythonBin: string,
  scriptPath: string,
  args: string[],
): Promise<{ generationSeconds: number }> =>
  new Promise((resolve, reject) => {
    execFile(
      pythonBin,
      [scriptPath, ...args],
      { maxBuffer: 1024 * 1024 * 16 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`chatterbox synthesize.py failed: ${error.message}\n${stderr}`));
          return;
        }
        // synthesize.py prints one JSON line to stdout on success: {"generationSeconds": <float>}
        try {
          const lastLine = stdout.trim().split("\n").pop() ?? "{}";
          const parsed = JSON.parse(lastLine) as { generationSeconds?: number };
          resolve({ generationSeconds: parsed.generationSeconds ?? 0 });
        } catch {
          resolve({ generationSeconds: 0 });
        }
      },
    );
  });

/**
 * Local TTS via Chatterbox V3 (Resemble AI's open-source `chatterbox-tts`
 * package, https://github.com/resemble-ai/chatterbox), run as a Python
 * subprocess — Node never imports torch or any Python code directly, it
 * just shells out to tools/chatterbox/synthesize.py and reads back the WAV
 * file it writes.
 *
 * This is the sole TTS backend for this project (see
 * docs/experiments/chatterbox-v3-tts.md for the comparison that led to
 * standardizing on it; Piper has been fully removed).
 */
export class ChatterboxProvider implements TTSProvider {
  readonly id = "chatterbox-v3";
  private readonly pythonBin: string;
  private readonly scriptPath: string;
  private readonly voiceRefPath?: string;
  private readonly device: string;

  constructor(config: ChatterboxProviderConfig) {
    this.pythonBin = config.pythonBin;
    this.scriptPath = config.scriptPath;
    this.voiceRefPath = config.voiceRefPath;
    this.device = config.device ?? "auto";
  }

  async synthesize(text: string, outputPath: string, options?: TTSOptions): Promise<AudioResult> {
    const args = ["--text", text, "--output", outputPath, "--device", this.device];
    if (this.voiceRefPath) args.push("--voice-ref", this.voiceRefPath);
    if (options?.voice) args.push("--voice-name", options.voice);

    await runPythonSynthesize(this.pythonBin, this.scriptPath, args);

    const durationSeconds = await readWavDurationSeconds(outputPath);
    return { filePath: outputPath, durationSeconds };
  }
}
