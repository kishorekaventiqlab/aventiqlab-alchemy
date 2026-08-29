/**
 * AL4 — the generic, spec-driven composition. Renders a `LoadedVideo` (the
 * output of `loadVideoSpec`) using the same component set the hand-authored
 * compositions use.
 *
 * This is the composition `/v1/render` (AL5) drives: pass a `video/v1`
 * video_spec -> loadVideoSpec -> (synthesize audio) -> retimeBeats -> render
 * this. The hand-authored `InferenceUnderLoad` / `DeployInferenceService`
 * compositions stay as-is for the pre-Content-Studio reference videos.
 */
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { theme } from '../components/theme';
import { TitleCard } from '../components/TitleCard';
import { StatementCard } from '../components/StatementCard';
import { OptionsCompare } from '../components/OptionsCompare';
import { ArchitectureDiagram } from '../components/ArchitectureDiagram';
import { InvestigationScene } from '../components/InvestigationScene';
import { DashboardMock } from '../components/DashboardMock';
import { TerminalMock } from '../components/TerminalMock';
import { EditorMock } from '../components/EditorMock';
import { CaptionBar } from '../components/CaptionBar';
import { RecapCard } from '../components/RecapCard';
import { BackgroundMusic } from '../components/BackgroundMusic';
import type {
  LoadedVideo,
  RendererBeat,
  RendererInvestigationSegment,
  RendererInvestigationKeyframe,
} from '../spec/loadVideoSpec';

export interface SpecVideoProps {
  loaded: LoadedVideo;
  /** Prefix under public/ where this video's narration wavs live. */
  audioPrefix: string;
  musicEnabled?: boolean;
}

const InvestigationWithHighlight: React.FC<{
  keyframes: RendererInvestigationKeyframe[];
  segments: RendererInvestigationSegment[];
  fps: number;
}> = ({ keyframes, segments, fps }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;
  let highlightIndex: number | undefined;
  for (const seg of segments) {
    if (seg.t <= tSec) highlightIndex = seg.highlightIndex;
    else break;
  }
  return <InvestigationScene fps={fps} keyframes={keyframes} highlightIndex={highlightIndex} />;
};

const InvestigationCaptionsAndAudio: React.FC<{
  segments: RendererInvestigationSegment[];
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
          <CaptionBar text={seg.caption} durationInFrames={durationInFrames} />
        </Sequence>
      );
    })}
  </>
);

const BeatView: React.FC<{ beat: RendererBeat; durationInFrames: number; fps: number; audioPrefix: string }> = ({
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
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      );
    case 'optionsCompare':
      return (
        <AbsoluteFill>
          {audio}
          <OptionsCompare options={beat.options} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      );
    case 'architecture':
      return (
        <AbsoluteFill>
          {audio}
          <ArchitectureDiagram nodes={beat.nodes} edges={beat.edges} highlightIndex={beat.highlightIndex} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      );
    case 'investigation':
      return (
        <AbsoluteFill>
          <InvestigationWithHighlight keyframes={beat.keyframes} segments={beat.segments} fps={fps} />
          <InvestigationCaptionsAndAudio
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
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      );
    case 'terminal':
      return (
        <AbsoluteFill>
          {audio}
          <TerminalMock lines={beat.lines} durationInFrames={durationInFrames} focusLineIndex={beat.focusLineIndex} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
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
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      );
    case 'recap':
      return (
        <AbsoluteFill>
          {audio}
          <RecapCard items={beat.items} durationInFrames={durationInFrames} />
          <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
        </AbsoluteFill>
      );
  }
};

export const SpecVideo: React.FC<SpecVideoProps> = ({ loaded, audioPrefix, musicEnabled = true }) => {
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
            <BeatView beat={beat} durationInFrames={durationInFrames} fps={loaded.fps} audioPrefix={audioPrefix} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
