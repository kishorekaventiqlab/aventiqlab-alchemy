import React from 'react';
import { ArchitectureNodeV2, type EntityShapeCategory } from './ArchitectureNode';
import { FlowArrow } from './FlowArrow';

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
          highlighted={highlightId === entity.id}
          dimmed={highlightId !== undefined && highlightId !== entity.id}
          appearFrame={entity.appearFrame ?? 0}
        />
      ))}
    </div>
  );
};

/** Entities that already carry x/y (architecture beats) pass through unchanged; entities missing x/y (investigation beats) are laid out on a single centered row. */
function autoLayout(entities: DiagramEntity[]): Array<DiagramEntity & { x: number; y: number }> {
  const missing = entities.filter((e) => e.x === undefined || e.y === undefined);
  const gap = 260;
  const totalWidth = (missing.length - 1) * gap;
  const startX = 960 - totalWidth / 2;
  const autoY = 460;
  let autoIndex = 0;
  return entities.map((e) => {
    if (e.x !== undefined && e.y !== undefined) return e as DiagramEntity & { x: number; y: number };
    const x = startX + autoIndex * gap;
    autoIndex += 1;
    return { ...e, x, y: autoY };
  });
}
