import type { DiagramEntity, DiagramRelationship } from './ArchitectureDiagramV2';
import type { EntityShapeCategory } from './ArchitectureNode';

/**
 * The shared events[]-driven timeline logic: deriving which entities are
 * connected (and since when) and when each entity first appears, purely from
 * a semantic events[] array rather than a separately-declared static list.
 *
 * Originally investigation-only (InvestigationSceneV2.tsx); moved here so
 * ArchitectureDiagramV2 can drive the SAME timeline math off an optional
 * events[] on an `architecture` beat — reusing the exact functions rather
 * than a second implementation (video/v2 temporal mechanism proposal, Phase B).
 */

export interface TimelineEntity {
  id: string;
  category: EntityShapeCategory;
  label: string;
  sublabel?: string;
  x?: number;
  y?: number;
}

export interface TimelineEvent {
  t: number;
  type:
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
  target?: string;
  from?: string;
  to?: string;
  detail?: string;
}

/**
 * Which pairs of entities are "connected" and since when, derived from the
 * events themselves rather than requiring the model to also declare a
 * separate static relationships array. A `connect`/`send`/`receive`/
 * `evaluate` event whose `target` and `to` both resolve to real entity ids
 * is treated as "these two entities are linked, starting at this event's
 * time" — the edge fades in at that event's frame (FlowArrow's own
 * appearFrame animation) and animates a traveling dot (`flowing: true`)
 * for `send`/`receive`/`connect`/`evaluate`, the event types that represent
 * something actually moving or being checked between two entities. A later
 * `disconnect` event for the same pair removes the edge again.
 */
export function deriveRelationships(events: TimelineEvent[], entityIds: Set<string>, fps: number): DiagramRelationship[] {
  const FLOWING_TYPES = new Set<TimelineEvent['type']>(['connect', 'send', 'receive', 'evaluate']);
  const byPair = new Map<string, DiagramRelationship>();
  const sorted = [...events].sort((a, b) => a.t - b.t);
  for (const e of sorted) {
    if (!e.target || !e.to || !entityIds.has(e.target) || !entityIds.has(e.to)) continue;
    const key = [e.target, e.to].sort().join('::');
    if (e.type === 'disconnect') {
      byPair.delete(key);
      continue;
    }
    if (!FLOWING_TYPES.has(e.type) && e.type !== 'move') continue;
    byPair.set(key, {
      fromId: e.target,
      toId: e.to,
      flowing: FLOWING_TYPES.has(e.type),
      highlighted: true,
      appearFrame: Math.round(e.t * fps),
    });
  }
  return [...byPair.values()];
}

/** Each entity's entrance frame = the earliest event that references it (as target, from, or to); an entity never referenced by an event is present from the start. */
export function deriveAppearFrames(entities: TimelineEntity[], events: TimelineEvent[], fps: number): Map<string, number> {
  const earliest = new Map<string, number>();
  for (const e of events) {
    for (const id of [e.target, e.from, e.to]) {
      if (!id) continue;
      const existing = earliest.get(id);
      if (existing === undefined || e.t < existing) earliest.set(id, e.t);
    }
  }
  const frames = new Map<string, number>();
  for (const entity of entities) {
    const t = earliest.get(entity.id);
    frames.set(entity.id, t !== undefined ? Math.round(t * fps) : 0);
  }
  return frames;
}

/**
 * Only entities with an explicit `create` event animate in mid-beat — every
 * other entity is treated as present from frame 0. Deliberately NOT the same
 * semantics as deriveAppearFrames (which treats ANY reference, not just
 * `create`, as the entity's first existence) — that fits investigation's
 * auto-laid-out entities (which have no starting diagram at all), but not
 * architecture's model-placed entities, which ARE a beat's starting
 * topology by definition and should stay visible from frame 0 unless an
 * event explicitly introduces a new one mid-beat.
 */
export function deriveCreateFrames(events: TimelineEvent[], fps: number): Map<string, number> {
  const frames = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'create' || !e.target) continue;
    const existing = frames.get(e.target);
    if (existing === undefined || e.t < existing) frames.set(e.target, Math.round(e.t * fps));
  }
  return frames;
}

export interface TimelineCameraKeyframe {
  t: number;
  focal_x: number;
  focal_y: number;
  scale: number;
}

export interface CameraFrameValues {
  focalX: number;
  focalY: number;
  scale: number;
}

/**
 * Linear interpolation of focalX/focalY/scale between the two keyframes
 * bracketing `tSec` (video/v2 temporal mechanism proposal, Phase A). Holds
 * the first keyframe's values before it, and the last keyframe's values
 * after it — never extrapolates past the authored range. Empty/undefined
 * keyframes fall back to a static, centered, unscaled frame (CameraFrame's
 * own no-op values), matching every beat's rendering today.
 */
export function deriveCameraFrame(keyframes: TimelineCameraKeyframe[] | undefined, tSec: number): CameraFrameValues {
  if (!keyframes || keyframes.length === 0) {
    return { focalX: 0.5, focalY: 0.5, scale: 1 };
  }
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);
  if (tSec <= sorted[0]!.t) {
    return { focalX: sorted[0]!.focal_x, focalY: sorted[0]!.focal_y, scale: sorted[0]!.scale };
  }
  const last = sorted[sorted.length - 1]!;
  if (tSec >= last.t) {
    return { focalX: last.focal_x, focalY: last.focal_y, scale: last.scale };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (tSec >= a.t && tSec <= b.t) {
      const span = b.t - a.t;
      const ratio = span > 0 ? (tSec - a.t) / span : 0;
      return {
        focalX: a.focal_x + (b.focal_x - a.focal_x) * ratio,
        focalY: a.focal_y + (b.focal_y - a.focal_y) * ratio,
        scale: a.scale + (b.scale - a.scale) * ratio,
      };
    }
  }
  return { focalX: last.focal_x, focalY: last.focal_y, scale: last.scale };
}
