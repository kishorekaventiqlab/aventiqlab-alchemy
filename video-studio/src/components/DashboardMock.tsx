import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { LineChart } from './LineChart';
import type { DashboardPanel } from '../data/inferenceUnderLoadScript';

export const DashboardMock: React.FC<{
  serviceName: string;
  panels: DashboardPanel[];
  alert?: string;
  durationInFrames: number;
}> = ({ serviceName, panels, alert, durationInFrames }) => {
  const frame = useCurrentFrame();
  const chartProgress = interpolate(
    frame,
    [15, Math.max(16, durationInFrames * 0.6)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const alertOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const panelWidth = 520;
  const panelHeight = 160;
  const chartWidth = panelWidth - 40;
  const chartHeight = 90;

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 60,
        right: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            fontFamily: theme.monoFontFamily,
            fontSize: 20,
            color: theme.textDim,
          }}
        >
          grafana / {serviceName}
        </div>
        {alert && (
          <div
            style={{
              fontFamily: theme.fontFamily,
              fontSize: 18,
              fontWeight: 700,
              color: '#0b1220',
              background: '#f97066',
              padding: '8px 18px',
              borderRadius: 999,
              opacity: alertOpacity,
            }}
          >
            ⚠ {alert}
          </div>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 20,
          flexWrap: 'wrap',
        }}
      >
        {panels.map((panel) => (
          <div
            key={panel.label}
            style={{
              width: panelWidth,
              height: panelHeight,
              background: theme.panelBg,
              border: `1px solid ${theme.panelBorder}`,
              borderRadius: 12,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: theme.fontFamily,
                fontSize: 16,
                color: theme.textDim,
              }}
            >
              <span>{panel.label}</span>
              <span style={{ color: panel.color, fontWeight: 700 }}>
                {panel.points[panel.points.length - 1]}
                {panel.unit}
              </span>
            </div>
            <LineChart
              points={panel.points}
              color={panel.color}
              progress={chartProgress}
              width={chartWidth}
              height={chartHeight}
              flat={panel.flat}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
