import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

/**
 * A pod that cannot yet be scheduled — dashed ghost outline, no running
 * indicator, subtle pulsing opacity to read as "waiting" rather than
 * "healthy" or "under pressure". Adapted from animation_poc's PendingPod.tsx
 * for the light theme.
 */
export const PendingPod: React.FC<{
  label: string;
  x: number;
  y: number;
  appearFrame?: number;
  size?: number;
}> = ({ label, x, y, appearFrame = 0, size = 84 }) => {
  const frame = useCurrentFrame();

  if (frame < appearFrame) return null;

  const entrance = interpolate(frame, [appearFrame, appearFrame + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulse = 0.6 + Math.sin((frame - appearFrame) / 8) * 0.15;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 14,
        background: 'transparent',
        border: `2px dashed ${theme.warning}`,
        opacity: entrance * pulse,
        transform: `scale(${interpolate(entrance, [0, 1], [0.7, 1])})`,
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          border: `2px solid ${theme.warning}`,
        }}
      />
      <div
        style={{
          fontFamily: theme.monoFontFamily,
          fontSize: 13,
          fontWeight: 700,
          color: theme.warning,
        }}
      >
        {label}
      </div>
    </div>
  );
};
