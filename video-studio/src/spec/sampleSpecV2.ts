/**
 * A small, valid video/v2 spec so the `spec-video-v2` composition is
 * previewable in the Remotion studio with no inputProps. Not a real
 * generated artifact — `/v1/render` always passes a real spec via
 * inputProps. Deliberately a Git-branching topic (not Kubernetes/GPU) and
 * deliberately exercises BOTH `architecture` and `investigation` — v1's
 * own sampleSpec.ts exercises neither, which is part of why the original
 * K8s-coupling bug went undetected for so long.
 */
import type { VideoSpecV2 } from './videoSpecTypesV2.js';

const H = 'sha256:' + '0'.repeat(64);

export const SAMPLE_SPEC_V2: VideoSpecV2 = {
  schema_version: 'video/v2',
  experience_id: 'cexp_SAMPLE_V2',
  title: 'Spec-Driven Renderer v2 — Sample',
  format: 'animated-explainer',
  central_question: 'How does Git represent a new branch?',
  estimated_duration_minutes: 1,
  target_duration_class: 'short',
  spec_hash: H,
  voice: { provider: 'chatterbox-v3', voice_id: 'default', params: { exaggeration: 0.5, cfg_weight: 0.5 } },
  beats: [
    {
      id: 'beat-01-title',
      stage: null,
      narration: '',
      narration_hash: H,
      on_screen: 'Title card.',
      target_duration_sec: 5,
      visual: { kind: 'title', title: 'What Is a Git Branch?', subtitle: 'A sample video/v2 render' },
    },
    {
      id: 'beat-02-context',
      stage: 'context_mental_model',
      narration: 'Here is the commit graph: main and feature both started from the same commit.',
      narration_hash: H,
      on_screen: 'An architecture diagram shows two branch references pointing at different commits.',
      target_duration_sec: 9,
      visual: {
        kind: 'architecture',
        entities: [
          { id: 'commit-a', category: 'process', label: 'Commit A', x: 500, y: 400 },
          { id: 'commit-b', category: 'process', label: 'Commit B', sublabel: 'main', x: 900, y: 300 },
        ],
        relationships: [{ from_id: 'commit-a', to_id: 'commit-b' }],
      },
    },
    {
      id: 'beat-03-investigation',
      stage: 'investigation_demonstration',
      narration: '',
      narration_hash: H,
      on_screen: 'The investigation view shows a new branch reference appearing at the current commit.',
      target_duration_sec: 0,
      visual: {
        kind: 'investigation',
        entities: [
          { id: 'commit-a', category: 'process', label: 'Commit A', x: 500, y: 400 },
          { id: 'commit-b', category: 'process', label: 'Commit B', sublabel: 'main', x: 900, y: 300 },
          { id: 'branch-feature', category: 'actor', label: 'feature', x: 900, y: 500 },
        ],
        events: [
          { t: 0, type: 'create', target: 'branch-feature', detail: 'git branch feature' },
          { t: 4, type: 'state_change', target: 'branch-feature', from: 'none', to: 'created' },
        ],
        segments: [{ t: 0, narration_ref: 'beat-03a-investigation-seg' }],
      },
    },
    {
      id: 'beat-03a-investigation-seg',
      stage: null,
      narration: 'Git creates a new branch reference pointing at the current commit — nothing about the commit history changes yet.',
      narration_hash: H,
      on_screen: 'The investigation view highlights the new branch reference appearing.',
      target_duration_sec: 8,
      visual: { kind: 'investigation_segment', of_container: 'beat-03-investigation', segment_index: 0 },
    },
    {
      id: 'beat-04-bp',
      stage: 'best_practice',
      narration: 'A branch is just a movable pointer — creating one never rewrites history.',
      narration_hash: H,
      on_screen: 'A green best-practice statement card.',
      target_duration_sec: 7,
      visual: {
        kind: 'statement',
        eyebrow: 'Best practice',
        eyebrow_color: 'success',
        statement: 'A branch is a pointer, not a copy.',
      },
    },
  ],
};
