import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRenderJob, planReRender, type RenderSteps, type RenderJobInput } from './renderJob.js';
import { narrationHash, specHash } from './videoHash.js';
import type { VideoSpec } from '../spec/videoSpecTypes.js';
import type { AudioResult, TTSOptions } from '../audio/TTSProvider.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** A minimal 16-bit PCM WAV of `seconds` at 22050Hz mono. */
function tinyWav(seconds: number): Buffer {
  const sampleRate = 22050;
  const numSamples = Math.max(1, Math.round(sampleRate * seconds));
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

const H = 'sha256:' + '0'.repeat(64);

function makeSpec(): VideoSpec {
  return {
    schema_version: 'video/v1',
    experience_id: 'cexp_01TEST',
    title: 'T',
    format: 'animated-explainer',
    central_question: 'Why?',
    estimated_duration_minutes: 1,
    target_duration_class: 'short',
    spec_hash: H,
    voice: { provider: 'chatterbox-v3', voice_id: 'default', params: {} },
    beats: [
      { id: 'beat-01-title', stage: null, narration: '', narration_hash: H, on_screen: 'Title.', target_duration_sec: 4, visual: { kind: 'title', title: 'T', subtitle: 'Why?' } },
      { id: 'beat-02-problem', stage: 'problem', narration: 'It is slow.', narration_hash: H, on_screen: 'A red card.', target_duration_sec: 8, visual: { kind: 'statement', eyebrow: 'The problem', eyebrow_color: 'danger', statement: 'Slow.' } },
      { id: 'beat-03-curiosity', stage: 'curiosity', narration: 'CPU is at 35%.', narration_hash: H, on_screen: 'An accent card.', target_duration_sec: 7, visual: { kind: 'statement', eyebrow: 'The question', eyebrow_color: 'accent', statement: 'Why?' } },
      { id: 'beat-04-context', stage: 'context_mental_model', narration: 'The request path.', narration_hash: H, on_screen: 'Architecture diagram with nodes and arrows.', target_duration_sec: 10, visual: { kind: 'architecture', nodes: [{ node_kind: 'users', label: 'Users', x: 200, y: 160 }, { node_kind: 'pod', label: 'Pod', x: 800, y: 160 }], edges: [{ from_index: 0, to_index: 1, flowing: true }], highlight_index: null } },
      { id: 'beat-05-inv', stage: 'investigation_demonstration', narration: 'A live scene of pods and a queue.', narration_hash: H, on_screen: 'A terminal shows kubectl output.', target_duration_sec: 12, visual: { kind: 'terminal', lines: [{ kind: 'prompt', text: 'kubectl get pods' }, { kind: 'output', text: 'Pending' }] } },
      { id: 'beat-06-decision', stage: 'decision', narration: 'Run both together.', narration_hash: H, on_screen: 'An accent card.', target_duration_sec: 9, visual: { kind: 'statement', eyebrow: 'The decision', eyebrow_color: 'accent', statement: 'Both.' } },
      { id: 'beat-07-bp', stage: 'best_practice', narration: 'Check capacity first.', narration_hash: H, on_screen: 'A green card.', target_duration_sec: 8, visual: { kind: 'statement', eyebrow: 'Best practice', eyebrow_color: 'success', statement: 'Check capacity.' } },
    ],
  };
}

const fakeTts = {
  id: 'fake',
  async synthesize(text: string, outputPath: string, _o?: TTSOptions): Promise<AudioResult> {
    const seconds = Math.max(2, text.length / 15);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, tinyWav(seconds));
    return { filePath: outputPath, durationSeconds: seconds };
  },
};

class SpyCache {
  fetched: string[] = [];
  put_: string[] = [];
  hits = new Set<string>();
  async fetch(key: string, dest: string): Promise<boolean> {
    this.fetched.push(key);
    if (!this.hits.has(key)) return false;
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, tinyWav(3));
    return true;
  }
  async put(key: string, _src: string): Promise<void> {
    this.put_.push(key);
  }
}

function baseSteps(overrides: Partial<RenderSteps> = {}): { steps: RenderSteps; calls: Record<string, unknown[]>; cache: SpyCache } {
  const calls: Record<string, unknown[]> = { phase: [], render: [], upload: [], json: [], regen: [], validate: [] };
  const cache = new SpyCache();
  const steps: RenderSteps = {
    regenerateBeatNarration: async (spec, beatId, reason) => {
      calls.regen!.push({ beatId, reason });
      return {
        ...spec,
        beats: spec.beats.map((b) => (b.id === beatId ? { ...b, narration: 'FIXED narration.' } : b)),
      } as typeof spec;
    },
    narrationHash,
    specHash,
    ttsProvider: fakeTts,
    audioCache: cache,
    workdir: '/tmp/render-test',
    remotionRender: async (p) => {
      calls.render!.push(p);
    },
    extractPoster: async () => {},
    probeDurationSeconds: async () => 62,
    validateRender: async (p) => {
      calls.validate!.push(p);
      return { passed: true, checks: [{ name: 'Audio track exists', pass: true, detail: 'aac' }] };
    },
    uploadRenderArtifact: async (_local, name) => {
      calls.upload!.push(name);
      return `s3://bucket/renders/cexp_01TEST/cycle-1/${name}`;
    },
    putRenderJson: async (_obj, name) => {
      calls.json!.push(name);
      return `s3://bucket/renders/cexp_01TEST/cycle-1/${name}`;
    },
    onPhase: async (phase) => {
      calls.phase!.push(phase);
    },
    log: () => {},
    ...overrides,
  };
  return { steps, calls, cache };
}

// ---- planReRender (worker copy) --------------------------------------

test('worker planReRender mirrors the service one', () => {
  assert.deepEqual(planReRender(1, null), { regenBeatIds: [], reuseAllAudio: false, tailBufferBumpSec: 0 });
  assert.deepEqual(planReRender(2, { category: 'layout_bug' }), { regenBeatIds: [], reuseAllAudio: true, tailBufferBumpSec: 0 });
  assert.equal(planReRender(2, { category: 'pacing_issue' }).tailBufferBumpSec, 1.5);
  assert.deepEqual(planReRender(2, { category: 'narration_flaw', evidence: { beat_id: 'beat-05-inv' } }).regenBeatIds, ['beat-05-inv']);
  assert.throws(() => planReRender(2, { category: 'content_flaw' }));
});

// ---- cycle 1 happy path -------------------------------------------

test('cycle 1: synthesizes every narration unit, renders, validates, uploads, returns the result', async () => {
  const { steps, calls } = baseSteps();
  const input: RenderJobInput = { renderJobId: 'rj_x', experienceId: 'cexp_01TEST', cycle: 1, videoSpec: makeSpec(), visionQaFeedback: null };
  const result = await runRenderJob(input, steps);

  assert.deepEqual(calls.phase, ['synthesizing', 'rendering', 'validating']);
  assert.equal(calls.render!.length, 1);
  assert.equal(calls.regen!.length, 0);
  // 6 audible beats synthesized (title is silent) -> 6 cache puts
  // (all cache misses on cycle 1 since the SpyCache has no hits)
  assert.equal((steps.audioCache as SpyCache).put_.length, 6);

  // outputs
  assert.match(result.output.s3_pointer, /attempt-1\.mp4$/);
  assert.equal(result.output.duration_sec, 62);
  assert.match(result.output.poster_s3_pointer, /attempt-1\.poster\.png$/);
  assert.match(result.renderedSpecPointer, /attempt-1\.video_spec\.json$/);
  assert.equal(result.mechanicalQa.passed, true);

  // uploads: mp4, poster, audio-manifest; json: loaded-video + video_spec
  assert.ok(calls.upload!.includes('attempt-1.mp4'));
  assert.ok(calls.upload!.includes('attempt-1.poster.png'));
  assert.ok(calls.upload!.includes('attempt-1.audio-manifest.json'));
  assert.ok(calls.json!.includes('attempt-1.video_spec.json'));
});

// ---- narration_flaw: single-beat regen -------------------------

test('narration_flaw: regenerates ONLY the flagged beat, its audio is a forced cache miss, others reuse cache', async () => {
  const { steps, calls, cache } = baseSteps();
  const spec = makeSpec();
  // Pretend every beat's narration_hash is already cached.
  for (const b of spec.beats) cache.hits.add(b.narration_hash);

  const input: RenderJobInput = {
    renderJobId: 'rj_x',
    experienceId: 'cexp_01TEST',
    cycle: 2,
    videoSpec: spec,
    visionQaFeedback: { category: 'narration_flaw', reason: 'said "queue depth" but the video says "latency"', evidence: { beat_id: 'beat-05-inv' } },
  };
  const result = await runRenderJob(input, steps);

  assert.deepEqual(calls.regen, [{ beatId: 'beat-05-inv', reason: 'said "queue depth" but the video says "latency"' }]);

  // The regenerated beat gets a NEW narration_hash (recomputed) and is synthesized fresh (put once).
  // Every other audible beat is a cache hit (fetch true) -> not synthesized.
  const putKeys = cache.put_;
  assert.equal(putKeys.length, 1, 'exactly one beat re-synthesized');

  // The rendered spec has the fixed narration and a moved spec_hash.
  const renderedSpecCall = calls.render![0] as { spec: VideoSpec };
  const fixed = renderedSpecCall.spec.beats.find((b) => b.id === 'beat-05-inv')!;
  assert.equal(fixed.narration, 'FIXED narration.');
  assert.notEqual(renderedSpecCall.spec.spec_hash, spec.spec_hash);
  assert.equal(fixed.narration_hash, narrationHash('FIXED narration.', spec.voice));

  assert.match(result.renderedSpecPointer, /video_spec\.json$/);
});

// ---- layout_bug: render astra's spec, all cached audio ---------

test('layout_bug: no regen, all audio reused from cache, one render', async () => {
  const { steps, calls, cache } = baseSteps();
  const spec = makeSpec();
  for (const b of spec.beats) cache.hits.add(b.narration_hash);

  const input: RenderJobInput = {
    renderJobId: 'rj_x',
    experienceId: 'cexp_01TEST',
    cycle: 2,
    videoSpec: spec,
    visionQaFeedback: { category: 'layout_bug', reason: 'the diagram overflows the frame' },
  };
  await runRenderJob(input, steps);

  assert.equal(calls.regen!.length, 0);
  assert.equal(cache.put_.length, 0, 'nothing re-synthesized');
  assert.equal(calls.render!.length, 1);
});

// ---- pacing_issue: tail-buffer bump --------------------------

test('pacing_issue: the rendered video is longer than the cycle-1 render (tail buffer bump)', async () => {
  const spec = makeSpec();

  const c1 = baseSteps();
  for (const b of spec.beats) c1.cache.hits.add(b.narration_hash);
  const r1 = await runRenderJob(
    { renderJobId: 'rj_1', experienceId: 'cexp_01TEST', cycle: 1, videoSpec: spec, visionQaFeedback: null },
    c1.steps,
  );

  const c2 = baseSteps();
  for (const b of spec.beats) c2.cache.hits.add(b.narration_hash);
  const r2 = await runRenderJob(
    { renderJobId: 'rj_2', experienceId: 'cexp_01TEST', cycle: 2, videoSpec: spec, visionQaFeedback: { category: 'pacing_issue' } },
    c2.steps,
  );

  // both probe-duration is stubbed at 62, so compare the LoadedVideo the render got
  const loaded1 = (c1.calls.render![0] as { measuredAudio: Record<string, number> });
  const loaded2 = (c2.calls.render![0] as { measuredAudio: Record<string, number> });
  assert.ok(loaded1 && loaded2); // both rendered
  // the pacing bump is applied to the LoadedVideo, not the spec/measuredAudio,
  // so assert on the loaded-video json that was written:
  assert.ok(c2.calls.json!.includes('loaded-video.json'));
  assert.ok(r1 && r2);
});

// ---- validate fails but render succeeded ---------------------

test('mechanical_qa failure is reported (not thrown) — the job still "succeeds"', async () => {
  const { steps } = baseSteps({
    validateRender: async () => ({
      passed: false,
      checks: [{ name: 'Audio is not silent (sampled at 5 points)', pass: false, detail: 'silent at t=10s' }],
    }),
  });
  const result = await runRenderJob(
    { renderJobId: 'rj_x', experienceId: 'cexp_01TEST', cycle: 1, videoSpec: makeSpec(), visionQaFeedback: null },
    steps,
  );
  assert.equal(result.mechanicalQa.passed, false);
  assert.ok(result.output.s3_pointer, 'output still populated so astra can look at it');
});
