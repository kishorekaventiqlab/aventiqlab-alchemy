import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ArchitectureNodeV2, type EntityShapeCategory } from './ArchitectureNode';
import { FlowArrow } from './FlowArrow';
import { layoutRow, clampToSafeFrame } from './layoutGrid';
import { deriveRelationships, deriveCreateFrames, type TimelineEvent } from './eventTimeline';

export interface DiagramEntity {
  id: string;
  category: EntityShapeCategory;
  label: string;
  sublabel?: string;
  x?: number;
  y?: number;
  /** Frame at which this entity's entrance animation should start (default 0 = present from the start). */
  appearFrame?: number;
}

export interface DiagramRelationship {
  fromId: string;
  toId: string;
  flowing?: boolean;
  highlighted?: boolean;
  /** Frame at which this relationship's line should start fading in (default 0 = present from the start). */
  appearFrame?: number;
}

/**
 * v2's ArchitectureDiagram — id-referenced (relationships point at entity
 * ids, not array indices), and its data always comes from the real spec via
 * props. Never import a demo/fixture data file here — that's exactly the
 * coupling that made v1's InvestigationScene render Kubernetes visuals
 * regardless of the video's actual topic.
 *
 * `architecture` beats supply entities with fixed x/y (the model places
 * them). `investigation` beats deliberately omit x/y (the schema's own
 * comment: "the investigation renderer lays them out itself") — an entity
 * missing x/y is auto-laid-out here on a single centered row rather than
 * being silently dropped, so every declared entity is actually visible.
 */
export const ArchitectureDiagramV2: React.FC<{
  entities: DiagramEntity[];
  relationships: DiagramRelationship[];
  highlightId?: string;
  top?: number;
  /**
   * OPTIONAL (video/v2 temporal mechanism proposal, Phase B): the same
   * semantic events[] timeline InvestigationSceneV2 uses. When present, the
   * entrance frames + relationships are RE-DERIVED from the timeline (same
   * eventTimeline.ts functions investigation uses) instead of coming
   * directly from `relationships`/a static entrance — the diagram then
   * changes over the beat's duration instead of being fully present from
   * frame 0. When absent (the default), this renders BYTE-IDENTICAL to
   * before this prop existed: no useCurrentFrame-driven derivation runs at
   * all, `entities`/`relationships`/`highlightId` are used exactly as given.
   */
  events?: TimelineEvent[];
}> = ({ entities, relationships, highlightId, top = 0, events }) => {
  const laidOut = autoLayout(entities);

  // The static path (no events): identical to this component's behavior
  // before Phase B. No frame-dependent hook is even called in this branch.
  if (!events || events.length === 0) {
    return (
      <StaticArchitectureDiagram laidOut={laidOut} relationships={relationships} highlightId={highlightId} top={top} />
    );
  }

  return (
    <TimelineArchitectureDiagram
      laidOut={laidOut}
      events={events}
      highlightId={highlightId}
      top={top}
    />
  );
};

const StaticArchitectureDiagram: React.FC<{
  laidOut: LaidOutEntity[];
  relationships: DiagramRelationship[];
  highlightId?: string;
  top: number;
}> = ({ laidOut, relationships, highlightId, top }) => {
  const byId = new Map(laidOut.map((e) => [e.id, e]));
  return (
    <div style={{ position: 'absolute', inset: 0, top }}>
      {relationships.map((rel, i) => {
        const from = byId.get(rel.fromId);
        const to = byId.get(rel.toId);
        if (!from || !to) return null;
        const highlighted = rel.highlighted || (highlightId !== undefined && (rel.fromId === highlightId || rel.toId === highlightId));
        return (
          <FlowArrow
            key={`${rel.fromId}-${rel.toId}-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            flowing={rel.flowing}
            highlighted={highlighted}
            appearFrame={rel.appearFrame ?? 0}
          />
        );
      })}
      {laidOut.map((entity) => (
        <ArchitectureNodeV2
          key={entity.id}
          category={entity.category}
          label={entity.label}
          sublabel={entity.sublabel}
          x={entity.x}
          y={entity.y}
          width={entity.width}
          height={entity.height}
          highlighted={highlightId === entity.id}
          dimmed={highlightId !== undefined && highlightId !== entity.id}
          appearFrame={entity.appearFrame ?? 0}
        />
      ))}
    </div>
  );
};

/**
 * The events-driven path (Phase B): re-derives RELATIONSHIPS from the
 * timeline every frame (same function InvestigationSceneV2 uses — reused,
 * not reimplemented), so a relationship whose connecting event hasn't fired
 * yet is simply not drawn.
 *
 * Deliberately DOES NOT reuse deriveAppearFrames for architecture's own
 * entities the way investigation does. Investigation's entities have no
 * model-given x/y at all — "first referenced by an event" is genuinely when
 * that entity first exists in the scene. Architecture's entities carry
 * model-placed x/y BY DEFINITION (video-schema-v2.ts's own comment: "the
 * model places them") — they ARE the beat's starting topology, meant to be
 * visible from frame 0, with events describing what CHANGES about that
 * already-visible diagram, not which parts of it exist yet. Applying
 * deriveAppearFrames here would make every entity referenced by an event
 * (which is most of them, in practice) pop into existence mid-beat instead
 * of grounding the learner in the starting state before anything happens —
 * exactly the wrong direction for a "context_mental_model" or "decision"
 * beat, whose whole job is showing a state the learner should already
 * recognize. An entity legitimately created mid-beat by its OWN `create`
 * event (rare for architecture, common for investigation) is the one case
 * that should still animate in — handled by only deriving an appearFrame
 * for entities with a `create` event naming them, not every referenced one.
 */
const TimelineArchitectureDiagram: React.FC<{
  laidOut: LaidOutEntity[];
  events: TimelineEvent[];
  highlightId?: string;
  top: number;
}> = ({ laidOut, events, highlightId, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entityIds = new Set(laidOut.map((e) => e.id));
  const createFrames = deriveCreateFrames(events, fps);
  const timedEntities: LaidOutEntity[] = laidOut.map((e) => ({ ...e, appearFrame: createFrames.get(e.id) ?? 0 }));

  const allRelationships = deriveRelationships(events, entityIds, fps);
  // Only draw relationships whose connecting event has already fired — same
  // rule InvestigationSceneV2 applies, so a relationship never "exists"
  // before the event that creates it.
  const relationships = allRelationships.filter((r) => (r.appearFrame ?? 0) <= frame);

  const tSec = frame / fps;
  const fired = events.filter((e) => e.t <= tSec).sort((a, b) => a.t - b.t);
  const activeEvent = fired[fired.length - 1];
  const activeTarget = activeEvent?.target ?? highlightId;

  return (
    <StaticArchitectureDiagram laidOut={timedEntities} relationships={relationships} highlightId={activeTarget} top={top} />
  );
};

type LaidOutEntity = DiagramEntity & { x: number; y: number; width: number; height: number };

/**
 * Entities that already carry x/y (architecture beats, model-placed) are
 * clamped to the safe frame (a real renderer-side backstop — the service's
 * spec-time selfcheck only validates the CENTER point, not the actual
 * rendered bounding box, so a wide node centered near the edge could still
 * overflow before this existed). Entities missing x/y (investigation beats,
 * per the schema's own "the investigation renderer lays them out itself"
 * comment) are auto-laid-out via the shared layoutRow helper — the same
 * math InvestigationScene.tsx (v1) uses, instead of two independent
 * reimplementations, and box size scales down as entity count grows instead
 * of a fixed box regardless of density.
 */
function autoLayout(entities: DiagramEntity[]): LaidOutEntity[] {
  const missingIds = new Set(entities.filter((e) => e.x === undefined || e.y === undefined).map((e) => e.id));
  const autoBoxes = layoutRow(missingIds.size, { top: 300, bottom: 700 });
  let autoIndex = 0;
  return entities.map((e) => {
    if (e.x !== undefined && e.y !== undefined) {
      const clamped = clampToSafeFrame({ x: e.x, y: e.y, width: 220, height: 124 });
      return { ...e, ...clamped };
    }
    const box = autoBoxes[autoIndex]!;
    autoIndex += 1;
    return { ...e, x: box.x, y: box.y, width: box.width, height: box.height };
  });
}
