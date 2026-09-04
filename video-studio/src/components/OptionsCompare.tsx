import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

export type CompareOption = {
  name: string;
  solves: string;
  doesNotSolve?: string;
  /** The option the video ultimately favors gets a highlighted column - never more than one, since favoring everything favors nothing. */
  favored?: boolean;
};

/**
 * A 2-3 column comparison of named options, each showing what it solves and
 * what it does not - the generic visual for the constitution's Options and
 * Trade-offs stages. Deliberately generic: columns are driven entirely by
 * props, so a future RAG video comparing embedding models reuses this exact
 * component with different option names, never a new one.
 */
export const OptionsCompare: React.FC<{
  options: CompareOption[];
  appearFrame?: number;
}> = ({ options, appearFrame = 0 }) => {
  const frame = useCurrentFrame();
  const gap = theme.spacing.gap.lg;
  // Column width scales with how many options there are, up to the safe
  // content width, so 1-2 options get a genuinely large card instead of the
  // same fixed width regardless of density (the "too small on fewer options"
  // gap the mobile-readability review flagged).
  const safeWidth = 1920 - theme.spacing.safeMarginX * 2;
  const columnWidth = Math.min(560, (safeWidth - gap * (options.length - 1)) / options.length);
  const totalWidth = options.length * columnWidth + (options.length - 1) * gap;
  const startX = 960 - totalWidth / 2 + columnWidth / 2;

  return (
    <div style={{ position: 'absolute', inset: 0, top: 140 }}>
      {options.map((opt, i) => {
        const colStart = appearFrame + i * 8;
        const opacity = interpolate(frame, [colStart, colStart + 15], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const rise = interpolate(frame, [colStart, colStart + 15], [16, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const x = startX + i * (columnWidth + gap);

        return (
          <div
            key={opt.name}
            style={{
              position: 'absolute',
              left: x - columnWidth / 2,
              top: 0,
              width: columnWidth,
              opacity,
              transform: `translateY(${rise}px)`,
              background: theme.panelBg,
              border: `2px solid ${opt.favored ? theme.accent : theme.panelBorder}`,
              borderRadius: 16,
              padding: 26,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              boxShadow: opt.favored
                ? '0 8px 24px rgba(29, 111, 214, 0.18)'
                : '0 2px 8px rgba(16, 24, 40, 0.06)',
            }}
          >
            <div
              style={{
                fontFamily: theme.fontFamily,
                fontSize: theme.fontSize.cardHeading,
                fontWeight: 700,
                color: opt.favored ? theme.accentStrong : theme.text,
              }}
            >
              {opt.name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                style={{
                  fontFamily: theme.fontFamily,
                  fontSize: theme.fontSize.kicker - 8,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: theme.success,
                }}
              >
                Solves
              </div>
              <div style={{ fontFamily: theme.fontFamily, fontSize: theme.fontSize.cardBody, color: theme.text, lineHeight: 1.4 }}>
                {opt.solves}
              </div>
            </div>
            {opt.doesNotSolve && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  style={{
                    fontFamily: theme.fontFamily,
                    fontSize: theme.fontSize.kicker - 8,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    textTransform: 'uppercase',
                    color: theme.danger,
                  }}
                >
                  Does not solve
                </div>
                <div style={{ fontFamily: theme.fontFamily, fontSize: theme.fontSize.cardBody, color: theme.textDim, lineHeight: 1.4 }}>
                  {opt.doesNotSolve}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
