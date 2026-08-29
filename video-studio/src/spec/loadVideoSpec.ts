/**
 * AL4 — the video/v1 `video_spec` -> renderer bridge.
 *
 * Turns an AL8 `video_spec` into the in-memory structures the Remotion
 * compositions consume:
 *   - a `Beat[]` (the same discriminated union `src/data/*Script.ts` hand-author)
 *   - TOTAL_DURATION_SECONDS
 *   - NARRATION_INTERVALS (for BackgroundMusic ducking)
 *   - an audio plan (which beat -> which .wav, and the caption text to synth)
 *
 * Timing note: AL4 runs BEFORE narration is synthesized, so beat `start` /
 * `duration` here are PROVISIONAL — derived from `target_duration_sec`. AL5's
 * `/v1/render` synthesizes audio with `scripts/generate-audio.ts`, measures each
 * clip, then calls `retimeBeats()` to rewrite `start`/`duration` to the real
 * audio length + lead-in + buffer. The renderer is timing-agnostic; it just
 * lays out `<Sequence>`s from whatever `start`/`duration` it's given.
 *
 * The `investigation` beat is special (AL8 §4.5 / OQ-4 option (a)): the spec has
 * a container beat (`visual.kind: "investigation"`, `narration: ""`) plus N
 * sibling segment beats (`visual.kind: "investigation_segment"`). The renderer's
 * `Beat` for `investigation` folds the segments back INTO the container as
 * `segments: [{ t, caption, audioFile, highlightIndex }]`, matching
 * `InferenceUnderLoad.tsx`. Segment beats do not become their own renderer beats.
 */

import type { VideoSpec, SpecBeat, SpecInvestigationKeyframe } from './videoSpecTypes.js';

export const FPS = 30;
/** Seconds of silent lead-in before a beat's narration starts (matches the compositions). */
export const LEAD_IN_SECONDS = 0.5;
/** Extra tail padding after narration ends. */
export const TAIL_BUFFER_SECONDS = 1.0;

// ---- Renderer beat types (mirror of src/data/*Script.ts `Beat`) -----------

export type RendererBeat =
  | { type: 'title'; start: number; duration: number; title: string; subtitle: string; audioFile?: string }
  | {
      type: 'statement';
      start: number;
      duration: number;
      caption: string;
      eyebrow: string;
      eyebrowColor?: 'accent' | 'danger' | 'warning' | 'success';
      statement: string;
      support?: string;
      audioFile?: string;
    }
  | {
      type: 'optionsCompare';
      start: number;
      duration: number;
      caption: string;
      options: { name: string; solves: string; doesNotSolve?: string; favored?: boolean }[];
      audioFile?: string;
    }
  | {
      type: 'architecture';
      start: number;
      duration: number;
      caption: string;
      nodes: {
        kind: 'users' | 'alb' | 'service' | 'pod' | 'gpu' | 'keda' | 'scheduler' | 'karpenter' | 'node';
        label: string;
        sublabel?: string;
        x: number;
        y: number;
      }[];
      edges: { fromIndex: number; toIndex: number; flowing?: boolean }[];
      highlightIndex?: number;
      audioFile?: string;
    }
  | {
      type: 'investigation';
      start: number;
      duration: number;
      keyframes: RendererInvestigationKeyframe[];
      segments: RendererInvestigationSegment[];
    }
  | {
      type: 'dashboard';
      start: number;
      duration: number;
      caption: string;
      serviceName: string;
      alert?: string;
      panels: { label: string; unit: string; color: string; points: number[]; flat?: boolean }[];
      audioFile?: string;
      focusPanelIndex?: number;
    }
  | {
      type: 'terminal';
      start: number;
      duration: number;
      caption: string;
      lines: { kind: 'prompt' | 'output'; text: string }[];
      audioFile?: string;
      focusLineIndex?: number;
    }
  | {
      type: 'editor';
      start: number;
      duration: number;
      caption: string;
      filename: string;
      lines: { kind: 'existing' | 'added' | 'comment' | 'placeholder'; text: string }[];
      audioFile?: string;
      focusLineIndex?: number;
    }
  | { type: 'recap'; start: number; duration: number; caption: string; items: string[]; audioFile?: string };

export interface RendererInvestigationKeyframe {
  t: number;
  traffic: number;
  podCount: number;
  gpuPct: number;
  queueDepth: number;
  nodes: { id: string; label: string; fillPercent: number; full?: boolean; incoming?: boolean }[];
  pendingPods: string[];
  resolvedPods: string[];
  trafficColor?: 'accent' | 'danger' | 'warning' | 'success';
  gpuColor?: 'accent' | 'danger' | 'warning' | 'success';
}

export interface RendererInvestigationSegment {
  t: number;
  caption: string;
  audioFile: string;
  highlightIndex?: number;
}

export interface AudioPlanEntry {
  /** The .wav basename generate-audio.ts should produce for this narration unit. */
  audioFile: string;
  /** The exact narration text to synthesize. */
  caption: string;
  /** The spec beat id this narration belongs to. */
  beatId: string;
  /** Provisional allocated window, seconds (pre-synthesis). */
  allocatedSeconds: number;
}

export interface LoadedVideo {
  experienceId: string;
  title: string;
  centralQuestion: string;
  fps: number;
  beats: RendererBeat[];
  totalDurationSeconds: number;
  totalDurationFrames: number;
  narrationIntervals: { startSeconds: number; endSeconds: number }[];
  /** One entry per narration unit (a beat, or an investigation segment). */
  audioPlan: AudioPlanEntry[];
  /** The spec's own hash, echoed for traceability. */
  specHash: string;
}

// ---- Errors --------------------------------------------------------------

export class VideoSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoSpecError';
  }
}

// ---- The loader --------------------------------------------------------

export function loadVideoSpec(spec: VideoSpec): LoadedVideo {
  assertShape(spec);

  const audioFileForBeat = new Map<string, string>();
  const audioPlan: AudioPlanEntry[] = [];

  // First pass: assign a stable audio filename to every standalone
  // narration-bearing beat. Investigation container beats (narration "") get
  // none; investigation SEGMENT beats are handled in the container pass below;
  // a silent title beat gets none.
  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation' || b.visual.kind === 'investigation_segment') continue;
    if (b.narration.trim() === '') continue;
    const audioFile = `${slug(b.id)}.wav`;
    audioFileForBeat.set(b.id, audioFile);
    audioPlan.push({
      audioFile,
      caption: b.narration,
      beatId: b.id,
      allocatedSeconds: provisionalWindow(b.target_duration_sec),
    });
  }

  // Second pass: build renderer beats with provisional timing.
  const beats: RendererBeat[] = [];
  let cursor = 0;
  const containerById = new Map<string, SpecBeat>();
  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation') containerById.set(b.id, b);
  }
  // Segment beats keyed by their container.
  const segmentsByContainer = new Map<string, SpecBeat[]>();
  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation_segment') {
      const arr = segmentsByContainer.get(b.visual.of_container) ?? [];
      arr.push(b);
      segmentsByContainer.set(b.visual.of_container, arr);
    }
  }

  for (const b of spec.beats) {
    // Segment beats are folded into their container — skip here.
    if (b.visual.kind === 'investigation_segment') continue;

    if (b.visual.kind === 'investigation') {
      const segs = (segmentsByContainer.get(b.id) ?? []).slice();
      // order segments by the container's segments[] t, falling back to the
      // segment beat's own array position
      const orderT = new Map(b.visual.segments.map((s) => [s.narration_ref, s.t]));
      segs.sort((a, c) => (orderT.get(a.id) ?? 0) - (orderT.get(c.id) ?? 0));

      const rSegments: RendererInvestigationSegment[] = b.visual.segments.map((s) => {
        const segBeat = segs.find((x) => x.id === s.narration_ref);
        if (!segBeat) {
          throw new VideoSpecError(
            `investigation "${b.id}" segment narration_ref "${s.narration_ref}" has no matching segment beat`,
          );
        }
        const audioFile = `${slug(segBeat.id)}.wav`;
        audioFileForBeat.set(segBeat.id, audioFile);
        return {
          t: s.t,
          caption: segBeat.narration,
          audioFile,
          highlightIndex: s.highlight_index ?? undefined,
        };
      });

      // audio plan entries for the segments (in container-segment order)
      for (let i = 0; i < rSegments.length; i++) {
        const seg = rSegments[i]!;
        const nextT = rSegments[i + 1]?.t ?? b.target_duration_sec;
        audioPlan.push({
          audioFile: seg.audioFile,
          caption: seg.caption,
          beatId: b.visual.segments[i]!.narration_ref,
          allocatedSeconds: Math.max(0.5, nextT - seg.t),
        });
      }

      const duration = provisionalInvestigationWindow(b, rSegments);
      beats.push({
        type: 'investigation',
        start: round2(cursor),
        duration: round2(duration),
        keyframes: b.visual.keyframes.map(mapKeyframe),
        segments: rSegments.map((s) => ({ ...s, t: round2(s.t) })),
      });
      cursor += duration;
      continue;
    }

    const audioFile = audioFileForBeat.get(b.id);
    const duration = provisionalWindow(b.target_duration_sec);
    beats.push(mapVisualToBeat(b, round2(cursor), round2(duration), audioFile));
    cursor += duration;
  }

  const totalDurationSeconds = round2(cursor);
  const narrationIntervals = buildNarrationIntervals(beats);

  return {
    experienceId: spec.experience_id,
    title: spec.title,
    centralQuestion: spec.central_question,
    fps: FPS,
    beats,
    totalDurationSeconds,
    totalDurationFrames: Math.round(totalDurationSeconds * FPS),
    narrationIntervals,
    audioPlan,
    specHash: spec.spec_hash,
  };
}

// ---- Retiming (called by AL5 after audio synthesis) --------------------

export interface MeasuredAudio {
  /** audioFile basename -> measured duration in seconds. */
  [audioFile: string]: number;
}

/**
 * Rewrite every beat's `start`/`duration` to fit the real synthesized audio.
 * `measured` maps each `audioPlan` entry's `audioFile` to its measured seconds.
 * Beats/segments with no audio keep their provisional window.
 */
export function retimeBeats(loaded: LoadedVideo, measured: MeasuredAudio): LoadedVideo {
  const audioFor = (id: string): string | undefined =>
    loaded.audioPlan.find((e) => e.beatId === id)?.audioFile;

  const beats: RendererBeat[] = [];
  let cursor = 0;
  for (const beat of loaded.beats) {
    if (beat.type === 'investigation') {
      // Retime each segment relative to the scene start; the scene duration is
      // the sum of its segments' (measured audio + tail).
      let segCursor = 0;
      const segments = beat.segments.map((seg) => {
        const dur = (measured[seg.audioFile] ?? 0) + LEAD_IN_SECONDS + TAIL_BUFFER_SECONDS;
        const retimed = { ...seg, t: round2(segCursor) };
        segCursor += Math.max(dur, 0.5);
        return retimed;
      });
      const duration = round2(Math.max(segCursor, 1));
      beats.push({ ...beat, start: round2(cursor), duration, segments });
      cursor += duration;
      continue;
    }

    const af = 'audioFile' in beat ? beat.audioFile : undefined;
    const measuredSec = af ? measured[af] : undefined;
    const duration =
      measuredSec !== undefined
        ? round2(measuredSec + LEAD_IN_SECONDS + TAIL_BUFFER_SECONDS)
        : beat.duration;
    beats.push({ ...beat, start: round2(cursor), duration });
    cursor += duration;
  }

  const totalDurationSeconds = round2(cursor);
  return {
    ...loaded,
    beats,
    totalDurationSeconds,
    totalDurationFrames: Math.round(totalDurationSeconds * FPS),
    narrationIntervals: buildNarrationIntervals(beats),
  };
}

// ---- helpers ----------------------------------------------------------

function assertShape(spec: VideoSpec): void {
  if (spec?.schema_version !== 'video/v1') {
    throw new VideoSpecError(`expected schema_version "video/v1", got "${spec?.schema_version}"`);
  }
  if (spec.format !== 'animated-explainer') {
    throw new VideoSpecError(`this renderer only supports format "animated-explainer", got "${spec.format}"`);
  }
  if (!Array.isArray(spec.beats) || spec.beats.length === 0) {
    throw new VideoSpecError('video_spec has no beats');
  }
  const ids = new Set<string>();
  for (const b of spec.beats) {
    if (ids.has(b.id)) throw new VideoSpecError(`duplicate beat id "${b.id}"`);
    ids.add(b.id);
    if (!b.visual || typeof b.visual.kind !== 'string') {
      throw new VideoSpecError(`beat "${b.id}" has no visual.kind`);
    }
  }
  // every investigation_segment points at a real container
  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation_segment' && !ids.has(b.visual.of_container)) {
      throw new VideoSpecError(
        `investigation_segment "${b.id}" of_container "${b.visual.of_container}" is not a beat`,
      );
    }
  }
}

function provisionalWindow(targetSec: number): number {
  // pre-synthesis: trust the estimate, but never below a floor
  return Math.max(targetSec, 3) + TAIL_BUFFER_SECONDS;
}

function provisionalInvestigationWindow(
  container: SpecBeat,
  segments: RendererInvestigationSegment[],
): number {
  if (segments.length === 0) return Math.max(container.target_duration_sec, 5);
  const lastT = segments[segments.length - 1]!.t;
  return Math.max(container.target_duration_sec, lastT + 6);
}

function mapKeyframe(k: SpecInvestigationKeyframe): RendererInvestigationKeyframe {
  return {
    t: k.t,
    traffic: k.traffic,
    podCount: k.pod_count,
    gpuPct: k.gpu_pct,
    queueDepth: k.queue_depth,
    nodes: k.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      fillPercent: n.fill_percent,
      full: n.full,
      incoming: n.incoming,
    })),
    pendingPods: k.pending_pods,
    resolvedPods: k.resolved_pods,
    trafficColor: k.traffic_color ?? undefined,
    gpuColor: k.gpu_color ?? undefined,
  };
}

function mapVisualToBeat(
  b: SpecBeat,
  start: number,
  duration: number,
  audioFile: string | undefined,
): RendererBeat {
  const v = b.visual;
  switch (v.kind) {
    case 'title':
      return { type: 'title', start, duration, title: v.title, subtitle: v.subtitle, audioFile };
    case 'statement':
      return {
        type: 'statement',
        start,
        duration,
        caption: b.narration,
        eyebrow: v.eyebrow,
        eyebrowColor: v.eyebrow_color,
        statement: v.statement,
        support: v.support,
        audioFile,
      };
    case 'optionsCompare':
      return {
        type: 'optionsCompare',
        start,
        duration,
        caption: b.narration,
        options: v.options.map((o) => ({
          name: o.name,
          solves: o.solves,
          doesNotSolve: o.does_not_solve,
          favored: o.favored,
        })),
        audioFile,
      };
    case 'architecture':
      return {
        type: 'architecture',
        start,
        duration,
        caption: b.narration,
        nodes: v.nodes.map((n) => ({
          kind: n.node_kind,
          label: n.label,
          sublabel: n.sublabel ?? undefined,
          x: n.x,
          y: n.y,
        })),
        edges: v.edges.map((e) => ({ fromIndex: e.from_index, toIndex: e.to_index, flowing: e.flowing })),
        highlightIndex: v.highlight_index ?? undefined,
        audioFile,
      };
    case 'dashboard':
      return {
        type: 'dashboard',
        start,
        duration,
        caption: b.narration,
        serviceName: v.service_name,
        alert: v.alert,
        panels: v.panels,
        focusPanelIndex: v.focus_panel_index ?? undefined,
        audioFile,
      };
    case 'terminal':
      return {
        type: 'terminal',
        start,
        duration,
        caption: b.narration,
        lines: v.lines.filter((l): l is { kind: 'prompt' | 'output'; text: string } =>
          l.kind === 'prompt' || l.kind === 'output',
        ),
        focusLineIndex: v.focus_line_index ?? undefined,
        audioFile,
      };
    case 'editor':
      return {
        type: 'editor',
        start,
        duration,
        caption: b.narration,
        filename: v.filename,
        lines: v.lines.filter(
          (l): l is { kind: 'existing' | 'added' | 'comment' | 'placeholder'; text: string } =>
            l.kind === 'existing' || l.kind === 'added' || l.kind === 'comment' || l.kind === 'placeholder',
        ),
        focusLineIndex: v.focus_line_index ?? undefined,
        audioFile,
      };
    case 'recap':
      return { type: 'recap', start, duration, caption: b.narration, items: v.items, audioFile };
    case 'investigation':
    case 'investigation_segment':
      throw new VideoSpecError(`mapVisualToBeat should not be called for "${v.kind}"`);
  }
}

function buildNarrationIntervals(
  beats: RendererBeat[],
): { startSeconds: number; endSeconds: number }[] {
  const intervals: { startSeconds: number; endSeconds: number }[] = [];
  for (const beat of beats) {
    if (beat.type === 'investigation') {
      for (let i = 0; i < beat.segments.length; i++) {
        const seg = beat.segments[i]!;
        const nextT = beat.segments[i + 1]?.t ?? beat.duration;
        intervals.push({ startSeconds: beat.start + seg.t, endSeconds: beat.start + nextT });
      }
    } else if ('audioFile' in beat && beat.audioFile) {
      intervals.push({ startSeconds: beat.start, endSeconds: beat.start + beat.duration });
    }
  }
  return intervals;
}

function slug(id: string): string {
  return id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
