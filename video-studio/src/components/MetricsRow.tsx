import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

const colorFor = (name: string | undefined) => {
  if (name === 'danger') return theme.danger;
  if (name === 'warning') return theme.warning;
  if (name === 'success') return theme.success;
  if (name === 'accent') return theme.accentStrong;
  return theme.text;
};

// A single metric tile whose numeric value is already tweened by the caller
// (see useTweenedTimeline) — this component only renders the current number,
// it does not own the animation. `display` formats the live number (e.g.
// adding "req/s" or rounding), so non-numeric metrics (a plain "rising" /
// "recovering" label) can still pass a static string through untouched.
export type LiveMetric = { label: string; value: number | string; format?: (v: number) => string; color?: string };

export const MetricsRow: React.FC<{
  metrics: LiveMetric[];
  appearFrame?: number;
}> = ({ metrics, appearFrame = 0 }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [appearFrame, appearFrame + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{ position: 'absolute', top: 60, left: 60, right: 60, display: 'flex', gap: 16, opacity }}>
      {metrics.map((m) => (
        <div key={m.label} style={{ flex: 1, background: theme.panelBg, border: `1px solid ${theme.panelBorder}`, borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 2px 8px rgba(16, 24, 40, 0.06)' }}>
          <div style={{ fontFamily: theme.fontFamily, fontSize: 13, fontWeight: 600, color: theme.textDim, textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
          <div style={{ fontFamily: theme.monoFontFamily, fontSize: 24, fontWeight: 700, color: colorFor(m.color) }}>
            {typeof m.value === 'number' ? (m.format ? m.format(m.value) : Math.round(m.value)) : m.value}
          </div>
        </div>
      ))}
    </div>
  );
};
