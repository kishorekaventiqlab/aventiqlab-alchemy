import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

/**
 * A straight connector between two points, with an optional traveling dot
 * to represent traffic/data flow along the connection — simplified from
 * animation_poc's Arrow.tsx (that version supports bent/multi-segment
 * paths; ours only needs straight connections between ArchitectureNodes).
 */
export const FlowArrow: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  flowing?: boolean;
  highlighted?: boolean;
  appearFrame?: number;
}> = ({ x1, y1, x2, y2, flowing = false, highlighted = false, appearFrame = 0 }) => {
  const frame = useCurrentFrame();
  if (frame < appearFrame) return null;

  const opacity = interpolate(frame, [appearFrame, appearFrame + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const color = highlighted ? theme.accent : theme.panelBorder;

  // Loop the dot's travel every 45 frames (1.5s at 30fps) for a steady,
  // readable "traffic is flowing" cue rather than a one-shot animation.
  const loopFrame = flowing ? ((frame - appearFrame) % 45) / 45 : 0;
  const dotX = x1 + dx * loopFrame;
  const dotY = y1 + dy * loopFrame;

  return (
    <svg
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      width={1}
      height={1}
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={highlighted ? 2.5 : 1.5}
        opacity={opacity * (highlighted ? 0.9 : 0.5)}
      />
      {flowing && length > 0 && (
        <circle cx={dotX} cy={dotY} r={5} fill={theme.accent} opacity={opacity} />
      )}
    </svg>
  );
};
