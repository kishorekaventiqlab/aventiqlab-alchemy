import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';
import { ArchitectureDiagramV2, type DiagramEntity, type DiagramRelationship } from './ArchitectureDiagramV2';
import { CameraFrame } from './CameraFocus';
import { deriveAppearFrames, deriveRelationships, deriveCameraFrame, type TimelineCameraKeyframe } from './eventTimeline';
import type { EntityShapeCategory } from './ArchitectureNode';

/**
 * v2's InvestigationScene — a mechanism-level animation driven by a generic
 * `entities`/`events` timeline (video-schema-v2.ts), NEVER by hardcoded
 * fixture data. v1's InvestigationScene.tsx hard-imports one Kubernetes demo
 * video's ARCH_NODES/ARCH_EDGES as its background regardless of the real
 * spec's topic — the root cause of Git/IAM videos rendering Kubernetes
 * visuals. This component takes its entities entirely from props (the real
 * v2 spec, via loadVideoSpecV2), so the diagram is whatever the spec's own
 * topic actually is.
 *
 * Layout: entities WITH x/y (the ones the model placed for the architecture
 * view) are drawn via ArchitectureDiagramV2. Events reference entities by id
 * and fire at a scene-relative time `t`; each event type maps to a fixed,
 * deterministic visual treatment (highlight the target, flash a transition,
 * append a line to the event log) — the LLM never controls rendering
 * details directly, only which of the 18 closed event types occurred.
 */

export interface InvestigationEntity {
  id: string;
  category: EntityShapeCategory;
  label: string;
  sublabel?: string;
  x?: number;
  y?: number;
}

const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 124;

export interface InvestigationEvent {
  t: number;
  type:
    | 'create'
    | 'move'
    | 'connect'
    | 'disconnect'
    | 'send'
    | 'receive'
    | 'execute'
    | 'evaluate'
    | 'fail'
    | 'recover'
    | 'transform'
    | 'allocate'
    | 'release'
    | 'scale'
    | 'schedule'
    | 'merge'
    | 'rebase'
    | 'state_change';
  target?: string;
  from?: string;
  to?: string;
  detail?: string;
}

const EVENT_VERB: Record<InvestigationEvent['type'], string> = {
  create: 'created',
  move: 'moved',
  connect: 'connected',
  disconnect: 'disconnected',
  send: 'sent',
  receive: 'received',
  execute: 'executing',
  evaluate: 'evaluating',
  fail: 'failed',
  recover: 'recovered',
  transform: 'transformed',
  allocate: 'allocated',
  release: 'released',
  scale: 'scaled',
  schedule: 'scheduled',
  merge: 'merged',
  rebase: 'rebased',
  state_change: 'changed',
};

const EVENT_COLOR: Record<InvestigationEvent['type'], string> = {
  create: theme.success,
  move: theme.accent,
  connect: theme.accent,
  disconnect: theme.textDim,
  send: theme.accent,
  receive: theme.accent,
  execute: theme.accent,
  evaluate: theme.warning,
  fail: theme.danger,
  recover: theme.success,
  transform: theme.accent,
  allocate: theme.success,
  release: theme.textDim,
  scale: theme.accent,
  schedule: theme.accent,
  merge: theme.success,
  rebase: theme.warning,
  state_change: theme.accent,
};

function eventLine(e: InvestigationEvent, byId: Map<string, InvestigationEntity>): string {
  const targetLabel = e.target ? byId.get(e.target)?.label ?? e.target : undefined;
  if (e.from && e.to) {
    return targetLabel ? `${targetLabel}: ${e.from} → ${e.to}` : `${e.from} → ${e.to}`;
  }
  if (e.detail) {
    return targetLabel ? `${targetLabel} — ${e.detail}` : e.detail;
  }
  return targetLabel ? `${targetLabel} ${EVENT_VERB[e.type]}` : EVENT_VERB[e.type];
}

// deriveRelationships/deriveAppearFrames moved to eventTimeline.ts (Phase B
// of the video/v2 temporal mechanism proposal) so ArchitectureDiagramV2 can
// reuse the exact same timeline math off an architecture beat's own optional
// events[] — re-exported here so existing imports of this module keep working.
export { deriveRelationships, deriveAppearFrames } from './eventTimeline';

export const InvestigationSceneV2: React.FC<{
  fps: number;
  entities: InvestigationEntity[];
  events: InvestigationEvent[];
  highlightId?: string;
  cameraKeyframes?: TimelineCameraKeyframe[];
}> = ({ fps, entities, events, highlightId, cameraKeyframes }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;
  const camera = deriveCameraFrame(cameraKeyframes, tSec);

  const byId = new Map(entities.map((e) => [e.id, e]));
  const fired = events.filter((e) => e.t <= tSec).sort((a, b) => a.t - b.t);
  const activeEvent = fired[fired.length - 1];

  const appearFrames = deriveAppearFrames(entities, events, fps);
  const diagramEntities: DiagramEntity[] = entities.map((e) => ({ ...e, appearFrame: appearFrames.get(e.id) }));

  const entityIds = new Set(entities.map((e) => e.id));
  const allRelationships = deriveRelationships(events, entityIds, fps);
  // Only draw relationships whose appearFrame has already passed — a
  // relationship "existing" before its own connecting event fired would
  // contradict the event log right above it.
  const relationships: DiagramRelationship[] = allRelationships.filter((r) => (r.appearFrame ?? 0) <= frame);

  const activeTarget = activeEvent?.target ?? highlightId;
  const flashOpacity = activeEvent
    ? interpolate(tSec, [activeEvent.t, activeEvent.t + 0.6], [1, 0.35], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  // Recent event log: last 6 fired events, oldest first, fading in as they occur.
  const logEvents = fired.slice(-6);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <CameraFrame focalX={cameraKeyframes ? camera.focalX : 0.5} focalY={cameraKeyframes ? camera.focalY : 0.42} scale={camera.scale}>
        <ArchitectureDiagramV2
          entities={diagramEntities}
          relationships={relationships}
          highlightId={activeTarget}
          top={130}
        />

        {activeTarget && flashOpacity > 0 && (
          <EntityPulse entity={byId.get(activeTarget)} color={activeEvent ? EVENT_COLOR[activeEvent.type] : theme.accent} opacity={flashOpacity} />
        )}
      </CameraFrame>

      <div
        style={{
          position: 'absolute',
          left: theme.spacing.safeMarginX * 0.6,
          right: theme.spacing.safeMarginX * 0.6,
          bottom: 60,
          background: theme.panelBg,
          border: `1px solid ${theme.panelBorder}`,
          borderRadius: 12,
          padding: '16px 22px',
          boxShadow: '0 2px 8px rgba(16, 24, 40, 0.06)',
        }}
      >
        <div
          style={{
            fontFamily: theme.fontFamily,
            fontSize: theme.fontSize.kicker - 6,
            fontWeight: 700,
            letterSpacing: 1,
            color: theme.textDim,
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          What&apos;s happening
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logEvents.length === 0 && (
            <div style={{ fontFamily: theme.monoFontFamily, fontSize: theme.fontSize.diagramSublabel, color: theme.textDim }}>&hellip;</div>
          )}
          {logEvents.map((e, i) => {
            const isLatest = i === logEvents.length - 1;
            const age = tSec - e.t;
            const opacity = isLatest ? 1 : interpolate(age, [0, 3], [1, 0.55], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div
                key={`${e.t}-${e.type}-${e.target ?? i}`}
                style={{
                  fontFamily: theme.monoFontFamily,
                  fontSize: isLatest ? theme.fontSize.diagramLabel : theme.fontSize.diagramSublabel,
                  fontWeight: isLatest ? 700 : 500,
                  color: isLatest ? EVENT_COLOR[e.type] : theme.textDim,
                  opacity,
                }}
              >
                {eventLine(e, byId)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const EntityPulse: React.FC<{ entity?: InvestigationEntity; color: string; opacity: number }> = ({ entity, color, opacity }) => {
  if (!entity || entity.x === undefined || entity.y === undefined) return null;
  const width = DEFAULT_NODE_WIDTH + 20;
  const height = DEFAULT_NODE_HEIGHT + 20;
  return (
    <div
      style={{
        position: 'absolute',
        left: entity.x - width / 2,
        top: entity.y + 130 - height / 2,
        width,
        height,
        borderRadius: 16,
        boxShadow: `0 0 0 6px ${color}33`,
        border: `2px solid ${color}`,
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
