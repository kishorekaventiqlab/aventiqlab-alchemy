import React from 'react';
import { theme } from './theme';

export const LineChart: React.FC<{
  points: number[];
  color: string;
  progress: number; // 0-1, how much of the line is drawn
  width: number;
  height: number;
  flat?: boolean;
}> = ({ points, color, progress, width, height, flat }) => {
  const pad = 8;
  // Auto-scale to the panel's own data range (with headroom) rather than assuming
  // every metric is a 0-100 percentage - p99 latency (ms) and queue depth (req
  // count) need their own scale, not the same axis as a utilization percentage.
  const dataMax = Math.max(...points);
  const dataMin = Math.min(...points);
  const range = dataMax - dataMin;
  const max = flat ? dataMax + Math.max(range, dataMax * 0.1, 1) : dataMax * 1.12;
  const min = flat ? Math.max(0, dataMin - Math.max(range, dataMin * 0.1, 1)) : 0;
  const stepX = (width - pad * 2) / (points.length - 1);

  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((p - min) / (max - min)) * (height - pad * 2);
    return [x, y] as const;
  });

  const pathD = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

  // Approximate path length for the dash-draw animation.
  let length = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x0, y0] = coords[i - 1];
    const [x1, y1] = coords[i];
    length += Math.hypot(x1 - x0, y1 - y0);
  }

  const visibleLength = length * Math.min(1, Math.max(0, progress));
  const cursorIndex = Math.min(
    points.length - 1,
    Math.floor(progress * (points.length - 1))
  );
  const cursor = coords[cursorIndex];

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path
        d={pathD}
        fill="none"
        stroke={theme.panelBorder}
        strokeWidth={2}
        opacity={0.35}
      />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={length}
        strokeDashoffset={length - visibleLength}
      />
      {progress > 0.02 && (
        <circle cx={cursor[0]} cy={cursor[1]} r={5} fill={color} />
      )}
    </svg>
  );
};
