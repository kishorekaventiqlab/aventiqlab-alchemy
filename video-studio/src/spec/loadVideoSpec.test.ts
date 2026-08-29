import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadVideoSpec, retimeBeats, VideoSpecError } from './loadVideoSpec.js';
import type { VideoSpec } from './videoSpecTypes.js';

// A compact but structurally-complete video/v1 spec: title + one of each
// simple visual + an investigation (container + 2 segments).
function makeSpec(overrides: Partial<VideoSpec> = {}): VideoSpec {
  const h = 'sha256:' + '0'.repeat(64);
  return {
    schema_version: 'video/v1',
    experience_id: 'cexp_01TEST',
    title: 'Test Video',
    format: 'animated-explainer',
    central_question: 'Why does the thing happen?',
    estimated_duration_minutes: 2,
    target_duration_class: 'standard',
    spec_hash: h,
    voice: { provider: 'chatterbox-v3', voice_id: 'default', params: {} },
    beats: [
      {
        id: 'beat-01-title',
        stage: null,
        narration: '',
        narration_hash: h,
        on_screen: 'Title card.',
        target_duration_sec: 6,
        visual: { kind: 'title', title: 'Test Video', subtitle: 'Why does the thing happen?' },
      },
      {
        id: 'beat-02-problem',
        stage: 'problem',
        narration: 'Something is slow.',
        narration_hash: h,
        on_screen: 'A red statement card.',
        target_duration_sec: 8,
        visual: { kind: 'statement', eyebrow: 'The problem', eyebrow_color: 'danger', statement: 'It is slow.' },
      },
      {
        id: 'beat-03-arch',
        stage: 'context_mental_model',
        narration: 'Here is the system.',
        narration_hash: h,
        on_screen: 'Architecture diagram with nodes and arrows.',
        target_duration_sec: 12,
        visual: {
          kind: 'architecture',
          nodes: [
            { node_kind: 'users', label: 'Users', x: 200, y: 160 },
            { node_kind: 'pod', label: 'Pod', sublabel: 'vLLM', x: 800, y: 160 },
          ],
          edges: [{ from_index: 0, to_index: 1, flowing: true }],
          highlight_index: null,
        },
      },
      {
        id: 'beat-04-inv',
        stage: 'investigation_demonstration',
        narration: '',
        narration_hash: h,
        on_screen: 'A continuous scene of pods and a queue.',
        target_duration_sec: 24,
        visual: {
          kind: 'investigation',
          keyframes: [
            {
              t: 0,
              traffic: 100,
              pod_count: 4,
              gpu_pct: 45,
              queue_depth: 0,
              nodes: [{ id: 'n1', label: 'GPU Node 1', fill_percent: 45 }],
              pending_pods: [],
              resolved_pods: [],
            },
            {
              t: 24,
              traffic: 900,
              pod_count: 12,
              gpu_pct: 99,
              queue_depth: 40,
              nodes: [{ id: 'n1', label: 'GPU Node 1', fill_percent: 100, full: true }],
              pending_pods: ['pod-13'],
              resolved_pods: [],
            },
          ],
          segments: [
            { t: 0, narration_ref: 'beat-04a-seg', highlight_index: null },
            { t: 12, narration_ref: 'beat-04b-seg', highlight_index: 3 },
          ],
        },
      },
      {
        id: 'beat-04a-seg',
        stage: 'investigation_demonstration',
        narration: 'The system at rest.',
        narration_hash: h,
        on_screen: 'Calm cluster.',
        target_duration_sec: 12,
        visual: { kind: 'investigation_segment', of_container: 'beat-04-inv', segment_index: 0 },
      },
      {
        id: 'beat-04b-seg',
        stage: 'investigation_demonstration',
        narration: 'Now the nodes are full and pods go Pending.',
        narration_hash: h,
        on_screen: 'Full nodes, pending pods.',
        target_duration_sec: 12,
        visual: { kind: 'investigation_segment', of_container: 'beat-04-inv', segment_index: 1 },
      },
      {
        id: 'beat-05-decision',
        stage: 'decision',
        narration: 'Run both together.',
        narration_hash: h,
        on_screen: 'An accent statement card.',
        target_duration_sec: 10,
        visual: { kind: 'statement', eyebrow: 'The decision', eyebrow_color: 'accent', statement: 'Do both.' },
      },
      {
        id: 'beat-06-bp',
        stage: 'best_practice',
        narration: 'Check capacity first.',
        narration_hash: h,
        on_screen: 'A green statement card.',
        target_duration_sec: 9,
        visual: { kind: 'statement', eyebrow: 'Best practice', eyebrow_color: 'success', statement: 'Check capacity.' },
      },
    ],
    ...overrides,
  };
}

// ---- basic load ---------------------------------------------------------

test('loadVideoSpec produces renderer beats + timing + narration intervals', () => {
  const loaded = loadVideoSpec(makeSpec());
  assert.equal(loaded.experienceId, 'cexp_01TEST');
  assert.equal(loaded.fps, 30);
  // 8 spec beats -> 6 renderer beats (2 investigation segment beats folded into
  // the container; the container stays)
  assert.equal(loaded.beats.length, 6);
  assert.equal(loaded.totalDurationFrames, Math.round(loaded.totalDurationSeconds * 30));

  // beats are contiguous and monotonic
  let prevEnd = 0;
  for (const b of loaded.beats) {
    assert.ok(Math.abs(b.start - prevEnd) < 0.01, `beat ${b.type} starts at prev end`);
    assert.ok(b.duration > 0);
    prevEnd = b.start + b.duration;
  }
});

test('the investigation segments are folded into the container beat', () => {
  const loaded = loadVideoSpec(makeSpec());
  const inv = loaded.beats.find((b) => b.type === 'investigation');
  assert.ok(inv && inv.type === 'investigation');
  assert.equal(inv.segments.length, 2);
  assert.equal(inv.segments[0]!.caption, 'The system at rest.');
  assert.equal(inv.segments[1]!.caption, 'Now the nodes are full and pods go Pending.');
  assert.equal(inv.segments[1]!.highlightIndex, 3);
  // keyframes mapped to renderer casing
  assert.equal(inv.keyframes[0]!.podCount, 4);
  assert.equal(inv.keyframes[1]!.queueDepth, 40);
  // no standalone segment beats in the renderer beat list
  assert.ok(!loaded.beats.some((b) => (b as { type: string }).type === 'investigation_segment'));
});

test('the audio plan covers every narration unit — beats AND investigation segments, not the container or silent title', () => {
  const loaded = loadVideoSpec(makeSpec());
  const ids = loaded.audioPlan.map((e) => e.beatId).sort();
  assert.deepEqual(ids, [
    'beat-02-problem',
    'beat-03-arch',
    'beat-04a-seg',
    'beat-04b-seg',
    'beat-05-decision',
    'beat-06-bp',
  ]);
  // caption text is the verbatim narration
  const problem = loaded.audioPlan.find((e) => e.beatId === 'beat-02-problem')!;
  assert.equal(problem.caption, 'Something is slow.');
  // stable filenames derived from beat id
  assert.equal(problem.audioFile, 'beat-02-problem.wav');
});

test('narration intervals: one per audible beat + one per investigation segment', () => {
  const loaded = loadVideoSpec(makeSpec());
  // 5 non-investigation audible beats (problem, arch, decision, bp) = 4... wait
  // title is silent. problem, arch, decision, bp = 4; + 2 investigation segs = 6
  assert.equal(loaded.narrationIntervals.length, 6);
  for (const iv of loaded.narrationIntervals) {
    assert.ok(iv.endSeconds > iv.startSeconds);
  }
});

test('a spec beat carrying real content maps its visual props through', () => {
  const loaded = loadVideoSpec(makeSpec());
  const arch = loaded.beats.find((b) => b.type === 'architecture');
  assert.ok(arch && arch.type === 'architecture');
  assert.equal(arch.nodes[0]!.kind, 'users'); // node_kind -> kind
  assert.equal(arch.edges[0]!.fromIndex, 0); // from_index -> fromIndex
  assert.equal(arch.caption, 'Here is the system.'); // narration -> caption
});

// ---- retiming ---------------------------------------------------------

test('retimeBeats rewrites start/duration from measured audio and keeps beats contiguous', () => {
  const loaded = loadVideoSpec(makeSpec());
  const measured = {
    'beat-02-problem.wav': 3.0,
    'beat-03-arch.wav': 5.0,
    'beat-04a-seg.wav': 4.0,
    'beat-04b-seg.wav': 6.0,
    'beat-05-decision.wav': 4.0,
    'beat-06-bp.wav': 3.5,
  };
  const retimed = retimeBeats(loaded, measured);

  const problem = retimed.beats.find((b) => (b as { audioFile?: string }).audioFile === 'beat-02-problem.wav')!;
  // 3.0s audio + 0.5 lead-in + 1.0 buffer = 4.5
  assert.ok(Math.abs(problem.duration - 4.5) < 0.01);

  let prevEnd = 0;
  for (const b of retimed.beats) {
    assert.ok(Math.abs(b.start - prevEnd) < 0.01);
    prevEnd = b.start + b.duration;
  }
  // total shrank vs the provisional estimate
  assert.ok(retimed.totalDurationSeconds < loaded.totalDurationSeconds);
});

test('retimeBeats re-lays the investigation segments against measured audio', () => {
  const loaded = loadVideoSpec(makeSpec());
  const retimed = retimeBeats(loaded, { 'beat-04a-seg.wav': 4.0, 'beat-04b-seg.wav': 6.0 });
  const inv = retimed.beats.find((b) => b.type === 'investigation');
  assert.ok(inv && inv.type === 'investigation');
  assert.equal(inv.segments[0]!.t, 0);
  // segment 2 starts after seg 1's (4.0 + 0.5 + 1.0) = 5.5
  assert.ok(Math.abs(inv.segments[1]!.t - 5.5) < 0.01);
});

// ---- validation ------------------------------------------------------

test('rejects a non-video/v1 schema_version', () => {
  assert.throws(
    () => loadVideoSpec(makeSpec({ schema_version: 'video/v2' as never })),
    (e: unknown) => e instanceof VideoSpecError,
  );
});

test('rejects a non animated-explainer format', () => {
  assert.throws(
    () => loadVideoSpec(makeSpec({ format: 'screencast' as never })),
    (e: unknown) => e instanceof VideoSpecError,
  );
});

test('rejects duplicate beat ids', () => {
  const spec = makeSpec();
  spec.beats[2]!.id = 'beat-02-problem';
  assert.throws(() => loadVideoSpec(spec), (e: unknown) => e instanceof VideoSpecError);
});

test('rejects an investigation_segment pointing at a non-existent container', () => {
  const spec = makeSpec();
  (spec.beats[4]!.visual as { of_container: string }).of_container = 'beat-99-nope';
  assert.throws(() => loadVideoSpec(spec), (e: unknown) => e instanceof VideoSpecError);
});

test('rejects an empty beats array', () => {
  assert.throws(() => loadVideoSpec(makeSpec({ beats: [] })), (e: unknown) => e instanceof VideoSpecError);
});
