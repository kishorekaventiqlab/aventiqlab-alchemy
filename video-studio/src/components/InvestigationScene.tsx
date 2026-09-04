import React from 'react';
import { useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { ArchitectureDiagram } from './ArchitectureDiagram';
import { MetricsRow, LiveMetric } from './MetricsRow';
import { CapacityMeter } from './CapacityMeter';
import { PendingPod } from './PendingPod';
import { SqsQueueMeter } from './SqsQueueMeter';
import { CameraFrame } from './CameraFocus';
import { ARCH_NODES, ARCH_EDGES } from '../data/inferenceUnderLoadScript';

// One continuous scene for the whole Investigation/Demonstration stage — this
// replaces the old per-beat metrics/pending/karpenter Sequences. Because
// everything here lives inside ONE parent Sequence, useCurrentFrame() never
// resets mid-story, so numbers, pod spawns, and the camera can all animate
// *through* the story instead of cutting between static snapshots.
//
// A `Keyframe` is a fact about the world at a point in scene-relative time
// (seconds). Between two keyframes, every numeric field is linearly
// interpolated frame-by-frame; pods/nodes are matched by id so a pod that
// exists in both keyframes animates smoothly, one that appears is a spawn,
// and one that disappears is a despawn — never a hard swap.
export type PodState = { id: string; status: 'running' | 'pending' | 'resolved' };
export type NodeState = { id: string; label: string; fillPercent: number; full?: boolean; incoming?: boolean };
export type CameraKeyframe = { t: number; focalX: number; focalY: number; scale: number };

export type Keyframe = {
  t: number; // seconds, scene-relative
  traffic: number;
  podCount: number;
  gpuPct: number;
  queueDepth: number;
  nodes: NodeState[];
  pendingPods: string[];
  resolvedPods: string[];
  trafficColor?: LiveMetric['color'];
  gpuColor?: LiveMetric['color'];
};

function lerp(a: number, b: number, p: number) {
  return a + (b - a) * p;
}

function sampleAt(keyframes: Keyframe[], tSec: number) {
  if (tSec <= keyframes[0].t) return { kf: keyframes[0], next: keyframes[0], p: 0 };
  const last = keyframes[keyframes.length - 1];
  if (tSec >= last.t) return { kf: last, next: last, p: 1 };
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (tSec >= a.t && tSec <= b.t) {
      const p = b.t === a.t ? 1 : (tSec - a.t) / (b.t - a.t);
      return { kf: a, next: b, p };
    }
  }
  return { kf: last, next: last, p: 1 };
}

function sampleNodes(a: NodeState[], b: NodeState[], p: number): NodeState[] {
  const ids = Array.from(new Set([...a.map((n) => n.id), ...b.map((n) => n.id)]));
  return ids.map((id) => {
    const na = a.find((n) => n.id === id);
    const nb = b.find((n) => n.id === id);
    if (na && nb) return { ...nb, fillPercent: lerp(na.fillPercent, nb.fillPercent, p) };
    if (nb && !na) return { ...nb, fillPercent: nb.fillPercent * Math.min(1, p * 2) }; // newly joining node ramps in
    if (na && !nb) return na;
    return na ?? nb!;
  });
}

// Focal points are chosen conservatively (modest scale, focal points pulled
// toward center) because CameraFrame zooms the ENTIRE scene from one origin -
// content far from the focal point moves *toward the edges* as scale
// increases, so anything the viewer still needs to read (captions aside, which
// live outside this transform) must stay close enough to center to survive
// the zoom. Timings are aligned to the content keyframes above (see `t`
// values on the Keyframe array) so the camera arrives at each region exactly
// when that region becomes the relevant one, not late.
export const CAMERA_KEYFRAMES_DEFAULT: CameraKeyframe[] = [
  { t: 0, focalX: 0.5, focalY: 0.42, scale: 1 },
  { t: 10, focalX: 0.5, focalY: 0.1, scale: 1.12 }, // push in on the metrics row as traffic starts climbing
  { t: 26, focalX: 0.62, focalY: 0.32, scale: 1.14 }, // ease toward the SQS queue as pressure builds
  { t: 40, focalX: 0.65, focalY: 0.35, scale: 1.16 }, // hold near the queue as it spikes
  { t: 44, focalX: 0.5, focalY: 0.6, scale: 1.2 }, // settle on the pending-pods region the instant they appear
  { t: 54, focalX: 0.5, focalY: 0.6, scale: 1.2 }, // hold on pending pods
  { t: 57, focalX: 0.68, focalY: 0.48, scale: 1.18 }, // pan right to the new node joining
  { t: 68, focalX: 0.5, focalY: 0.42, scale: 1 }, // pull back out for recovery
  { t: 86.6, focalX: 0.5, focalY: 0.42, scale: 1 },
];

function sampleCamera(keyframes: CameraKeyframe[], tSec: number): CameraKeyframe {
  const { kf, next, p } = sampleAtGeneric(keyframes, tSec);
  return {
    t: tSec,
    focalX: lerp(kf.focalX, next.focalX, p),
    focalY: lerp(kf.focalY, next.focalY, p),
    scale: lerp(kf.scale, next.scale, p),
  };
}

function sampleAtGeneric<T extends { t: number }>(keyframes: T[], tSec: number) {
  if (tSec <= keyframes[0].t) return { kf: keyframes[0], next: keyframes[0], p: 0 };
  const last = keyframes[keyframes.length - 1];
  if (tSec >= last.t) return { kf: last, next: last, p: 1 };
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (tSec >= a.t && tSec <= b.t) {
      const p = b.t === a.t ? 1 : (tSec - a.t) / (b.t - a.t);
      return { kf: a, next: b, p };
    }
  }
  return { kf: last, next: last, p: 1 };
}

export const InvestigationScene: React.FC<{
  fps: number;
  keyframes: Keyframe[];
  cameraKeyframes?: CameraKeyframe[];
  highlightIndex?: number;
}> = ({ fps, keyframes, cameraKeyframes = CAMERA_KEYFRAMES_DEFAULT, highlightIndex }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;

  const { kf, next, p } = sampleAt(keyframes, tSec);
  const traffic = lerp(kf.traffic, next.traffic, p);
  const podCount = lerp(kf.podCount, next.podCount, p);
  const gpuPct = lerp(kf.gpuPct, next.gpuPct, p);
  const queueDepth = lerp(kf.queueDepth, next.queueDepth, p);
  const nodes = sampleNodes(kf.nodes, next.nodes, p);

  // Pending/resolved pods: the set only changes at a keyframe boundary (there's
  // no continuous "half pending" state). `sampleAt` guarantees kf.t <= tSec <=
  // next.t, so the currently-active discrete state is always `kf`'s (the
  // *earlier* keyframe) - `next`'s state doesn't take effect until tSec
  // reaches next.t, at which point a later call makes `next` the new `kf`.
  // Each pod also gets a fixed spawn frame anchored to kf's own time, not the
  // live playhead, so PendingPod's entrance animation plays once at the
  // moment it appears rather than replaying every frame thereafter.
  const boundaryFrame = Math.round(kf.t * fps);
  const pendingPods = kf.pendingPods;
  const resolvedPods = kf.resolvedPods;

  const camera = sampleCamera(cameraKeyframes, tSec);

  const trafficColor = kf.trafficColor ?? next.trafficColor;
  const gpuColor = kf.gpuColor ?? next.gpuColor;

  const meterWidth = 220;
  const gap = 44;
  const totalWidth = nodes.length * meterWidth + (nodes.length - 1) * gap;
  const startX = 960 - totalWidth / 2 + meterWidth / 2;

  const anyFull = nodes.some((n) => n.full || n.fillPercent >= 98);
  const anyIncoming = nodes.some((n) => n.incoming);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <CameraFrame focalX={camera.focalX} focalY={camera.focalY} scale={camera.scale}>
        <ArchitectureDiagram nodes={ARCH_NODES} edges={ARCH_EDGES} highlightIndex={highlightIndex} top={130} />

        <MetricsRow
          metrics={[
            { label: 'Traffic', value: traffic, format: (v) => `${Math.round(v)} req/s`, color: trafficColor },
            { label: 'Pods', value: podCount, format: (v) => `${Math.round(v)}`, color: 'accent' },
            { label: 'Nodes', value: nodes.length, color: anyIncoming ? 'accent' : undefined },
            { label: 'GPU utilization', value: gpuPct, format: (v) => `${Math.round(v)}%`, color: gpuColor },
          ]}
        />

        <SqsQueueMeter x={1550} y={340} depth={queueDepth} maxDepth={50} danger={queueDepth > 30} />

        <div
          style={{
            position: 'absolute',
            top: 700,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: theme.fontFamily,
            fontSize: theme.fontSize.diagramSublabel + 2,
            fontWeight: 700,
            letterSpacing: 1,
            color: anyFull ? theme.danger : theme.textDim,
            textTransform: 'uppercase',
          }}
        >
          Cluster GPU Capacity
        </div>

        {nodes.map((n, i) => (
          <CapacityMeter
            key={n.id}
            label={n.incoming ? `${n.label} — joining` : n.label}
            x={startX + i * (meterWidth + gap)}
            y={730}
            fillPercent={n.fillPercent}
            full={n.full}
            width={meterWidth}
          />
        ))}

        {pendingPods.length > 0 && (
          <>
            <div
              style={{
                position: 'absolute',
                top: 800,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: theme.fontFamily,
                fontSize: theme.fontSize.diagramSublabel + 2,
                fontWeight: 700,
                letterSpacing: 1,
                color: theme.warning,
                textTransform: 'uppercase',
              }}
            >
              Pending — waiting for capacity
            </div>
            {pendingPods.map((label, i) => {
              const x = 960 + (i - (pendingPods.length - 1) / 2) * 100;
              return <PendingPod key={label} label={label} x={x} y={866} size={72} appearFrame={boundaryFrame + i * 8} />;
            })}
          </>
        )}

        {resolvedPods.length > 0 && (
          <>
            <div
              style={{
                position: 'absolute',
                top: 800,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: theme.fontFamily,
                fontSize: theme.fontSize.diagramSublabel + 2,
                fontWeight: 700,
                letterSpacing: 1,
                color: theme.success,
                textTransform: 'uppercase',
              }}
            >
              Scheduled — running
            </div>
            <div style={{ position: 'absolute', top: 830, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 26 }}>
              {resolvedPods.map((label) => (
                <ResolvedPod key={label} label={label} />
              ))}
            </div>
          </>
        )}
      </CameraFrame>
    </div>
  );
};

const ResolvedPod: React.FC<{ label: string }> = ({ label }) => (
  <div
    style={{
      width: 72,
      height: 72,
      borderRadius: 14,
      border: `2px solid ${theme.success}`,
      background: theme.panelBg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    }}
  >
    <div style={{ width: 10, height: 10, borderRadius: '50%', background: theme.success, boxShadow: `0 0 8px ${theme.success}` }} />
    <div style={{ fontFamily: theme.monoFontFamily, fontSize: theme.fontSize.diagramSublabel, fontWeight: 700, color: theme.success }}>{label}</div>
  </div>
);
