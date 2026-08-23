import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { LineChart } from './LineChart';
import { CameraFocus } from './CameraFocus';
import type { DashboardPanel } from '../data/inferenceUnderLoadScript';

export const DashboardMock: React.FC<{
  serviceName: string;
  panels: DashboardPanel[];
  alert?: string;
  durationInFrames: number;
  // Optional camera push-in onto one panel by index, e.g. to match a script
  // beat like "Dashboard zooms into the GPU utilization panel." Omit for a
  // flat, non-zoomed dashboard shot.
  focusPanelIndex?: number;
  focusScale?: number;
  focusStartFrame?: number;
  focusHoldFrame?: number;
}> = ({
  serviceName,
  panels,
  alert,
  durationInFrames,
  focusPanelIndex,
  focusScale = 1.22,
  focusStartFrame = 20,
  focusHoldFrame = 55,
}) => {
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
  const panelHeight = 170;
  const chartWidth = panelWidth - 40;
  const chartHeight = 96;
  const panelGap = 20;

  // Focal point (as a 0-1 fraction of the full frame) of the target panel's
  // center, so CameraFocus can push in on exactly that panel regardless of
  // its position in the row.
  const focal =
    focusPanelIndex !== undefined
      ? {
          x: (60 + focusPanelIndex * (panelWidth + panelGap) + panelWidth / 2) / 1920,
          y: (60 + 56 + panelHeight / 2) / 1080,
        }
      : { x: 0.5, y: 0.5 };

  const content = (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 60,
        right: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
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
            fontSize: 22,
            color: theme.textDim,
            fontWeight: 600,
          }}
        >
          grafana / {serviceName}
        </div>
        {alert && (
          <div
            style={{
              fontFamily: theme.fontFamily,
              fontSize: 19,
              fontWeight: 700,
              color: '#ffffff',
              background: theme.danger,
              padding: '9px 20px',
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
          gap: panelGap,
          flexWrap: 'wrap',
        }}
      >
        {panels.map((panel, i) => (
          <div
            key={panel.label}
            style={{
              width: panelWidth,
              height: panelHeight,
              background: theme.panelBg,
              border: `1px solid ${
                focusPanelIndex === i ? theme.accent : theme.panelBorder
              }`,
              boxShadow:
                focusPanelIndex === i
                  ? '0 8px 24px rgba(29, 111, 214, 0.18)'
                  : '0 2px 8px rgba(16, 24, 40, 0.06)',
              borderRadius: 14,
              padding: 22,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: theme.fontFamily,
                fontSize: 19,
                color: theme.textDim,
                fontWeight: 600,
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

  if (focusPanelIndex === undefined) {
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
