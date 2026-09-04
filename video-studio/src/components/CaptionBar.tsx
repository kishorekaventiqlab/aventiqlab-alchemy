import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

// video/v1 path: splits narration into sentence-ish chunks so a long caption
// paragraph is readable on screen a few words at a time, cycling across the
// beat's duration. Kept exactly as-is for v1's frozen contract — v1 has no
// short "on-screen key idea" field, only the full narration string, so this
// is the least-bad rendering of that for a v1 spec. NOT used by v2 call
// sites (see splitForDisplay below), since v2 has a real short-caption field
// and should never fall back to chunking a whole paragraph.
function chunkSentences(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];
  return sentences.map((s) => s.trim()).filter(Boolean);
}

// v2 path (and v1's own hard-truncation fallback, if a caller ever passes
// a caption longer than the density budget): split on word boundaries into
// chunks no longer than maxChars, never splitting mid-word. Unlike
// chunkSentences, this guarantees every displayed chunk is short enough to
// read at a glance on a phone screen, regardless of how the source text is
// punctuated.
function splitForDisplay(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export const CaptionBar: React.FC<{
  text: string;
  durationInFrames: number;
  /** v2 call sites: true to use word-boundary short-chunk splitting (density.maxCaptionChars) instead of v1's sentence chunker. */
  shortCaption?: boolean;
}> = ({ text, durationInFrames, shortCaption = false }) => {
  const frame = useCurrentFrame();
  const chunks = shortCaption
    ? splitForDisplay(text, theme.density.maxCaptionChars)
    : chunkSentences(text);
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
        left: theme.spacing.safeMarginX * 0.6,
        right: theme.spacing.safeMarginX * 0.6,
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
          fontSize: theme.fontSize.captionKeyIdea,
          fontWeight: 600,
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
