import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

// Splits narration into sentence-ish chunks so a long caption paragraph is
// readable on screen a few words at a time, cycling across the beat's duration.
function chunkSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];
  return sentences.map((s) => s.trim()).filter(Boolean);
}

export const CaptionBar: React.FC<{
  text: string;
  durationInFrames: number;
}> = ({ text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const chunks = chunkSentences(text);
  const perChunk = durationInFrames / chunks.length;
  const chunkIndex = Math.min(chunks.length - 1, Math.floor(frame / perChunk));
  const localFrame = frame - chunkIndex * perChunk;

  const opacity = interpolate(
    localFrame,
    [0, 8, Math.max(9, perChunk - 10), perChunk],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 60,
        right: 60,
        bottom: 48,
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: theme.captionBg,
          border: `1px solid ${theme.captionBorder}`,
          borderRadius: 12,
          padding: '20px 26px',
          fontFamily: theme.fontFamily,
          fontSize: 32,
          fontWeight: 500,
          lineHeight: 1.4,
          color: theme.text,
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(16, 24, 40, 0.10)',
          opacity,
        }}
      >
        {chunks[chunkIndex]}
      </div>
    </div>
  );
};
