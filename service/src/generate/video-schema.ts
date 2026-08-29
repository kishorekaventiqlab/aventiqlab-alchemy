/**
 * The video/v1 deliverable JSON Schema (AL8 docs/video-v1-schema.md).
 *
 * This is the `content` shape for artifact_type: "video" — simultaneously
 * /v1/render's video_spec. Kept in its own file (it's large) and re-exported
 * from schemas.ts.
 *
 * Enums track docs/video-v1-schema.md §1 / §3 / §4 and the real video-studio
 * Beat[] types.
 */

const EYEBROW_COLOR = ["accent", "danger", "warning", "success"];
const NODE_KIND = ["users", "alb", "service", "pod", "gpu", "keda", "scheduler", "karpenter", "node"];
const STAGE = [
  "problem",
  "stakes",
  "curiosity",
  "context_mental_model",
  "options",
  "trade_offs",
  "investigation_demonstration",
  "decision",
  "best_practice",
  "takeaway",
];
const VISUAL_KIND = [
  "title",
  "statement",
  "architecture",
  "optionsCompare",
  "investigation",
  "investigation_segment",
  "dashboard",
  "terminal",
  "editor",
  "recap",
];

const HASH = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" } as const;

const VISUAL = {
  type: "object",
  required: ["kind"],
  // Per-kind payloads are validated structurally-lite here (kind + the fields
  // the renderer needs). A deep per-kind check is in selfcheck.ts.
  properties: {
    kind: { type: "string", enum: VISUAL_KIND },
    // title
    title: { type: "string" },
    subtitle: { type: "string" },
    // statement
    eyebrow: { type: "string" },
    eyebrow_color: { type: "string", enum: EYEBROW_COLOR },
    statement: { type: "string" },
    support: { type: "string" },
    // architecture
    nodes: {
      type: "array",
      items: {
        type: "object",
        required: ["node_kind", "label", "x", "y"],
        additionalProperties: false,
        properties: {
          node_kind: { type: "string", enum: NODE_KIND },
          label: { type: "string" },
          sublabel: { type: ["string", "null"] },
          x: { type: "number", minimum: 0, maximum: 1920 },
          y: { type: "number", minimum: 0, maximum: 1080 },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        required: ["from_index", "to_index"],
        additionalProperties: false,
        properties: {
          from_index: { type: "integer", minimum: 0 },
          to_index: { type: "integer", minimum: 0 },
          flowing: { type: "boolean" },
        },
      },
    },
    highlight_index: { type: ["integer", "null"], minimum: 0 },
    // optionsCompare
    options: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "solves"],
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          solves: { type: "string" },
          does_not_solve: { type: "string" },
          favored: { type: "boolean" },
        },
      },
    },
    // investigation
    keyframes: {
      type: "array",
      minItems: 2,
      items: {
        type: "object",
        required: ["t", "traffic", "pod_count", "gpu_pct", "queue_depth", "nodes", "pending_pods", "resolved_pods"],
        additionalProperties: false,
        properties: {
          t: { type: "number", minimum: 0 },
          traffic: { type: "number" },
          pod_count: { type: "number" },
          gpu_pct: { type: "number" },
          queue_depth: { type: "number" },
          nodes: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "label", "fill_percent"],
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                label: { type: "string" },
                fill_percent: { type: "number", minimum: 0, maximum: 100 },
                full: { type: "boolean" },
                incoming: { type: "boolean" },
              },
            },
          },
          pending_pods: { type: "array", items: { type: "string" } },
          resolved_pods: { type: "array", items: { type: "string" } },
          traffic_color: { type: ["string", "null"], enum: [...EYEBROW_COLOR, null] },
          gpu_color: { type: ["string", "null"], enum: [...EYEBROW_COLOR, null] },
        },
      },
    },
    segments: {
      type: "array",
      items: {
        type: "object",
        required: ["t", "narration_ref"],
        additionalProperties: false,
        properties: {
          t: { type: "number", minimum: 0 },
          narration_ref: { type: "string" },
          highlight_index: { type: ["integer", "null"], minimum: 0 },
        },
      },
    },
    camera_keyframes: {
      type: "array",
      items: {
        type: "object",
        required: ["t", "focal_x", "focal_y", "scale"],
        additionalProperties: false,
        properties: {
          t: { type: "number", minimum: 0 },
          focal_x: { type: "number" },
          focal_y: { type: "number" },
          scale: { type: "number", minimum: 0.1 },
        },
      },
    },
    // investigation_segment
    of_container: { type: "string" },
    segment_index: { type: "integer", minimum: 0 },
    // dashboard
    service_name: { type: "string" },
    alert: { type: "string" },
    panels: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "unit", "color", "points"],
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          unit: { type: "string" },
          color: { type: "string" },
          points: { type: "array", items: { type: "number" }, minItems: 2 },
          flat: { type: "boolean" },
        },
      },
    },
    focus_panel_index: { type: ["integer", "null"], minimum: 0 },
    // terminal / editor
    lines: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "text"],
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["prompt", "output", "existing", "added", "comment", "placeholder"] },
          text: { type: "string" },
        },
      },
    },
    filename: { type: "string" },
    focus_line_index: { type: ["integer", "null"], minimum: 0 },
    // recap
    items: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
  },
} as const;

export const VIDEO_SCHEMA = {
  $id: "video.v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "schema_version",
    "experience_id",
    "title",
    "format",
    "central_question",
    "estimated_duration_minutes",
    "target_duration_class",
    "spec_hash",
    "voice",
    "beats",
  ],
  properties: {
    schema_version: { const: "video/v1" },
    experience_id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    // OQ-1: v1 generates animated-explainer only.
    format: { const: "animated-explainer" },
    central_question: { type: "string", minLength: 1 },
    estimated_duration_minutes: { type: "number", minimum: 0.25 },
    target_duration_class: { type: "string", enum: ["short", "standard", "deep-dive"] },
    spec_hash: HASH,
    voice: {
      type: "object",
      required: ["provider", "voice_id", "params"],
      additionalProperties: false,
      properties: {
        provider: { const: "chatterbox-v3" },
        voice_id: { type: "string" },
        params: { type: "object" },
      },
    },
    beats: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "narration", "narration_hash", "on_screen", "target_duration_sec", "visual"],
        properties: {
          id: { type: "string", pattern: "^beat-[0-9]{2,}[a-z0-9-]*$" },
          stage: { type: ["string", "null"], enum: [...STAGE, null] },
          narration: { type: "string" },
          narration_hash: HASH,
          on_screen: { type: "string", minLength: 1 },
          target_duration_sec: { type: "number", minimum: 0 },
          outline_hint: { type: "string" },
          visual: VISUAL,
        },
      },
    },
  },
} as const;

export { STAGE as VIDEO_STAGE_ENUM, VISUAL_KIND };
