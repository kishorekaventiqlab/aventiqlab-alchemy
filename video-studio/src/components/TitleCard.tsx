import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

export const TitleCard: React.FC<{ title: string; subtitle: string }> = ({
  title,
  subtitle,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });
  const rise = interpolate(frame, [0, 20], [24, 0], {
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 28,
        padding: '0 140px',
        textAlign: 'center',
        background: `radial-gradient(circle at 50% 40%, #16233f 0%, ${theme.bg} 70%)`,
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 13,
          letterSpacing: 4,
          color: theme.accent,
          fontWeight: 700,
          opacity,
        }}
      >
        AVENTIQLAB · AI PLATFORM ENGINEERING
      </div>
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 56,
          fontWeight: 700,
          color: theme.text,
          opacity,
          transform: `translateY(${rise}px)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 24,
          color: theme.textDim,
          opacity,
          maxWidth: 900,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
