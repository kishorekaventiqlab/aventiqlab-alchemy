/**
 * The video/v1 `video_spec` shape, as consumed by the renderer (AL8
 * docs/video-v1-schema.md). This is a structural mirror of the schema in
 * `service/src/generate/video-schema.ts` — the two are kept in sync by hand
 * (contract §3.8: no codegen between the service and video-studio).
 *
 * The renderer only needs the fields it renders; extra fields are ignored.
 */

export type EyebrowColor = 'accent' | 'danger' | 'warning' | 'success';

export type VideoSpecStage =
  | 'problem'
  | 'stakes'
  | 'curiosity'
  | 'context_mental_model'
  | 'options'
  | 'trade_offs'
  | 'investigation_demonstration'
  | 'decision'
  | 'best_practice'
  | 'takeaway';

export interface SpecArchNode {
  node_kind:
    | 'users'
    | 'alb'
    | 'service'
    | 'pod'
    | 'gpu'
    | 'keda'
    | 'scheduler'
    | 'karpenter'
    | 'node';
  label: string;
  sublabel?: string | null;
  x: number;
  y: number;
}

export interface SpecArchEdge {
  from_index: number;
  to_index: number;
  flowing?: boolean;
}

export interface SpecCompareOption {
  name: string;
  solves: string;
  does_not_solve?: string;
  favored?: boolean;
}

export interface SpecInvestigationNode {
  id: string;
  label: string;
  fill_percent: number;
  full?: boolean;
  incoming?: boolean;
}

export interface SpecInvestigationKeyframe {
  t: number;
  traffic: number;
  pod_count: number;
  gpu_pct: number;
  queue_depth: number;
  nodes: SpecInvestigationNode[];
  pending_pods: string[];
  resolved_pods: string[];
  traffic_color?: EyebrowColor | null;
  gpu_color?: EyebrowColor | null;
}

export interface SpecInvestigationSegment {
  t: number;
  /** id of the beat that carries this segment's narration. */
  narration_ref: string;
  highlight_index?: number | null;
}

export interface SpecCameraKeyframe {
  t: number;
  focal_x: number;
  focal_y: number;
  scale: number;
}

export interface SpecDashboardPanel {
  label: string;
  unit: string;
  color: string;
  points: number[];
  flat?: boolean;
}

export interface SpecLine {
  kind: 'prompt' | 'output' | 'existing' | 'added' | 'comment' | 'placeholder';
  text: string;
}

export type SpecVisual =
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
      nodes: SpecArchNode[];
      edges: SpecArchEdge[];
      highlight_index?: number | null;
    }
  | { kind: 'optionsCompare'; options: SpecCompareOption[] }
  | {
      kind: 'investigation';
      keyframes: SpecInvestigationKeyframe[];
      segments: SpecInvestigationSegment[];
      camera_keyframes?: SpecCameraKeyframe[];
    }
  | {
      kind: 'investigation_segment';
      of_container: string;
      segment_index: number;
      highlight_index?: number | null;
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

export interface SpecBeat {
  id: string;
  stage?: VideoSpecStage | null;
  narration: string;
  narration_hash: string;
  on_screen: string;
  target_duration_sec: number;
  outline_hint?: string;
  visual: SpecVisual;
}

export interface VideoSpec {
  schema_version: 'video/v1';
  experience_id: string;
  title: string;
  format: 'animated-explainer';
  central_question: string;
  estimated_duration_minutes: number;
  target_duration_class: 'short' | 'standard' | 'deep-dive';
  spec_hash: string;
  voice: { provider: string; voice_id: string; params: Record<string, unknown> };
  beats: SpecBeat[];
}
