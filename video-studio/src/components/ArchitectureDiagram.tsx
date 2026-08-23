import React from 'react';
import { ArchitectureNode } from './ArchitectureNode';
import { FlowArrow } from './FlowArrow';
import type { ArchEdgeSpec, ArchNodeSpec } from '../data/inferenceUnderLoadScript';

/**
 * Renders a fixed layout of ArchitectureNodes connected by FlowArrows, with
 * one optional highlighted node — the shared visual for Act 1 (introducing
 * the system) and the top half of Act 2/3's metrics beats (showing the same
 * architecture while traffic/pod numbers change beneath it).
 */
export const ArchitectureDiagram: React.FC<{
  nodes: ArchNodeSpec[];
  edges: ArchEdgeSpec[];
  highlightIndex?: number;
  top?: number;
}> = ({ nodes, edges, highlightIndex, top = 0 }) => {
  return (
    <div style={{ position: 'absolute', inset: 0, top }}>
      {edges.map((edge, i) => {
        const from = nodes[edge.fromIndex];
        const to = nodes[edge.toIndex];
        if (!from || !to) return null;
        const highlighted = highlightIndex !== undefined && (edge.fromIndex === highlightIndex || edge.toIndex === highlightIndex);
        return (
          <FlowArrow
            key={i}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            flowing={edge.flowing}
            highlighted={highlighted}
          />
        );
      })}
      {nodes.map((node, i) => (
        <ArchitectureNode
          key={node.label}
          kind={node.kind}
          label={node.label}
          sublabel={node.sublabel}
          x={node.x}
          y={node.y}
          highlighted={highlightIndex === i}
          dimmed={highlightIndex !== undefined && highlightIndex !== i}
          appearFrame={0}
        />
      ))}
    </div>
  );
};
