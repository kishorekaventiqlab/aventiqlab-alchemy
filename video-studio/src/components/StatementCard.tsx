import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from './theme';

/**
 * A single bold statement with an eyebrow label and an optional supporting
 * line - the generic visual for any beat whose whole job is landing one
 * sentence (Problem, Stakes, Curiosity, Decision, Best Practice per the
 * Video Artifact Constitution's reasoning spine). Deliberately topic-blind:
 * the eyebrow/statement/support text is the only thing that changes between
 * a "Problem" beat and a "Best Practice" beat - the visual grammar is the
 * same because the underlying need (make one sentence land) is the same.
 */
export const StatementCard: React.FC<{
  eyebrow: string;
  eyebrowColor?: 'accent' | 'danger' | 'warning' | 'success';
  statement: string;
  support?: string;
  durationInFrames: number;
}> = ({ eyebrow, eyebrowColor = 'accent', statement, support }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: { damping: 200, mass: 1, stiffness: 90 },
    durationInFrames: 25,
  });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const rise = interpolate(frame, [0, 20], [20, 0], { extrapolateRight: 'clamp' });
  const scale = 0.97 + 0.03 * entrance;

  const colorMap = {
    accent: theme.accentStrong,
    danger: theme.danger,
    warning: theme.warning,
    success: theme.success,
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        padding: '0 160px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 15,
          letterSpacing: 3,
          textTransform: 'uppercase',
          fontWeight: 700,
          color: colorMap[eyebrowColor],
          opacity,
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 44,
          fontWeight: 700,
          lineHeight: 1.25,
          color: theme.text,
          opacity,
          transform: `translateY(${rise}px) scale(${scale})`,
        }}
      >
        {statement}
      </div>
      {support && (
        <div
          style={{
            fontFamily: theme.fontFamily,
            fontSize: 22,
            fontWeight: 500,
            color: theme.textDim,
            opacity,
            maxWidth: 820,
          }}
        >
          {support}
        </div>
      )}
    </div>
  );
};
