import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { CameraFocus } from './CameraFocus';
import type { TerminalLine } from '../data/inferenceUnderLoadScript';

export const TerminalMock: React.FC<{
  lines: TerminalLine[];
  durationInFrames: number;
  // Optional push-in on a specific line index (e.g. the one line the
  // narration is actually pointing at), matching CameraFocus's contract.
  focusLineIndex?: number;
  focusScale?: number;
  focusStartFrame?: number;
  focusHoldFrame?: number;
}> = ({
  lines,
  durationInFrames,
  focusLineIndex,
  focusScale = 1.08,
  focusStartFrame = 24,
  focusHoldFrame = 60,
}) => {
  const frame = useCurrentFrame();
  // Stagger lines across the first ~70% of the beat so the last line has
  // time to breathe before the caption cycles to its final chunk.
  const revealWindow = Math.max(lines.length, durationInFrames * 0.7);
  const perLine = revealWindow / lines.length;

  const headerHeight = 64; // dot row + margin, used to locate a line's y for the focal point
  const lineHeight = 22 * 1.7;
  const topOffset = 70 + 24; // container top + padding

  const focal =
    focusLineIndex !== undefined
      ? {
          x: 0.5,
          y: (topOffset + headerHeight + focusLineIndex * lineHeight + lineHeight / 2) / 1080,
        }
      : { x: 0.5, y: 0.5 };

  const content = (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: 60,
        right: 60,
        background: theme.terminalBg,
        border: `1px solid ${theme.terminalBorder}`,
        borderRadius: 14,
        padding: '24px 28px',
        fontFamily: theme.monoFontFamily,
        fontSize: 23,
        lineHeight: 1.7,
        boxShadow: '0 10px 30px rgba(16, 24, 40, 0.18)',
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
        const highlighted = focusLineIndex === i;
        return (
          <div
            key={i}
            style={{
              opacity,
              color: line.kind === 'prompt' ? theme.accentStrong : theme.terminalText,
              background: highlighted ? 'rgba(29, 111, 214, 0.18)' : 'transparent',
              borderRadius: 6,
              padding: highlighted ? '2px 8px' : '2px 0',
              margin: highlighted ? '0 -8px' : 0,
              fontWeight: line.kind === 'prompt' ? 600 : 400,
            }}
          >
            {line.kind === 'prompt' ? `$ ${line.text}` : line.text}
          </div>
        );
      })}
    </div>
  );

  if (focusLineIndex === undefined) {
    return content;
  }

  return (
    <CameraFocus
      focalX={focal.x}
      focalY={focal.y}
      targetScale={focusScale}
      startFrame={focusStartFrame}
      holdFrame={focusHoldFrame}
    >
      {content}
    </CameraFocus>
  );
};
