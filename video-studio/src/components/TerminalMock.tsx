import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import type { TerminalLine } from '../data/inferenceUnderLoadScript';

const REVEAL_FRAMES_PER_LINE = 14;

export const TerminalMock: React.FC<{
  lines: TerminalLine[];
  durationInFrames: number;
}> = ({ lines, durationInFrames }) => {
  const frame = useCurrentFrame();
  // Stagger lines across the first ~70% of the beat so the last line has
  // time to breathe before the caption cycles to its final chunk.
  const revealWindow = Math.max(lines.length, durationInFrames * 0.7);
  const perLine = revealWindow / lines.length;

  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 60,
        right: 60,
        background: '#0a0f1c',
        border: `1px solid ${theme.panelBorder}`,
        borderRadius: 12,
        padding: '24px 28px',
        fontFamily: theme.monoFontFamily,
        fontSize: 22,
        lineHeight: 1.7,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {['#f97066', '#facc15', '#34d399'].map((c) => (
          <div
            key={c}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: c,
            }}
          />
        ))}
      </div>
      {lines.map((line, i) => {
        const lineStart = i * perLine;
        const opacity = interpolate(frame, [lineStart, lineStart + 8], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div key={i} style={{ opacity, color: line.kind === 'prompt' ? '#60a5fa' : theme.textDim }}>
            {line.kind === 'prompt' ? `$ ${line.text}` : line.text}
          </div>
        );
      })}
    </div>
  );
};
