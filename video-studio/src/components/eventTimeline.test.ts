import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveCameraFrame, deriveCreateFrames, type TimelineCameraKeyframe, type TimelineEvent } from './eventTimeline.js';

// deriveCreateFrames backs ArchitectureDiagramV2's timeline path (Phase B). A
// real fixture-verification bug was found and fixed while building this:
// reusing deriveAppearFrames (investigation's "first referenced by ANY
// event" rule) made every entity referenced by an event pop into existence
// mid-beat, even though architecture's entities carry model-placed x/y and
// ARE the beat's starting topology by definition (video-schema-v2.ts's own
// comment: "the model places them") — the wrong direction for a beat whose
// job is showing a state the learner should already recognize. Only an
// entity with its OWN `create` event should animate in; deriveCreateFrames
// is the narrower rule that fixes this, and these tests pin it.

test('deriveCreateFrames: an entity with no create event is not in the map (caller defaults it to frame 0 — the starting diagram)', () => {
  const events: TimelineEvent[] = [{ t: 4, type: 'state_change', target: 'target-a', from: 'healthy', to: 'under load' }];
  const frames = deriveCreateFrames(events, 30);
  assert.equal(frames.has('target-a'), false, 'a state_change referencing an entity must NOT make it "created" at that frame — only an explicit create event does');
});

test('deriveCreateFrames: an entity with a create event gets that event\'s frame', () => {
  const events: TimelineEvent[] = [{ t: 5, type: 'create', target: 'new-replica' }];
  const frames = deriveCreateFrames(events, 30);
  assert.equal(frames.get('new-replica'), 150);
});

test('deriveCreateFrames: a "send"/"evaluate"/"fail" event referencing an entity does NOT count as creating it', () => {
  const events: TimelineEvent[] = [
    { t: 2, type: 'send', target: 'alb-node-a', to: 'target-a' },
    { t: 6, type: 'evaluate', target: 'target-a' },
    { t: 8, type: 'fail', target: 'target-a' },
  ];
  const frames = deriveCreateFrames(events, 30);
  assert.equal(frames.size, 0, 'none of send/evaluate/fail are create events — target-a must stay in the starting diagram, not pop in');
});

test('deriveCreateFrames: an entity with multiple create events uses the EARLIEST one', () => {
  const events: TimelineEvent[] = [
    { t: 8, type: 'create', target: 'replica' },
    { t: 3, type: 'create', target: 'replica' },
  ];
  const frames = deriveCreateFrames(events, 30);
  assert.equal(frames.get('replica'), 90);
});

// deriveRelationships/deriveAppearFrames are covered by InvestigationSceneV2.test.ts
// (re-exported from there for backward compatibility — see InvestigationSceneV2.tsx).
// This file covers deriveCameraFrame, the new function added for Phase A
// (video/v2 temporal mechanism proposal) — wiring up the previously-unused
// camera_keyframes schema field.

test('deriveCameraFrame: no keyframes at all -> static, centered, unscaled (today\'s default)', () => {
  const frame = deriveCameraFrame(undefined, 5);
  assert.deepEqual(frame, { focalX: 0.5, focalY: 0.5, scale: 1 });
});

test('deriveCameraFrame: empty keyframes array -> same static default', () => {
  const frame = deriveCameraFrame([], 5);
  assert.deepEqual(frame, { focalX: 0.5, focalY: 0.5, scale: 1 });
});

test('deriveCameraFrame: before the first keyframe, holds the first keyframe\'s values (never extrapolates)', () => {
  const keyframes: TimelineCameraKeyframe[] = [{ t: 4, focal_x: 0.7, focal_y: 0.3, scale: 1.4 }];
  const frame = deriveCameraFrame(keyframes, 0);
  assert.deepEqual(frame, { focalX: 0.7, focalY: 0.3, scale: 1.4 });
});

test('deriveCameraFrame: after the last keyframe, holds the last keyframe\'s values (never extrapolates)', () => {
  const keyframes: TimelineCameraKeyframe[] = [
    { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
    { t: 4, focal_x: 0.7, focal_y: 0.3, scale: 1.4 },
  ];
  const frame = deriveCameraFrame(keyframes, 10);
  assert.deepEqual(frame, { focalX: 0.7, focalY: 0.3, scale: 1.4 });
});

test('deriveCameraFrame: linearly interpolates focalX/focalY/scale between the two bracketing keyframes', () => {
  const keyframes: TimelineCameraKeyframe[] = [
    { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
    { t: 4, focal_x: 0.9, focal_y: 0.1, scale: 1.4 },
  ];
  const frame = deriveCameraFrame(keyframes, 2); // halfway
  assert.equal(frame.focalX, 0.7);
  assert.equal(frame.focalY, 0.3);
  assert.equal(frame.scale, 1.2);
});

test('deriveCameraFrame: keyframes given out of order are sorted before interpolating', () => {
  const keyframes: TimelineCameraKeyframe[] = [
    { t: 4, focal_x: 0.9, focal_y: 0.1, scale: 1.4 },
    { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
  ];
  const frame = deriveCameraFrame(keyframes, 2);
  assert.equal(frame.focalX, 0.7);
  assert.equal(frame.scale, 1.2);
});

test('deriveCameraFrame: exactly at a keyframe\'s own t, returns that keyframe\'s exact values', () => {
  const keyframes: TimelineCameraKeyframe[] = [
    { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
    { t: 4, focal_x: 0.9, focal_y: 0.1, scale: 1.4 },
  ];
  const frame = deriveCameraFrame(keyframes, 4);
  assert.deepEqual(frame, { focalX: 0.9, focalY: 0.1, scale: 1.4 });
});

test('deriveCameraFrame: three keyframes, picks the correct bracketing pair for a point past the first', () => {
  const keyframes: TimelineCameraKeyframe[] = [
    { t: 0, focal_x: 0.5, focal_y: 0.5, scale: 1 },
    { t: 4, focal_x: 0.9, focal_y: 0.1, scale: 1.4 },
    { t: 8, focal_x: 0.2, focal_y: 0.8, scale: 1 },
  ];
  const frame = deriveCameraFrame(keyframes, 6); // halfway between t=4 and t=8
  assert.ok(Math.abs(frame.focalX - 0.55) < 1e-9);
  assert.ok(Math.abs(frame.focalY - 0.45) < 1e-9);
  assert.ok(Math.abs(frame.scale - 1.2) < 1e-9);
});
