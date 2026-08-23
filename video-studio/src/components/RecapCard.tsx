import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

export const RecapCard: React.FC<{ items: string[]; durationInFrames: number }> = ({
  items,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const perItem = (durationInFrames * 0.8) / items.length;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 22,
        padding: '0 140px',
      }}
    >
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 17,
          letterSpacing: 3,
          color: theme.accentStrong,
          fontWeight: 700,
        }}
      >
        TAKE THIS WITH YOU
      </div>
      {items.map((item, i) => {
        const start = i * perItem;
        const opacity = interpolate(frame, [start, start + 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const x = interpolate(frame, [start, start + 10], [-20, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={item}
            style={{
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              opacity,
              transform: `translateX(${x}px)`,
              fontFamily: theme.fontFamily,
              fontSize: 29,
              fontWeight: 500,
              color: theme.text,
            }}
          >
            <span style={{ color: theme.accentStrong, fontWeight: 700 }}>{i + 1}.</span>
            <span>{item}</span>
          </div>
        );
      })}
    </div>
  );
};
