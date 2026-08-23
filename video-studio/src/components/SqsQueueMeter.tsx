import React from 'react';
import { theme } from './theme';

/**
 * A queue-depth visual: a row of fill blocks (like a stack of pending
 * messages) plus a live-counting number. Unlike CapacityMeter (a single
 * percentage bar), this reads as discrete units piling up/draining so a
 * "queue depth spiking" narration beat has something concrete to point at.
 * Takes an already-tweened `depth` (see useTweenedTimeline) rather than
 * animating internally, so it stays in lockstep with the rest of the scene.
 */
export const SqsQueueMeter: React.FC<{
  x: number;
  y: number;
  depth: number;
  maxDepth?: number;
  width?: number;
  danger?: boolean;
}> = ({ x, y, depth, maxDepth = 50, width = 320, danger = false }) => {
  const blockCount = 14;
  const filledBlocks = Math.round((Math.min(depth, maxDepth) / maxDepth) * blockCount);
  const color = danger ? theme.danger : depth > maxDepth * 0.4 ? theme.warning : theme.accent;

  return (
    <div style={{ position: 'absolute', left: x - width / 2, top: y, width, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: theme.fontFamily,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>
          SQS Queue
        </span>
        <span style={{ fontFamily: theme.monoFontFamily, fontSize: 26, fontWeight: 700, color }}>
          {Math.round(depth)} <span style={{ fontSize: 14, fontWeight: 600, color: theme.textDim }}>msgs</span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: blockCount }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 22,
              borderRadius: 3,
              background: i < filledBlocks ? color : theme.panelBorder,
              opacity: i < filledBlocks ? 1 : 0.5,
              transition: 'none',
            }}
          />
        ))}
      </div>
    </div>
  );
};
