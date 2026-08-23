import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { theme } from './theme';

export type ArchitectureNodeKind =
  | 'users'
  | 'alb'
  | 'service'
  | 'pod'
  | 'gpu'
  | 'keda'
  | 'scheduler'
  | 'karpenter'
  | 'node';

const ICONS: Record<ArchitectureNodeKind, (color: string) => React.ReactNode> = {
  users: (color) => (
    <svg width={26} height={22} viewBox="0 0 34 28" fill="none">
      <circle cx={10} cy={8} r={5} fill={color} opacity={0.9} />
      <path d="M2 26 C2 18 6 15 10 15 C14 15 18 18 18 26" fill={color} opacity={0.9} />
      <circle cx={24} cy={10} r={4} fill={color} opacity={0.6} />
      <path d="M17 26 C17 20 20 17 24 17 C28 17 31 20 31 26" fill={color} opacity={0.6} />
    </svg>
  ),
  alb: (color) => (
    <svg width={26} height={20} viewBox="0 0 22 16" fill="none">
      <circle cx={3} cy={8} r={2.5} fill={color} />
      <circle cx={19} cy={2} r={2} fill={color} opacity={0.7} />
      <circle cx={19} cy={8} r={2} fill={color} opacity={0.7} />
      <circle cx={19} cy={14} r={2} fill={color} opacity={0.7} />
      <line x1={5} y1={8} x2={17} y2={2} stroke={color} strokeWidth={1.2} opacity={0.6} />
      <line x1={5} y1={8} x2={17} y2={8} stroke={color} strokeWidth={1.2} opacity={0.6} />
      <line x1={5} y1={8} x2={17} y2={14} stroke={color} strokeWidth={1.2} opacity={0.6} />
    </svg>
  ),
  service: (color) => (
    <svg width={22} height={22} viewBox="0 0 18 18" fill="none">
      <circle cx={9} cy={9} r={7} stroke={color} strokeWidth={1.6} />
      <circle cx={9} cy={9} r={2.4} fill={color} />
    </svg>
  ),
  pod: (color) => (
    <svg width={20} height={20} viewBox="0 0 18 18" fill="none">
      <rect x={2} y={2} width={14} height={14} rx={3} stroke={color} strokeWidth={1.6} />
    </svg>
  ),
  gpu: (color) => (
    <svg width={24} height={20} viewBox="0 0 22 18" fill="none">
      <rect x={1} y={3} width={20} height={12} rx={2} stroke={color} strokeWidth={1.6} />
      <line x1={5} y1={0} x2={5} y2={3} stroke={color} strokeWidth={1.6} />
      <line x1={11} y1={0} x2={11} y2={3} stroke={color} strokeWidth={1.6} />
      <line x1={17} y1={0} x2={17} y2={3} stroke={color} strokeWidth={1.6} />
      <line x1={5} y1={15} x2={5} y2={18} stroke={color} strokeWidth={1.6} />
      <line x1={11} y1={15} x2={11} y2={18} stroke={color} strokeWidth={1.6} />
      <line x1={17} y1={15} x2={17} y2={18} stroke={color} strokeWidth={1.6} />
    </svg>
  ),
  keda: (color) => (
    <svg width={22} height={22} viewBox="0 0 18 18" fill="none">
      <path d="M9 1 L11 6 L16.5 6 L12 9.5 L13.5 15 L9 11.5 L4.5 15 L6 9.5 L1.5 6 L7 6 Z" stroke={color} strokeWidth={1.4} fill="none" />
    </svg>
  ),
  scheduler: (color) => (
    <svg width={22} height={22} viewBox="0 0 18 18" fill="none">
      <rect x={2} y={2} width={6} height={6} rx={1.5} stroke={color} strokeWidth={1.4} />
      <rect x={10} y={2} width={6} height={6} rx={1.5} stroke={color} strokeWidth={1.4} />
      <rect x={2} y={10} width={6} height={6} rx={1.5} stroke={color} strokeWidth={1.4} />
      <rect x={10} y={10} width={6} height={6} rx={1.5} fill={color} opacity={0.5} />
    </svg>
  ),
  karpenter: (color) => (
    <svg width={22} height={22} viewBox="0 0 18 18" fill="none">
      <path d="M9 1 L9 17 M1 9 L17 9" stroke={color} strokeWidth={1.6} />
      <circle cx={9} cy={9} r={7} stroke={color} strokeWidth={1.4} />
    </svg>
  ),
  node: (color) => (
    <svg width={24} height={22} viewBox="0 0 20 18" fill="none">
      <rect x={1} y={1} width={18} height={16} rx={2} stroke={color} strokeWidth={1.6} />
    </svg>
  ),
};

export const ArchitectureNode: React.FC<{
  kind: ArchitectureNodeKind;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  /** Highlighted = this is the node the current beat is teaching; drawn with the accent color and a glow. */
  highlighted?: boolean;
  /** Dimmed = present but not the focus of this beat. */
  dimmed?: boolean;
  appearFrame?: number;
}> = ({
  kind,
  label,
  sublabel,
  x,
  y,
  width = 150,
  height = 84,
  highlighted = false,
  dimmed = false,
  appearFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = spring({
    frame: frame - appearFrame,
    fps,
    config: { damping: 16, mass: 0.6, stiffness: 110 },
  });

  if (frame < appearFrame) return null;

  const scale = interpolate(entrance, [0, 1], [0.75, 1]);
  const opacity = interpolate(entrance, [0, 1], [0, dimmed ? 0.45 : 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const accent = highlighted ? theme.accentStrong : theme.textDim;
  const border = highlighted ? theme.accent : theme.panelBorder;

  return (
    <div
      style={{
        position: 'absolute',
        left: x - width / 2,
        top: y - height / 2,
        width,
        height,
        borderRadius: 16,
        background: theme.panelBg,
        border: `2px solid ${border}`,
        boxShadow: highlighted
          ? `0 0 0 4px ${theme.accent}22, 0 8px 24px rgba(29, 111, 214, 0.18)`
          : '0 2px 8px rgba(16, 24, 40, 0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transform: `scale(${scale})`,
        opacity,
      }}
    >
      {ICONS[kind](accent)}
      <div
        style={{
          fontFamily: theme.fontFamily,
          fontSize: 17,
          fontWeight: 700,
          color: highlighted ? theme.accentStrong : theme.text,
          letterSpacing: 0.2,
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      {sublabel && (
        <div
          style={{
            fontFamily: theme.fontFamily,
            fontSize: 13,
            fontWeight: 500,
            color: theme.textDim,
            textAlign: 'center',
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
};
