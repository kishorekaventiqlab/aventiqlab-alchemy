/**
 * Generic text-to-speech provider contract. Nothing in this file knows
 * about experiences, beats, or Remotion — it's a plain "text in, audio file
 * out" interface so the audio pipeline can swap providers (a different
 * local engine, or eventually a commercial API) without touching the
 * generation script's orchestration logic.
 *
 * Ported from the animation_poc project's src/audio/TTSProvider.ts.
 */

export type TTSOptions = {
  /** Provider-specific voice identifier (e.g. a reference-voice name). */
  voice?: string;
  /** Speech rate multiplier; 1.0 is the provider's default pace. */
  rate?: number;
};

export type AudioResult = {
  /** Absolute path to the synthesized audio file on disk. */
  filePath: string;
  /** Duration of the synthesized audio, in seconds. */
  durationSeconds: number;
};

export interface TTSProvider {
  /** Human-readable provider id, used in cache hashing so switching providers invalidates the cache. */
  readonly id: string;
  synthesize(text: string, outputPath: string, options?: TTSOptions): Promise<AudioResult>;
}
