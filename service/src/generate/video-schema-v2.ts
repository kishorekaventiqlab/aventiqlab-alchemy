/**
 * The video/v2 deliverable JSON Schema.
 *
 * video/v1 (video-schema.ts) is FROZEN — this is a new, additive contract, not
 * a breaking change to it. v1's `architecture` and `investigation` visual
 * kinds were lifted directly from one hand-built Kubernetes/GPU-autoscaling
 * reference video (node_kind enum: users/alb/service/pod/gpu/keda/scheduler/
 * karpenter/node; investigation keyframes: traffic/pod_count/gpu_pct/
 * queue_depth/pending_pods/resolved_pods) — a real generation bug (a real
 * Git/IAM video rendering Kubernetes visuals) traced back to this coupling.
 * v2 replaces ONLY these two visual kinds with topic-neutral primitives;
 * every other visual kind (title/statement/optionsCompare/dashboard/
 * terminal/editor/recap) is unchanged from v1 — they were already generic.
 *
 * `architecture` (v2): a small `category` enum selects a rendering SHAPE
 * (actor/service/process/datastore/policy/queue/boundary/external), never a
 * domain concept. Domain meaning (a Git "commit", an IAM "policy", a K8s
 * "pod") lives entirely in `label`/`sublabel` text, same as it already does
 * for every other visual kind. `entities`/`relationships` are id-referenced
 * (not positional-index-referenced like v1's nodes/edges) — more robust for
 * a generalized entity set the model itself chooses the size of.
 * `architecture` MAY ALSO carry an OPTIONAL `events[]` timeline (the exact
 * same semantic vocabulary `investigation` uses — see below) describing what
 * changes about the diagram as the beat plays; omitting it renders exactly
 * as a static topology diagram, unchanged from before this addition.
 *
 * `investigation` (v2): the K8s-telemetry-shaped keyframe fields are gone.
 * Instead: a set of `entities` (same `category` enum) whose state changes
 * over time via a small, closed vocabulary of semantic `events` (create,
 * move, connect, disconnect, send, receive, execute, evaluate, fail,
 * recover, transform, allocate, release, scale, schedule, merge, rebase,
 * state_change) — the renderer maps each event type to deterministic visual
 * behavior; the LLM never invents its own event vocabulary.
 */

const EYEBROW_COLOR = ["accent", "danger", "warning", "success"];
const ENTITY_CATEGORY = ["actor", "service", "process", "datastore", "policy", "queue", "boundary", "external"];
const EVENT_TYPE = [
  "create",
  "move",
  "connect",
  "disconnect",
  "send",
  "receive",
  "execute",
  "evaluate",
  "fail",
  "recover",
  "transform",
  "allocate",
  "release",
  "scale",
  "schedule",
  "merge",
  "rebase",
  "state_change",
];
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
const VISUAL_KIND_V2 = [
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

const VISUAL_V2 = {
  type: "object",
  required: ["kind"],
  properties: {
    kind: { type: "string", enum: VISUAL_KIND_V2 },
    // title
    title: { type: "string" },
    subtitle: { type: "string" },
    // statement
    eyebrow: { type: "string" },
    eyebrow_color: { type: "string", enum: EYEBROW_COLOR },
    statement: { type: "string" },
    support: { type: "string" },
    // architecture (v2 — generic entities/relationships, id-referenced)
    entities: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "category", "label"],
        additionalProperties: false,
        properties: {
          id: { type: "string", minLength: 1 },
          category: { type: "string", enum: ENTITY_CATEGORY },
          label: { type: "string" },
          sublabel: { type: ["string", "null"] },
          // architecture-only: layout position. investigation entities omit these
          // (the investigation renderer lays them out itself).
          x: { type: "number", minimum: 0, maximum: 1920 },
          y: { type: "number", minimum: 0, maximum: 1080 },
        },
      },
    },
    relationships: {
      type: "array",
      items: {
        type: "object",
        required: ["from_id", "to_id"],
        additionalProperties: false,
        properties: {
          from_id: { type: "string", minLength: 1 },
          to_id: { type: "string", minLength: 1 },
          flowing: { type: "boolean" },
        },
      },
    },
    highlight_id: { type: ["string", "null"] },
    // architecture, OPTIONAL: the same semantic events[] timeline investigation
    // uses (video/v2 temporal mechanism proposal, Phase B) — when present, it
    // describes what changes about entities/relationships as the beat plays
    // (a node failing, traffic rerouting), reusing the `events` property
    // already defined below rather than a second, duplicate field.
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
    // investigation (v2 — generic entities + semantic events, no K8s telemetry)
    events: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["t", "type"],
        additionalProperties: false,
        properties: {
          t: { type: "number", minimum: 0 },
          type: { type: "string", enum: EVENT_TYPE },
          target: { type: ["string", "null"] },
          from: { type: ["string", "null"] },
          to: { type: ["string", "null"] },
          detail: { type: ["string", "null"] },
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
          highlight_id: { type: ["string", "null"] },
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

export const VIDEO_SCHEMA_V2 = {
  $id: "video.v2.json",
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
    schema_version: { const: "video/v2" },
    experience_id: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
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
          // The short, learner-facing on-screen text (distinct from
          // `on_screen`, which is a reviewer-facing prose description the
          // mechanical self-check keyword-matches against visual.kind, and
          // from `narration`, the full spoken detail). Optional so older
          // v2 specs without it still validate; the renderer falls back to
          // a hard-truncated narration when absent. Length-capped in
          // selfcheck.ts, not here, so the cap can live alongside the
          // shared density token instead of being duplicated as a literal.
          on_screen_caption: { type: "string", minLength: 1 },
          target_duration_sec: { type: "number", minimum: 0 },
          outline_hint: { type: "string" },
          visual: VISUAL_V2,
        },
      },
    },
  },
} as const;

export { STAGE as VIDEO_V2_STAGE_ENUM, VISUAL_KIND_V2, ENTITY_CATEGORY, EVENT_TYPE };
