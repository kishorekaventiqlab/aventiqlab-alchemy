import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadVideoSpecV2, retimeBeatsV2, VideoSpecV2Error } from './loadVideoSpecV2.js';
import type { VideoSpecV2 } from './videoSpecTypesV2.js';

// A compact but structurally-complete video/v2 spec on a Git-branching
// topic (deliberately not Kubernetes) — title + one of each simple visual +
// an investigation (container + 2 segments) driven by entities/events.
function makeSpec(overrides: Partial<VideoSpecV2> = {}): VideoSpecV2 {
  const h = 'sha256:' + '0'.repeat(64);
  return {
    schema_version: 'video/v2',
    experience_id: 'cexp_01TEST',
    title: 'Test Video',
    format: 'animated-explainer',
    central_question: 'What is a Git branch?',
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
        visual: { kind: 'title', title: 'Test Video', subtitle: 'What is a Git branch?' },
      },
      {
        id: 'beat-02-problem',
        stage: 'problem',
        narration: 'A fast-forward merge is no longer possible.',
        narration_hash: h,
        on_screen: 'A red statement card.',
        target_duration_sec: 8,
        visual: { kind: 'statement', eyebrow: 'The problem', eyebrow_color: 'danger', statement: 'Merge conflict.' },
      },
      {
        id: 'beat-03-arch',
        stage: 'context_mental_model',
        narration: 'Here is the commit graph.',
        narration_hash: h,
        on_screen: 'Architecture diagram with entities and relationships.',
        target_duration_sec: 12,
        visual: {
          kind: 'architecture',
          entities: [
            { id: 'commit-a', category: 'process', label: 'Commit A', x: 200, y: 160 },
            { id: 'commit-b', category: 'process', label: 'Commit B', sublabel: 'main', x: 800, y: 160 },
          ],
          relationships: [{ from_id: 'commit-a', to_id: 'commit-b', flowing: true }],
          highlight_id: null,
        },
      },
      {
        id: 'beat-04-inv',
        stage: 'investigation_demonstration',
        narration: '',
        narration_hash: h,
        on_screen: 'A continuous scene of the branch being created.',
        target_duration_sec: 24,
        visual: {
          kind: 'investigation',
          entities: [
            { id: 'commit-a', category: 'process', label: 'Commit A' },
            { id: 'branch-feature', category: 'actor', label: 'feature' },
          ],
          events: [
            { t: 0, type: 'create', target: 'branch-feature', detail: 'git branch feature' },
            { t: 12, type: 'state_change', target: 'branch-feature', from: 'none', to: 'created' },
          ],
          segments: [
            { t: 0, narration_ref: 'beat-04a-seg', highlight_id: null },
            { t: 12, narration_ref: 'beat-04b-seg', highlight_id: 'branch-feature' },
          ],
        },
      },
      {
        id: 'beat-04a-seg',
        stage: 'investigation_demonstration',
        narration: 'The commit graph at rest.',
        narration_hash: h,
        on_screen: 'A calm commit graph.',
        target_duration_sec: 12,
        visual: { kind: 'investigation_segment', of_container: 'beat-04-inv', segment_index: 0 },
      },
      {
        id: 'beat-04b-seg',
        stage: 'investigation_demonstration',
        narration: 'Now a new branch reference appears.',
        narration_hash: h,
        on_screen: 'A new branch pointer appears.',
        target_duration_sec: 12,
        visual: { kind: 'investigation_segment', of_container: 'beat-04-inv', segment_index: 1 },
      },
      {
        id: 'beat-05-decision',
        stage: 'decision',
        narration: 'Create the branch before making changes.',
        narration_hash: h,
        on_screen: 'An accent statement card.',
        target_duration_sec: 10,
        visual: { kind: 'statement', eyebrow: 'The decision', eyebrow_color: 'accent', statement: 'Branch first.' },
      },
      {
        id: 'beat-06-bp',
        stage: 'best_practice',
        narration: 'A branch is a pointer, not a copy.',
        narration_hash: h,
        on_screen: 'A green statement card.',
        target_duration_sec: 9,
        visual: { kind: 'statement', eyebrow: 'Best practice', eyebrow_color: 'success', statement: 'Pointer, not copy.' },
      },
    ],
    ...overrides,
  };
}

// ---- basic load ---------------------------------------------------------

test('loadVideoSpecV2 produces renderer beats + timing + narration intervals', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  assert.equal(loaded.experienceId, 'cexp_01TEST');
  assert.equal(loaded.fps, 30);
  assert.equal(loaded.beats.length, 6);
  assert.equal(loaded.totalDurationFrames, Math.round(loaded.totalDurationSeconds * 30));

  let prevEnd = 0;
  for (const b of loaded.beats) {
    assert.ok(Math.abs(b.start - prevEnd) < 0.01, `beat ${b.type} starts at prev end`);
    assert.ok(b.duration > 0);
    prevEnd = b.start + b.duration;
  }
});

test('the investigation segments are folded into the container beat', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const inv = loaded.beats.find((b) => b.type === 'investigation');
  assert.ok(inv && inv.type === 'investigation');
  assert.equal(inv.segments.length, 2);
  assert.equal(inv.segments[0]!.caption, 'The commit graph at rest.');
  assert.equal(inv.segments[1]!.caption, 'Now a new branch reference appears.');
  assert.equal(inv.segments[1]!.highlightId, 'branch-feature');
  // entities/events pass through structurally
  assert.equal(inv.entities.length, 2);
  assert.equal(inv.events[0]!.type, 'create');
  assert.equal(inv.events[1]!.to, 'created');
  assert.ok(!loaded.beats.some((b) => (b as { type: string }).type === 'investigation_segment'));
});

test('the audio plan covers every narration unit — beats AND investigation segments, not the container or silent title', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const ids = loaded.audioPlan.map((e) => e.beatId).sort();
  assert.deepEqual(ids, [
    'beat-02-problem',
    'beat-03-arch',
    'beat-04a-seg',
    'beat-04b-seg',
    'beat-05-decision',
    'beat-06-bp',
  ]);
  const problem = loaded.audioPlan.find((e) => e.beatId === 'beat-02-problem')!;
  assert.equal(problem.caption, 'A fast-forward merge is no longer possible.');
  assert.equal(problem.audioFile, 'beat-02-problem.wav');
});

test('narration intervals: one per audible beat + one per investigation segment', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  assert.equal(loaded.narrationIntervals.length, 6);
  for (const iv of loaded.narrationIntervals) {
    assert.ok(iv.endSeconds > iv.startSeconds);
  }
});

test('a spec beat carrying real content maps its visual props through (id-referenced, not index-referenced)', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const arch = loaded.beats.find((b) => b.type === 'architecture');
  assert.ok(arch && arch.type === 'architecture');
  assert.equal(arch.entities[0]!.id, 'commit-a');
  assert.equal(arch.entities[0]!.category, 'process');
  assert.equal(arch.relationships[0]!.fromId, 'commit-a');
  assert.equal(arch.relationships[0]!.toId, 'commit-b');
  assert.equal(arch.caption, 'Here is the commit graph.');
});

// ---- structural K8s-vocabulary regression guard --------------------------

test('no beat produced by loadVideoSpecV2 carries any Kubernetes/GPU-specific field or vocabulary', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const serialized = JSON.stringify(loaded);
  for (const banned of ['pod_count', 'gpu_pct', 'queue_depth', 'node_kind', 'karpenter', 'keda', 'pending_pods', 'resolved_pods']) {
    assert.ok(!serialized.includes(banned), `loaded video must not contain "${banned}"`);
  }
});

// ---- retiming ---------------------------------------------------------

test('retimeBeatsV2 rewrites start/duration from measured audio and keeps beats contiguous', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const measured = {
    'beat-02-problem.wav': 3.0,
    'beat-03-arch.wav': 5.0,
    'beat-04a-seg.wav': 4.0,
    'beat-04b-seg.wav': 6.0,
    'beat-05-decision.wav': 4.0,
    'beat-06-bp.wav': 3.5,
  };
  const retimed = retimeBeatsV2(loaded, measured);

  const problem = retimed.beats.find((b) => (b as { audioFile?: string }).audioFile === 'beat-02-problem.wav')!;
  assert.ok(Math.abs(problem.duration - 4.5) < 0.01);

  let prevEnd = 0;
  for (const b of retimed.beats) {
    assert.ok(Math.abs(b.start - prevEnd) < 0.01);
    prevEnd = b.start + b.duration;
  }
  assert.ok(retimed.totalDurationSeconds < loaded.totalDurationSeconds);
});

test('retimeBeatsV2 re-lays the investigation segments against measured audio', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const retimed = retimeBeatsV2(loaded, { 'beat-04a-seg.wav': 4.0, 'beat-04b-seg.wav': 6.0 });
  const inv = retimed.beats.find((b) => b.type === 'investigation');
  assert.ok(inv && inv.type === 'investigation');
  assert.equal(inv.segments[0]!.t, 0);
  assert.ok(Math.abs(inv.segments[1]!.t - 5.5) < 0.01);
});

// ---- validation ------------------------------------------------------

test('rejects a non-video/v2 schema_version', () => {
  assert.throws(
    () => loadVideoSpecV2(makeSpec({ schema_version: 'video/v1' as never })),
    (e: unknown) => e instanceof VideoSpecV2Error,
  );
});

test('rejects a non animated-explainer format', () => {
  assert.throws(
    () => loadVideoSpecV2(makeSpec({ format: 'screencast' as never })),
    (e: unknown) => e instanceof VideoSpecV2Error,
  );
});

test('rejects duplicate beat ids', () => {
  const spec = makeSpec();
  spec.beats[2]!.id = 'beat-02-problem';
  assert.throws(() => loadVideoSpecV2(spec), (e: unknown) => e instanceof VideoSpecV2Error);
});

test('rejects an investigation_segment pointing at a non-existent container', () => {
  const spec = makeSpec();
  (spec.beats[4]!.visual as { of_container: string }).of_container = 'beat-99-nope';
  assert.throws(() => loadVideoSpecV2(spec), (e: unknown) => e instanceof VideoSpecV2Error);
});

test('rejects an empty beats array', () => {
  assert.throws(() => loadVideoSpecV2(makeSpec({ beats: [] })), (e: unknown) => e instanceof VideoSpecV2Error);
});
