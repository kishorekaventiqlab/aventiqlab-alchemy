import React from 'react';
import { ArchitectureNodeV2, type EntityShapeCategory } from './ArchitectureNode';
import { FlowArrow } from './FlowArrow';
import { layoutRow, clampToSafeFrame } from './layoutGrid';

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
}> = ({ entities, relationships, highlightId, top = 0 }) => {
  const laidOut = autoLayout(entities);
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
