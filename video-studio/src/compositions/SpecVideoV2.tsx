/**
 * video/v2 — the generic, spec-driven composition. Mirrors SpecVideo.tsx's
 * switch(beat.type) dispatch: title/statement/optionsCompare/dashboard/
 * terminal/editor/recap reuse the SAME 7 generic components v1 uses,
 * unmodified. architecture/investigation dispatch to the v2-specific
 * components (ArchitectureDiagramV2/InvestigationSceneV2), which take their
 * entities/events entirely from the real spec, never from demo fixture data.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { theme } from '../components/theme';
import { TitleCard } from '../components/TitleCard';
import { StatementCard } from '../components/StatementCard';
import { OptionsCompare } from '../components/OptionsCompare';
import { ArchitectureDiagramV2 } from '../components/ArchitectureDiagramV2';
import { InvestigationSceneV2, type InvestigationEntity, type InvestigationEvent } from '../components/InvestigationSceneV2';
import { DashboardMock } from '../components/DashboardMock';
import { TerminalMock } from '../components/TerminalMock';
import { EditorMock } from '../components/EditorMock';
import { CaptionBar } from '../components/CaptionBar';
import { RecapCard } from '../components/RecapCard';
import { BackgroundMusic } from '../components/BackgroundMusic';
import type { LoadedVideoV2, RendererBeatV2, RendererInvestigationSegmentV2 } from '../spec/loadVideoSpecV2';

export interface SpecVideoV2Props {
  loaded: LoadedVideoV2;
  audioPrefix: string;
  musicEnabled?: boolean;
}

const InvestigationV2WithHighlight: React.FC<{
  entities: InvestigationEntity[];
  events: InvestigationEvent[];
  segments: RendererInvestigationSegmentV2[];
  fps: number;
}> = ({ entities, events, segments, fps }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;
  let highlightId: string | undefined;
  for (const seg of segments) {
    if (seg.t <= tSec) highlightId = seg.highlightId;
    else break;
  }
  return <InvestigationSceneV2 fps={fps} entities={entities} events={events} highlightId={highlightId} />;
};

const InvestigationV2CaptionsAndAudio: React.FC<{
  segments: RendererInvestigationSegmentV2[];
  sceneDuration: number;
  fps: number;
  audioPrefix: string;
}> = ({ segments, sceneDuration, fps, audioPrefix }) => (
  <>
    {segments.map((seg, i) => {
      const nextT = segments[i + 1]?.t ?? sceneDuration;
      const from = Math.round(seg.t * fps);
      const durationInFrames = Math.round((nextT - seg.t) * fps);
      return (
        <Sequence key={seg.audioFile} from={from} durationInFrames={durationInFrames}>
          <Audio src={staticFile(`${audioPrefix}${seg.audioFile}`)} />
          <CaptionBar text={seg.displayCaption} durationInFrames={durationInFrames} shortCaption />
        </Sequence>
      );
    })}
  </>
);

const BeatViewV2: React.FC<{ beat: RendererBeatV2; durationInFrames: number; fps: number; audioPrefix: string }> = ({
  beat,
  durationInFrames,
  fps,
  audioPrefix,
}) => {
  const audio =
    'audioFile' in beat && beat.audioFile ? (
      <Sequence from={Math.round(0.5 * fps)}>
        <Audio src={staticFile(`${audioPrefix}${beat.audioFile}`)} />
      </Sequence>
    ) : null;

  switch (beat.type) {
    case 'title':
      return (
        <AbsoluteFill>
          {audio}
          <TitleCard title={beat.title} subtitle={beat.subtitle} />
        </AbsoluteFill>
      );
    case 'statement':
      return (
        <AbsoluteFill>
          {audio}
          <StatementCard
            eyebrow={beat.eyebrow}
            eyebrowColor={beat.eyebrowColor}
            statement={beat.statement}
            support={beat.support}
            durationInFrames={durationInFrames}
          />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
    case 'optionsCompare':
      return (
        <AbsoluteFill>
          {audio}
          <OptionsCompare options={beat.options} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
    case 'architecture':
      return (
        <AbsoluteFill>
          {audio}
          <ArchitectureDiagramV2 entities={beat.entities} relationships={beat.relationships.map((r) => ({ fromId: r.fromId, toId: r.toId, flowing: r.flowing }))} highlightId={beat.highlightId} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
    case 'investigation':
      return (
        <AbsoluteFill>
          <InvestigationV2WithHighlight entities={beat.entities} events={beat.events} segments={beat.segments} fps={fps} />
          <InvestigationV2CaptionsAndAudio
            segments={beat.segments}
            sceneDuration={beat.duration}
            fps={fps}
            audioPrefix={audioPrefix}
          />
        </AbsoluteFill>
      );
    case 'dashboard':
      return (
        <AbsoluteFill>
          {audio}
          <DashboardMock
            serviceName={beat.serviceName}
            panels={beat.panels}
            alert={beat.alert}
            durationInFrames={durationInFrames}
            focusPanelIndex={beat.focusPanelIndex}
          />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
    case 'terminal':
      return (
        <AbsoluteFill>
          {audio}
          <TerminalMock lines={beat.lines} durationInFrames={durationInFrames} focusLineIndex={beat.focusLineIndex} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
    case 'editor':
      return (
        <AbsoluteFill>
          {audio}
          <EditorMock
            filename={beat.filename}
            lines={beat.lines}
            durationInFrames={durationInFrames}
            focusLineIndex={beat.focusLineIndex}
          />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
    case 'recap':
      return (
        <AbsoluteFill>
          {audio}
          <RecapCard items={beat.items} durationInFrames={durationInFrames} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} shortCaption />
        </AbsoluteFill>
      );
  }
};

export const SpecVideoV2: React.FC<SpecVideoV2Props> = ({ loaded, audioPrefix, musicEnabled = true }) => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {musicEnabled && (
        <BackgroundMusic
          src="audio/music/ambient-bed.wav"
          fps={loaded.fps}
          totalDurationInFrames={loaded.totalDurationFrames}
          narrationIntervals={loaded.narrationIntervals}
          loopDurationInFrames={Math.round(32 * loaded.fps)}
        />
      )}
      {loaded.beats.map((beat, i) => {
        const from = Math.round(beat.start * loaded.fps);
        const durationInFrames = Math.round(beat.duration * loaded.fps);
        return (
          <Sequence key={`${beat.type}-${i}`} from={from} durationInFrames={durationInFrames}>
            <BeatViewV2 beat={beat} durationInFrames={durationInFrames} fps={loaded.fps} audioPrefix={audioPrefix} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
