import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from './theme';

export const TitleCard: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [0, 20], [24, 0], {
    extrapolateRight: 'clamp',
  });
  // A gentle scale-in on the title itself (a small "camera push-in" on the
  // card as a whole) rather than a static, motionless card.
  const scale = spring({
    frame,
    fps,
    config: { damping: 200, mass: 1, stiffness: 80 },
    durationInFrames: 25,
  });
  const titleScale = 0.96 + 0.04 * scale;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.gap.lg,
        padding: `0 ${theme.spacing.safeMarginX}px`,
        textAlign: 'center',
        background: `radial-gradient(circle at 50% 38%, ${theme.bgGradientStart} 0%, ${theme.bg} 75%)`,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize.kicker,
          letterSpacing: 4,
          color: theme.accentStrong,
          fontWeight: 700,
          opacity,
        }}
      >
        AVENTIQLAB · AI PLATFORM ENGINEERING
      </div>
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize.title,
          fontWeight: 700,
          color: theme.text,
          opacity,
          transform: `translateY(${rise}px) scale(${titleScale})`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: theme.fontSize.subtitle,
          fontWeight: 500,
          color: theme.textDim,
          opacity,
          maxWidth: 1100,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
