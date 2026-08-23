import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

/**
 * A labeled fill-bar showing how full a node's (or the cluster's) GPU
 * capacity is — used to make "this node is full" a visual fact rather than
 * something only stated in narration. Fill color shifts from accent to
 * danger as it approaches 100%, matching the same semantic-color pattern
 * DashboardMock/TerminalMock already use.
 */
export const CapacityMeter: React.FC<{
  label: string;
  x: number;
  y: number;
  /** 0-100 */
  fillPercent: number;
  width?: number;
  full?: boolean;
  appearFrame?: number;
}> = ({ label, x, y, fillPercent, width = 180, full = false, appearFrame = 0 }) => {
  const frame = useCurrentFrame();
  if (frame < appearFrame) return null;

  const progress = interpolate(frame, [appearFrame, appearFrame + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const displayedFill = Math.min(100, fillPercent) * progress;
  const barColor = full || fillPercent >= 95 ? theme.danger : fillPercent >= 70 ? theme.warning : theme.accent;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - width / 2,
        top: y,
        width,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: theme.fontFamily,
          fontSize: 13,
          fontWeight: 600,
          color: theme.textDim,
        }}
      >
        <span>{label}</span>
        <span style={{ color: barColor, fontWeight: 700 }}>{full ? 'FULL' : `${Math.round(fillPercent)}%`}</span>
      </div>
      <div
        style={{
          width: '100%',
          height: 10,
          borderRadius: 6,
          background: theme.panelBorder,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${displayedFill}%`,
            height: '100%',
            borderRadius: 6,
            background: barColor,
          }}
        />
      </div>
    </div>
  );
};
