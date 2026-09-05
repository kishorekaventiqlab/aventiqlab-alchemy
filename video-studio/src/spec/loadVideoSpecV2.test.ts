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

// Regression test for a real bug found only by watching an actual rendered
// video (unit/schema-level checks never catch this — they don't measure
// real TTS audio against the full event timeline): events[].t is authored
// against the beat's PROVISIONAL duration (target_duration_sec, here 24s),
// but real narration is almost always shorter, so the beat's REAL duration
// after retiming can be much less. Without rescaling, an event timed near
// the end of the provisional window (e.g. t=12 of 24s) falls past a much
// shorter real duration and never fires during actual playback — the
// diagram freezes mid-story while the narration keeps describing changes
// that never visually happen. events[].t MUST scale by the same ratio
// segments already do.
test('retimeBeatsV2 rescales events[].t when real audio compresses the beat far below its provisional duration', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const invBefore = loaded.beats.find((b) => b.type === 'investigation');
  assert.ok(invBefore && invBefore.type === 'investigation');
  assert.equal(invBefore.provisionalDuration, invBefore.duration, 'provisionalDuration is set at load time, before any retiming');
  const originalEventTimes = invBefore.events.map((e) => e.t);
  assert.deepEqual(originalEventTimes, [0, 12]); // from the fixture: t=0 create, t=12 state_change

  // Real narration much shorter than the 24s target_duration_sec estimate —
  // this is exactly the shape of what happened in the real Git-branching
  // render: a beat estimated at 49s came back as 29.7s of real audio.
  const retimed = retimeBeatsV2(loaded, { 'beat-04a-seg.wav': 1.5, 'beat-04b-seg.wav': 1.5 });
  const invAfter = retimed.beats.find((b) => b.type === 'investigation');
  assert.ok(invAfter && invAfter.type === 'investigation');
  assert.ok(invAfter.duration < invBefore.duration, 'the real duration must have actually compressed for this test to be meaningful');

  const scale = invAfter.duration / invBefore.provisionalDuration;
  for (const e of invAfter.events) {
    assert.ok(e.t <= invAfter.duration + 0.01, `event at t=${e.t} must not fall past the beat's real duration (${invAfter.duration})`);
  }
  // Every event's new t must be its original t scaled by the same ratio segments were compressed by.
  assert.ok(Math.abs(invAfter.events[0]!.t - originalEventTimes[0]! * scale) < 0.02);
  assert.ok(Math.abs(invAfter.events[1]!.t - originalEventTimes[1]! * scale) < 0.02);
});

// ---- Phase B: architecture's OPTIONAL events[] (video/v2 temporal mechanism proposal) ----

test('BACKWARD COMPATIBILITY: an architecture beat with no events[] loads exactly as before this feature existed', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const arch = loaded.beats.find((b) => b.type === 'architecture');
  assert.ok(arch && arch.type === 'architecture');
  assert.equal(arch.events, undefined, 'a spec with no events on this beat must produce undefined, not an empty array — the two are not the same thing to ArchitectureDiagramV2\'s static/timeline branch');
  assert.equal(arch.entities.length, 2);
  assert.equal(arch.relationships.length, 1);
  assert.equal(arch.highlightId, undefined);
});

test('BACKWARD COMPATIBILITY: retiming an architecture beat with no events[] does not add one', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const retimed = retimeBeatsV2(loaded, {});
  const arch = retimed.beats.find((b) => b.type === 'architecture');
  assert.ok(arch && arch.type === 'architecture');
  assert.equal(arch.events, undefined);
});

test('an architecture beat WITH events[] carries them through, mapped id-for-id like investigation\'s', () => {
  const spec = makeSpec();
  const archBeat = spec.beats.find((b) => b.id === 'beat-03-arch')!;
  if (archBeat.visual.kind === 'architecture') {
    archBeat.visual.events = [
      { t: 2, type: 'state_change', target: 'commit-b', from: 'healthy', to: 'under load' },
    ];
  }
  const loaded = loadVideoSpecV2(spec);
  const arch = loaded.beats.find((b) => b.type === 'architecture');
  assert.ok(arch && arch.type === 'architecture');
  assert.ok(arch.events);
  assert.equal(arch.events!.length, 1);
  assert.equal(arch.events![0]!.type, 'state_change');
  assert.equal(arch.events![0]!.target, 'commit-b');
  assert.equal(arch.events![0]!.from, 'healthy');
  assert.equal(arch.events![0]!.to, 'under load');
});

test('retimeBeatsV2 rescales an architecture beat\'s events[].t the same way it rescales investigation\'s', () => {
  const spec = makeSpec();
  const archBeat = spec.beats.find((b) => b.id === 'beat-03-arch')!;
  if (archBeat.visual.kind === 'architecture') {
    archBeat.visual.events = [{ t: 6, type: 'state_change', target: 'commit-b', from: 'healthy', to: 'under load' }];
  }
  const loaded = loadVideoSpecV2(spec);
  const archBefore = loaded.beats.find((b) => b.type === 'architecture');
  assert.ok(archBefore && archBefore.type === 'architecture');
  assert.equal(archBefore.provisionalDuration, archBefore.duration);

  // Real audio much shorter than the 12s target_duration_sec estimate for beat-03-arch.
  const retimed = retimeBeatsV2(loaded, { 'beat-03-arch.wav': 2 });
  const archAfter = retimed.beats.find((b) => b.type === 'architecture');
  assert.ok(archAfter && archAfter.type === 'architecture');
  assert.ok(archAfter.duration < archBefore.duration, 'the real duration must have actually compressed for this test to be meaningful');

  const scale = archAfter.duration / archBefore.provisionalDuration;
  assert.ok(Math.abs(archAfter.events![0]!.t - 6 * scale) < 0.02);
  assert.ok(archAfter.events![0]!.t <= archAfter.duration + 0.01, 'a rescaled event must not fall past the real, retimed beat duration');
});

// ---- Phase A: investigation's OPTIONAL camera_keyframes (video/v2 temporal mechanism proposal) ----

test('BACKWARD COMPATIBILITY: an investigation beat with no camera_keyframes loads exactly as before this feature existed', () => {
  const loaded = loadVideoSpecV2(makeSpec());
  const inv = loaded.beats.find((b) => b.type === 'investigation');
  assert.ok(inv && inv.type === 'investigation');
  assert.equal(inv.cameraKeyframes, undefined);
});

test('an investigation beat WITH camera_keyframes carries them through, mapped from snake_case to camelCase', () => {
  const spec = makeSpec();
  const invBeat = spec.beats.find((b) => b.id === 'beat-04-inv')!;
  if (invBeat.visual.kind === 'investigation') {
    invBeat.visual.camera_keyframes = [
      { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
      { t: 12, focal_x: 0.7, focal_y: 0.3, scale: 1.4 },
    ];
  }
  const loaded = loadVideoSpecV2(spec);
  const inv = loaded.beats.find((b) => b.type === 'investigation');
  assert.ok(inv && inv.type === 'investigation');
  assert.ok(inv.cameraKeyframes);
  assert.equal(inv.cameraKeyframes!.length, 2);
  assert.equal(inv.cameraKeyframes![1]!.focalX, 0.7);
  assert.equal(inv.cameraKeyframes![1]!.focalY, 0.3);
  assert.equal(inv.cameraKeyframes![1]!.scale, 1.4);
});

test('retimeBeatsV2 rescales camera_keyframes[].t the same way it rescales events[].t', () => {
  const spec = makeSpec();
  const invBeat = spec.beats.find((b) => b.id === 'beat-04-inv')!;
  if (invBeat.visual.kind === 'investigation') {
    invBeat.visual.camera_keyframes = [
      { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
      { t: 12, focal_x: 0.7, focal_y: 0.3, scale: 1.4 },
    ];
  }
  const loaded = loadVideoSpecV2(spec);
  const invBefore = loaded.beats.find((b) => b.type === 'investigation');
  assert.ok(invBefore && invBefore.type === 'investigation');

  const retimed = retimeBeatsV2(loaded, { 'beat-04a-seg.wav': 1.5, 'beat-04b-seg.wav': 1.5 });
  const invAfter = retimed.beats.find((b) => b.type === 'investigation');
  assert.ok(invAfter && invAfter.type === 'investigation');
  assert.ok(invAfter.duration < invBefore.duration, 'the real duration must have actually compressed for this test to be meaningful');

  const scale = invAfter.duration / invBefore.provisionalDuration;
  assert.ok(Math.abs(invAfter.cameraKeyframes![1]!.t - 12 * scale) < 0.02);
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
