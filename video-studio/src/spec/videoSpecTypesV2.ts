/**
 * The video/v2 `video_spec` shape, as consumed by the renderer. Structural
 * mirror of `service/src/generate/video-schema-v2.ts` (kept in sync by hand,
 * same as v1's videoSpecTypes.ts — see that file's header for why there's no
 * codegen between the service and video-studio).
 *
 * v2 replaces ONLY `architecture` and `investigation` with topic-neutral
 * primitives (entities/relationships/events, id-referenced); every other
 * visual kind is byte-for-byte identical to v1's — see EyebrowColor,
 * VideoSpecStage, SpecCompareOption, SpecCameraKeyframe, SpecDashboardPanel,
 * SpecLine, which are re-exported from videoSpecTypes.ts rather than
 * duplicated.
 */
export type {
  EyebrowColor,
  VideoSpecStage,
  SpecCompareOption,
  SpecCameraKeyframe,
  SpecDashboardPanel,
  SpecLine,
} from './videoSpecTypes.js';
import type {
  EyebrowColor,
  VideoSpecStage,
  SpecCompareOption,
  SpecCameraKeyframe,
  SpecDashboardPanel,
  SpecLine,
} from './videoSpecTypes.js';

/**
 * A rendering SHAPE choice only — never the domain concept itself. The
 * domain meaning (a Git commit, an IAM role, a Kubernetes pod) lives
 * entirely in `label`/`sublabel`, same as every other visual kind already
 * does. Do NOT add domain-specific values here — see video-schema-v2.ts.
 */
export type EntityCategory =
  | 'actor'
  | 'service'
  | 'process'
  | 'datastore'
  | 'policy'
  | 'queue'
  | 'boundary'
  | 'external';

/**
 * The closed semantic vocabulary an investigation's `events[]` must use. The
 * renderer maps each type to deterministic visual behavior; the LLM never
 * invents its own event vocabulary (video-schema-v2.ts).
 */
export type EventType =
  | 'create'
  | 'move'
  | 'connect'
  | 'disconnect'
  | 'send'
  | 'receive'
  | 'execute'
  | 'evaluate'
  | 'fail'
  | 'recover'
  | 'transform'
  | 'allocate'
  | 'release'
  | 'scale'
  | 'schedule'
  | 'merge'
  | 'rebase'
  | 'state_change';

export interface SpecEntity {
  id: string;
  category: EntityCategory;
  label: string;
  sublabel?: string | null;
  /** architecture-only: layout position. investigation entities omit these. */
  x?: number;
  y?: number;
}

export interface SpecRelationship {
  from_id: string;
  to_id: string;
  flowing?: boolean;
}

export interface SpecEvent {
  t: number;
  type: EventType;
  target?: string | null;
  from?: string | null;
  to?: string | null;
  detail?: string | null;
}

export interface SpecInvestigationSegmentV2 {
  t: number;
  /** id of the beat that carries this segment's narration. */
  narration_ref: string;
  highlight_id?: string | null;
}

export type SpecVisualV2 =
  | { kind: 'title'; title: string; subtitle: string }
  | {
      kind: 'statement';
      eyebrow: string;
      eyebrow_color: EyebrowColor;
      statement: string;
      support?: string;
    }
  | {
      kind: 'architecture';
      entities: SpecEntity[];
      relationships: SpecRelationship[];
      highlight_id?: string | null;
    }
  | { kind: 'optionsCompare'; options: SpecCompareOption[] }
  | {
      kind: 'investigation';
      entities: SpecEntity[];
      events: SpecEvent[];
      segments: SpecInvestigationSegmentV2[];
      camera_keyframes?: SpecCameraKeyframe[];
    }
  | {
      kind: 'investigation_segment';
      of_container: string;
      segment_index: number;
      highlight_id?: string | null;
    }
  | {
      kind: 'dashboard';
      service_name: string;
      alert?: string;
      panels: SpecDashboardPanel[];
      focus_panel_index?: number | null;
    }
  | { kind: 'terminal'; lines: SpecLine[]; focus_line_index?: number | null }
  | {
      kind: 'editor';
      filename: string;
      lines: SpecLine[];
      focus_line_index?: number | null;
    }
  | { kind: 'recap'; items: string[] };

export interface SpecBeatV2 {
  id: string;
  stage?: VideoSpecStage | null;
  narration: string;
  narration_hash: string;
  on_screen: string;
  target_duration_sec: number;
  outline_hint?: string;
  visual: SpecVisualV2;
}

export interface VideoSpecV2 {
  schema_version: 'video/v2';
  experience_id: string;
  title: string;
  format: 'animated-explainer';
  central_question: string;
  estimated_duration_minutes: number;
  target_duration_class: 'short' | 'standard' | 'deep-dive';
  spec_hash: string;
  voice: { provider: string; voice_id: string; params: Record<string, unknown> };
  beats: SpecBeatV2[];
}
