/**
 * video/v2 — the `video_spec` -> renderer bridge. Structural mirror of
 * loadVideoSpec.ts (AL4); see that file's header for the general timing
 * model (provisional windows pre-synthesis, retimeBeats() after).
 *
 * The only real difference from v1: `architecture` and `investigation`
 * carry generic entities/relationships/events (id-referenced) instead of
 * v1's K8s-shaped nodes/edges/keyframes. The other 7 visual kinds map
 * through unchanged (same field names, same logic as v1's mapVisualToBeat).
 */

import type {
  VideoSpecV2,
  SpecBeatV2,
  SpecEntity,
  SpecRelationship,
  SpecEvent,
} from './videoSpecTypesV2.js';

export const FPS = 30;
export const LEAD_IN_SECONDS = 0.5;
export const TAIL_BUFFER_SECONDS = 1.0;

// ---- Renderer beat types (mirror of loadVideoSpec.ts's RendererBeat) -----

export type RendererBeatV2 =
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
      entities: RendererEntity[];
      relationships: RendererRelationship[];
      highlightId?: string;
      audioFile?: string;
    }
  | {
      type: 'investigation';
      start: number;
      duration: number;
      entities: RendererEntity[];
      events: RendererEvent[];
      segments: RendererInvestigationSegmentV2[];
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

export interface RendererEntity {
  id: string;
  category: SpecEntity['category'];
  label: string;
  sublabel?: string;
  x?: number;
  y?: number;
}

export interface RendererRelationship {
  fromId: string;
  toId: string;
  flowing?: boolean;
}

export interface RendererEvent {
  t: number;
  type: SpecEvent['type'];
  target?: string;
  from?: string;
  to?: string;
  detail?: string;
}

export interface RendererInvestigationSegmentV2 {
  t: number;
  caption: string;
  audioFile: string;
  highlightId?: string;
}

export interface AudioPlanEntry {
  audioFile: string;
  caption: string;
  beatId: string;
  allocatedSeconds: number;
}

export interface LoadedVideoV2 {
  experienceId: string;
  title: string;
  centralQuestion: string;
  fps: number;
  beats: RendererBeatV2[];
  totalDurationSeconds: number;
  totalDurationFrames: number;
  narrationIntervals: { startSeconds: number; endSeconds: number }[];
  audioPlan: AudioPlanEntry[];
  specHash: string;
}

export class VideoSpecV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoSpecV2Error';
  }
}

// ---- The loader ----------------------------------------------------------

export function loadVideoSpecV2(spec: VideoSpecV2): LoadedVideoV2 {
  assertShape(spec);

  const audioFileForBeat = new Map<string, string>();
  const audioPlan: AudioPlanEntry[] = [];

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

  const beats: RendererBeatV2[] = [];
  let cursor = 0;

  const segmentsByContainer = new Map<string, SpecBeatV2[]>();
  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation_segment') {
      const arr = segmentsByContainer.get(b.visual.of_container) ?? [];
      arr.push(b);
      segmentsByContainer.set(b.visual.of_container, arr);
    }
  }

  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation_segment') continue;

    if (b.visual.kind === 'investigation') {
      const segs = (segmentsByContainer.get(b.id) ?? []).slice();
      const orderT = new Map(b.visual.segments.map((s) => [s.narration_ref, s.t]));
      segs.sort((a, c) => (orderT.get(a.id) ?? 0) - (orderT.get(c.id) ?? 0));

      const rSegments: RendererInvestigationSegmentV2[] = b.visual.segments.map((s) => {
        const segBeat = segs.find((x) => x.id === s.narration_ref);
        if (!segBeat) {
          throw new VideoSpecV2Error(
            `investigation "${b.id}" segment narration_ref "${s.narration_ref}" has no matching segment beat`,
          );
        }
        const audioFile = `${slug(segBeat.id)}.wav`;
        audioFileForBeat.set(segBeat.id, audioFile);
        return {
          t: s.t,
          caption: segBeat.narration,
          audioFile,
          highlightId: s.highlight_id ?? undefined,
        };
      });

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
        entities: b.visual.entities.map(mapEntity),
        events: b.visual.events.map(mapEvent),
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

// ---- Retiming (called after audio synthesis) ------------------------------

export interface MeasuredAudio {
  [audioFile: string]: number;
}

export function retimeBeatsV2(loaded: LoadedVideoV2, measured: MeasuredAudio): LoadedVideoV2 {
  const beats: RendererBeatV2[] = [];
  let cursor = 0;
  for (const beat of loaded.beats) {
    if (beat.type === 'investigation') {
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

function assertShape(spec: VideoSpecV2): void {
  if (spec?.schema_version !== 'video/v2') {
    throw new VideoSpecV2Error(`expected schema_version "video/v2", got "${spec?.schema_version}"`);
  }
  if (spec.format !== 'animated-explainer') {
    throw new VideoSpecV2Error(`this renderer only supports format "animated-explainer", got "${spec.format}"`);
  }
  if (!Array.isArray(spec.beats) || spec.beats.length === 0) {
    throw new VideoSpecV2Error('video_spec has no beats');
  }
  const ids = new Set<string>();
  for (const b of spec.beats) {
    if (ids.has(b.id)) throw new VideoSpecV2Error(`duplicate beat id "${b.id}"`);
    ids.add(b.id);
    if (!b.visual || typeof b.visual.kind !== 'string') {
      throw new VideoSpecV2Error(`beat "${b.id}" has no visual.kind`);
    }
  }
  for (const b of spec.beats) {
    if (b.visual.kind === 'investigation_segment' && !ids.has(b.visual.of_container)) {
      throw new VideoSpecV2Error(
        `investigation_segment "${b.id}" of_container "${b.visual.of_container}" is not a beat`,
      );
    }
  }
}

function provisionalWindow(targetSec: number): number {
  return Math.max(targetSec, 3) + TAIL_BUFFER_SECONDS;
}

function provisionalInvestigationWindow(
  container: SpecBeatV2,
  segments: RendererInvestigationSegmentV2[],
): number {
  if (segments.length === 0) return Math.max(container.target_duration_sec, 5);
  const lastT = segments[segments.length - 1]!.t;
  return Math.max(container.target_duration_sec, lastT + 6);
}

function mapEntity(e: SpecEntity): RendererEntity {
  return {
    id: e.id,
    category: e.category,
    label: e.label,
    sublabel: e.sublabel ?? undefined,
    x: e.x,
    y: e.y,
  };
}

function mapRelationship(r: SpecRelationship): RendererRelationship {
  return { fromId: r.from_id, toId: r.to_id, flowing: r.flowing };
}

function mapEvent(e: SpecEvent): RendererEvent {
  return {
    t: e.t,
    type: e.type,
    target: e.target ?? undefined,
    from: e.from ?? undefined,
    to: e.to ?? undefined,
    detail: e.detail ?? undefined,
  };
}

function mapVisualToBeat(
  b: SpecBeatV2,
  start: number,
  duration: number,
  audioFile: string | undefined,
): RendererBeatV2 {
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
        entities: v.entities.map(mapEntity),
        relationships: v.relationships.map(mapRelationship),
        highlightId: v.highlight_id ?? undefined,
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
      throw new VideoSpecV2Error(`mapVisualToBeat should not be called for "${v.kind}"`);
  }
}

function buildNarrationIntervals(
  beats: RendererBeatV2[],
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
