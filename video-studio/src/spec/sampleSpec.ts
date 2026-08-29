/**
 * A small, valid video/v1 spec so the `spec-video` composition is previewable
 * in the Remotion studio with no inputProps. Not a real generated artifact —
 * `/v1/render` always passes a real spec via inputProps.
 */
import type { VideoSpec } from './videoSpecTypes.js';

const H = 'sha256:' + '0'.repeat(64);

export const SAMPLE_SPEC: VideoSpec = {
  schema_version: 'video/v1',
  experience_id: 'cexp_SAMPLE',
  title: 'Spec-Driven Renderer — Sample',
  format: 'animated-explainer',
  central_question: 'Does the spec-driven renderer produce a coherent video?',
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
      visual: { kind: 'title', title: 'Spec-Driven Renderer', subtitle: 'A sample video/v1 render' },
    },
    {
      id: 'beat-02-problem',
      stage: 'problem',
      narration: 'This video was assembled from a video/v1 specification, not a hand-authored beat file.',
      narration_hash: H,
      on_screen: 'A red statement card explaining the sample.',
      target_duration_sec: 8,
      visual: {
        kind: 'statement',
        eyebrow: 'What this is',
        eyebrow_color: 'accent',
        statement: 'Rendered from a video_spec.',
        support: 'The loader maps each visual.kind onto an existing component.',
      },
    },
    {
      id: 'beat-03-curiosity',
      stage: 'curiosity',
      narration: 'The question is whether the mapping stays faithful across every visual kind.',
      narration_hash: H,
      on_screen: 'An accent statement card posing the question.',
      target_duration_sec: 7,
      visual: { kind: 'statement', eyebrow: 'The question', eyebrow_color: 'warning', statement: 'Is the mapping faithful?' },
    },
    {
      id: 'beat-04-bp',
      stage: 'best_practice',
      narration: 'Keep the spec the single source of truth, and let the renderer stay generic.',
      narration_hash: H,
      on_screen: 'A green best-practice statement card.',
      target_duration_sec: 7,
      visual: {
        kind: 'statement',
        eyebrow: 'Best practice',
        eyebrow_color: 'success',
        statement: 'Spec is the source of truth; the renderer stays generic.',
      },
    },
  ],
};
