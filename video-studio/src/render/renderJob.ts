/**
 * The render-job orchestration (AL5 rev-2 plan §2, §5-§7). Runs inside the
 * one-shot Fargate worker.
 *
 * Every side-effecting step is an injected function so the orchestration is
 * unit-testable without a real Remotion render, real Chatterbox, real S3, or
 * real DynamoDB. `runRenderJob` is the pure control flow.
 */
import { loadVideoSpec, retimeBeats, type LoadedVideo } from '../spec/loadVideoSpec.js';
import type { VideoSpec } from '../spec/videoSpecTypes.js';
import { loadVideoSpecV2, retimeBeatsV2, type LoadedVideoV2 } from '../spec/loadVideoSpecV2.js';
import type { VideoSpecV2 } from '../spec/videoSpecTypesV2.js';
import { synthesizeAudioPlan, measuredAudioMap, type AudioCache, type RenderAudioManifest } from '../audio/synthesize.js';
import type { TTSProvider } from '../audio/TTSProvider.js';

type AnySpec = VideoSpec | VideoSpecV2;
type AnyLoaded = LoadedVideo | LoadedVideoV2;

function isV2(spec: AnySpec): spec is VideoSpecV2 {
  return spec.schema_version === 'video/v2';
}

export interface VisionQaFeedback {
  category: 'pass' | 'layout_bug' | 'pacing_issue' | 'narration_flaw' | 'content_flaw';
  reason?: string;
  evidence?: { beat_id?: string };
}

export interface RenderJobInput {
  renderJobId: string;
  experienceId: string;
  cycle: number;
  videoSpec: AnySpec;
  visionQaFeedback?: VisionQaFeedback | null;
}

export interface ReRenderPlan {
  regenBeatIds: string[];
  reuseAllAudio: boolean;
  tailBufferBumpSec: number;
}

export interface RenderJobResult {
  mechanicalQa: { passed: boolean; checks: Array<{ name: string; pass: boolean; detail: string }> };
  output: { s3_pointer: string; duration_sec: number; poster_s3_pointer: string };
  renderedSpecPointer: string;
}

export interface RenderSteps {
  /** Regenerate one beat's narration (OpenRouter). Returns the updated spec. */
  regenerateBeatNarration: (
    spec: AnySpec,
    beatId: string,
    reason: string | undefined,
  ) => Promise<AnySpec>;
  /** narration_hash for a (narration, voice) pair — the AL8 pinned formula. */
  narrationHash: (narration: string, voice: unknown) => string;
  /** spec_hash over the load-bearing projection — the AL8 pinned formula. */
  specHash: (spec: AnySpec) => string;
  /** The TTS provider + the content-addressed cache. */
  ttsProvider: TTSProvider;
  audioCache: AudioCache;
  /** Absolute path to the render workdir. */
  workdir: string;
  /** Run `remotion render <compositionId>` with the given inputProps. Returns the MP4 path. */
  remotionRender: (params: {
    spec: AnySpec;
    measuredAudio: Record<string, number>;
    audioPrefix: string;
    outPath: string;
    workdir: string;
    compositionId: string;
  }) => Promise<void>;
  /** Extract a poster frame. Returns nothing; writes to posterPath. */
  extractPoster: (mp4Path: string, posterPath: string, atSeconds: number) => Promise<void>;
  /** ffprobe the MP4 for its real duration in seconds. */
  probeDurationSeconds: (mp4Path: string) => Promise<number>;
  /** Run validate-render.ts against the MP4 + the retimed LoadedVideo + the manifest. */
  validateRender: (params: {
    mp4Path: string;
    loadedVideoJsonPath: string;
    manifestPath: string;
  }) => Promise<{ passed: boolean; checks: Array<{ name: string; pass: boolean; detail: string }> }>;
  /** Upload a local file to renders/{experienceId}/cycle-{cycle}/{name}. Returns the s3:// pointer. */
  uploadRenderArtifact: (localPath: string, name: string) => Promise<string>;
  /** Write a JSON blob to renders/{experienceId}/cycle-{cycle}/{name}. Returns the s3:// pointer. */
  putRenderJson: (obj: unknown, name: string) => Promise<string>;
  /** Progress callback (updates the job record). */
  onPhase: (phase: 'synthesizing' | 'rendering' | 'validating') => Promise<void>;
  log?: (line: string) => void;
}

export function planReRender(cycle: number, feedback: VisionQaFeedback | null | undefined): ReRenderPlan {
  if (cycle <= 1 || !feedback) return { regenBeatIds: [], reuseAllAudio: false, tailBufferBumpSec: 0 };
  switch (feedback.category) {
    case 'pass':
    case 'layout_bug':
      return { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 0 };
    case 'pacing_issue':
      return { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 1.5 };
    case 'narration_flaw': {
      const beatId = feedback.evidence?.beat_id;
      if (!beatId) throw new Error('narration_flaw feedback has no evidence.beat_id');
      return { regenBeatIds: [beatId], reuseAllAudio: false, tailBufferBumpSec: 0 };
    }
    case 'content_flaw':
      throw new Error('content_flaw is not a re-renderable category');
    default:
      throw new Error(`unknown vision_qa_feedback.category ${String((feedback as { category?: unknown }).category)}`);
  }
}

const ATTEMPT = 1; // the worker renders one attempt; astra drives cross-call retries

export async function runRenderJob(input: RenderJobInput, steps: RenderSteps): Promise<RenderJobResult> {
  const log = steps.log ?? (() => {});
  const plan = planReRender(input.cycle, input.visionQaFeedback);

  // ---- 1. narration_flaw regen (if any) --------------------------------
  let spec = input.videoSpec;
  if (plan.regenBeatIds.length > 0) {
    const regenerated = new Set(plan.regenBeatIds);
    for (const beatId of plan.regenBeatIds) {
      spec = await steps.regenerateBeatNarration(spec, beatId, input.visionQaFeedback?.reason);
    }
    // Recompute ONLY the regenerated beats' narration_hash — every other beat's
    // narration is unchanged, so its hash in the incoming spec is still correct
    // (and keeping it preserves the TTS cache for those beats). Then recompute
    // the spec_hash over the whole (now-updated) spec.
    const voice = (spec as { voice?: unknown }).voice ?? {};
    for (const b of spec.beats) {
      if (regenerated.has(b.id)) {
        b.narration_hash = steps.narrationHash(b.narration, voice);
      }
    }
    (spec as { spec_hash?: string }).spec_hash = steps.specHash(spec);
    log(`regenerated narration for: ${plan.regenBeatIds.join(', ')}`);
  }

  // ---- 2. load + audio plan ------------------------------------------
  // isV2's narrowing doesn't survive across statements once captured in a
  // plain boolean, so the two schema versions' load/retime calls are each
  // made inside their own narrowed branch, assigned into the AnySpec-wide
  // `loaded0`/`loaded` variables below.
  const v2 = isV2(spec);
  const loaded0: AnyLoaded = isV2(spec) ? loadVideoSpecV2(spec) : loadVideoSpec(spec);

  await steps.onPhase('synthesizing');
  const manifest: RenderAudioManifest = await synthesizeAudioPlan(loaded0.audioPlan, {
    workdir: steps.workdir,
    provider: steps.ttsProvider,
    cache: steps.audioCache,
    // The key is always the beat's current narration_hash. A regenerated beat's
    // hash was just recomputed to a value that isn't in the cache -> automatic
    // miss -> fresh synthesis -> cached under the new key. No special-casing.
    keyForBeat: (beatId) => narrationHashForBeat(spec, beatId),
    log,
  });

  // ---- 3. retime + render ------------------------------------------
  const measured = measuredAudioMap(manifest);
  let loaded: AnyLoaded = isV2(spec)
    ? retimeBeatsV2(loaded0 as LoadedVideoV2, measured)
    : retimeBeats(loaded0 as LoadedVideo, measured);
  if (plan.tailBufferBumpSec > 0) {
    loaded = bumpTailBuffer(loaded, plan.tailBufferBumpSec);
  }

  await steps.onPhase('rendering');
  const mp4Path = `${steps.workdir}/out/video.mp4`;
  await steps.remotionRender({
    spec,
    measuredAudio: measured,
    audioPrefix: 'audio/',
    outPath: mp4Path,
    workdir: steps.workdir,
    compositionId: v2 ? 'spec-video-v2' : 'spec-video',
  });

  const posterPath = `${steps.workdir}/out/poster.png`;
  await steps.extractPoster(mp4Path, posterPath, posterFrameSeconds(loaded));

  // ---- 4. validate --------------------------------------------------
  await steps.onPhase('validating');
  const loadedJsonPath = `${steps.workdir}/out/loaded-video.json`;
  await steps.putRenderJson(loaded, 'loaded-video.json'); // also to S3 for debugging
  await writeLocalJson(loadedJsonPath, loaded);
  const manifestPath = `${steps.workdir}/audio/manifest.json`;
  await writeLocalJson(manifestPath, manifest);

  const mechanicalQa = await steps.validateRender({
    mp4Path,
    loadedVideoJsonPath: loadedJsonPath,
    manifestPath,
  });

  const durationSec = await steps.probeDurationSeconds(mp4Path);

  // ---- 5. upload -------------------------------------------------
  const mp4Pointer = await steps.uploadRenderArtifact(mp4Path, `attempt-${ATTEMPT}.mp4`);
  const posterPointer = await steps.uploadRenderArtifact(posterPath, `attempt-${ATTEMPT}.poster.png`);
  await steps.uploadRenderArtifact(manifestPath, `attempt-${ATTEMPT}.audio-manifest.json`);
  const specPointer = await steps.putRenderJson(spec, `attempt-${ATTEMPT}.video_spec.json`);

  return {
    mechanicalQa,
    output: { s3_pointer: mp4Pointer, duration_sec: Math.round(durationSec), poster_s3_pointer: posterPointer },
    renderedSpecPointer: specPointer,
  };
}

// ---- helpers ---------------------------------------------------------

function narrationHashForBeat(spec: AnySpec, beatId: string): string | undefined {
  const b = spec.beats.find((x) => x.id === beatId);
  return b?.narration_hash;
}

/** Add `bumpSec` to every beat's duration and re-lay them contiguously. */
function bumpTailBuffer<T extends AnyLoaded>(loaded: T, bumpSec: number): T {
  let cursor = 0;
  const beats = loaded.beats.map((b) => {
    const duration = Math.round((b.duration + bumpSec) * 100) / 100;
    const start = Math.round(cursor * 100) / 100;
    cursor += duration;
    return { ...b, start, duration };
  }) as T['beats'];
  const totalDurationSeconds = Math.round(cursor * 100) / 100;
  return {
    ...loaded,
    beats,
    totalDurationSeconds,
    totalDurationFrames: Math.round(totalDurationSeconds * loaded.fps),
  };
}

function posterFrameSeconds(loaded: AnyLoaded): number {
  const firstNonTitle = loaded.beats.find((b) => b.type !== 'title');
  return firstNonTitle ? Math.min(firstNonTitle.start + 1, firstNonTitle.start + firstNonTitle.duration / 2) : 3;
}

async function writeLocalJson(path: string, obj: unknown): Promise<void> {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(obj, null, 2));
}
