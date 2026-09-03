import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAppearFrames, deriveRelationships, type InvestigationEntity, type InvestigationEvent } from './InvestigationSceneV2.js';

// Regression coverage for a real gap found during review: entities were
// rendered with a hardcoded appearFrame={0} regardless of their own events'
// timing, and relationships were hardcoded to an empty array — meaning the
// investigation scene never actually animated an entity into existence at
// the right moment, and never drew an edge for a "connect"/"send"/"evaluate"
// event, even though the underlying FlowArrow/ArchitectureNode primitives
// support exactly that. These two pure functions are what fix it; test them
// directly so the fix can't silently regress back to the hardcoded values.

const FPS = 30;

test('deriveAppearFrames: an entity never referenced by an event is present from frame 0', () => {
  const entities: InvestigationEntity[] = [{ id: 'main', category: 'process', label: 'main' }];
  const frames = deriveAppearFrames(entities, [], FPS);
  assert.equal(frames.get('main'), 0);
});

test('deriveAppearFrames: an entity created by an event appears at that event\'s frame, not frame 0', () => {
  const entities: InvestigationEntity[] = [
    { id: 'main', category: 'process', label: 'main' },
    { id: 'branch-feature', category: 'actor', label: 'feature' },
  ];
  const events: InvestigationEvent[] = [{ t: 8, type: 'create', target: 'branch-feature' }];
  const frames = deriveAppearFrames(entities, events, FPS);
  assert.equal(frames.get('main'), 0, 'main is never referenced by an event, so it is present from the start');
  assert.equal(frames.get('branch-feature'), 8 * FPS, 'branch-feature must appear at its own create event\'s time, not frame 0');
});

test('deriveAppearFrames: an entity referenced by multiple events uses the EARLIEST one', () => {
  const entities: InvestigationEntity[] = [{ id: 'role', category: 'actor', label: 'Deploy Role' }];
  const events: InvestigationEvent[] = [
    { t: 10, type: 'evaluate', target: 'role' },
    { t: 3, type: 'create', target: 'role' },
  ];
  const frames = deriveAppearFrames(entities, events, FPS);
  assert.equal(frames.get('role'), 3 * FPS);
});

test('deriveAppearFrames: an entity referenced only as from/to (not target) still gets a real appearFrame', () => {
  const entities: InvestigationEntity[] = [{ id: 'policy', category: 'policy', label: 'Trust Policy' }];
  const events: InvestigationEvent[] = [{ t: 5, type: 'send', target: 'principal', to: 'policy' }];
  const frames = deriveAppearFrames(entities, events, FPS);
  assert.equal(frames.get('policy'), 5 * FPS);
});

test('deriveRelationships: no relationships exist before any connecting event has fired', () => {
  const ids = new Set(['a', 'b']);
  const rels = deriveRelationships([], ids, FPS);
  assert.equal(rels.length, 0);
});

test('deriveRelationships: a "connect" event between two real entities produces a flowing, highlighted edge appearing at that event\'s frame', () => {
  const ids = new Set(['branch-feature', 'main']);
  const events: InvestigationEvent[] = [{ t: 8, type: 'connect', target: 'branch-feature', to: 'main' }];
  const rels = deriveRelationships(events, ids, FPS);
  assert.equal(rels.length, 1);
  assert.equal(rels[0]!.fromId, 'branch-feature');
  assert.equal(rels[0]!.toId, 'main');
  assert.equal(rels[0]!.flowing, true, 'a connect event must produce a flowing (animated traveling-dot) edge, not a static line');
  assert.equal(rels[0]!.appearFrame, 8 * FPS);
});

test('deriveRelationships: "send"/"receive"/"evaluate" also produce flowing edges (the request-traveling-through-stages case)', () => {
  const ids = new Set(['principal', 'policy', 'sts']);
  const events: InvestigationEvent[] = [
    { t: 0, type: 'send', target: 'principal', to: 'sts' },
    { t: 4, type: 'evaluate', target: 'sts', to: 'policy' },
  ];
  const rels = deriveRelationships(events, ids, FPS);
  assert.equal(rels.length, 2);
  assert.ok(rels.every((r) => r.flowing === true));
});

test('deriveRelationships: a "disconnect" event removes a previously-connected pair', () => {
  const ids = new Set(['a', 'b']);
  const events: InvestigationEvent[] = [
    { t: 2, type: 'connect', target: 'a', to: 'b' },
    { t: 9, type: 'disconnect', target: 'a', to: 'b' },
  ];
  const rels = deriveRelationships(events, ids, FPS);
  assert.equal(rels.length, 0, 'a later disconnect must remove the edge, not leave it visible forever');
});

test('deriveRelationships: an event whose target or to is not a declared entity id is ignored, not crashed on', () => {
  const ids = new Set(['a']);
  const events: InvestigationEvent[] = [{ t: 2, type: 'connect', target: 'a', to: 'ghost-entity' }];
  const rels = deriveRelationships(events, ids, FPS);
  assert.equal(rels.length, 0);
});

test('deriveRelationships: a "fail" or "evaluate"-without-to event does not fabricate an edge', () => {
  const ids = new Set(['role']);
  const events: InvestigationEvent[] = [{ t: 2, type: 'fail', target: 'role', detail: 'AccessDenied' }];
  const rels = deriveRelationships(events, ids, FPS);
  assert.equal(rels.length, 0);
});
