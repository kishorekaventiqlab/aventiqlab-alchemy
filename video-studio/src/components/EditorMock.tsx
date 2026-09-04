import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { CameraFocus } from './CameraFocus';
import type { EditorLine } from '../data/deployInferenceServiceScript';

// A code-editor mock (distinct from TerminalMock's shell prompt look) for
// beats that show a chart/values file being read or edited, rather than
// commands being run.
export const EditorMock: React.FC<{
  filename: string;
  lines: EditorLine[];
  durationInFrames: number;
  focusLineIndex?: number;
  focusScale?: number;
  focusStartFrame?: number;
  focusHoldFrame?: number;
}> = ({
  filename,
  lines,
  durationInFrames,
  focusLineIndex,
  focusScale = 1.08,
  focusStartFrame = 24,
  focusHoldFrame = 60,
}) => {
  const frame = useCurrentFrame();
  const revealWindow = Math.max(lines.length, durationInFrames * 0.6);
  const perLine = revealWindow / lines.length;

  const tabBarHeight = 44;
  const lineHeight = 21 * 1.6;
  const topOffset = 70 + 20; // container top + padding

  const focal =
    focusLineIndex !== undefined
      ? {
          x: 0.5,
          y: (topOffset + tabBarHeight + focusLineIndex * lineHeight + lineHeight / 2) / 1080,
        }
      : { x: 0.5, y: 0.5 };

  const lineColor = (kind: EditorLine['kind']) => {
    if (kind === 'added') return theme.success;
    if (kind === 'comment') return theme.textDim;
    if (kind === 'placeholder') return theme.warning;
    return theme.terminalText;
  };

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
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(16, 24, 40, 0.18)',
      }}
    >
      <div
        style={{
          height: tabBarHeight,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 20px',
          background: 'rgba(255,255,255,0.04)',
          borderBottom: `1px solid ${theme.terminalBorder}`,
          fontFamily: theme.monoFontFamily,
          fontSize: theme.fontSize.diagramSublabel,
          color: theme.terminalDim,
        }}
      >
        {['#f97066', '#facc15', '#34d399'].map((c) => (
          <div key={c} style={{ width: 11, height: 11, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ marginLeft: 12 }}>{filename}</span>
      </div>
      <div style={{ padding: '20px 28px', fontFamily: theme.monoFontFamily, fontSize: theme.fontSize.code, lineHeight: 1.6 }}>
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
                display: 'flex',
                gap: 16,
                color: lineColor(line.kind),
                background: highlighted ? 'rgba(29, 111, 214, 0.18)' : 'transparent',
                borderRadius: 6,
                padding: highlighted ? '2px 8px' : '2px 0',
                margin: highlighted ? '0 -8px' : 0,
                fontWeight: line.kind === 'placeholder' ? 700 : 400,
              }}
            >
              <span style={{ color: theme.terminalDim, width: 24, textAlign: 'right', userSelect: 'none' }}>
                {i + 1}
              </span>
              <span style={{ whiteSpace: 'pre' }}>{line.text}</span>
            </div>
          );
        })}
      </div>
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
