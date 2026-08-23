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
import { CaptionBar } from '../components/CaptionBar';
import { RecapCard } from '../components/RecapCard';
import { BackgroundMusic } from '../components/BackgroundMusic';
import {
  inferenceUnderLoadScript,
  FPS,
  TOTAL_DURATION_FRAMES,
  NARRATION_INTERVALS,
  InvestigationSegment,
  InvestigationKeyframe,
} from '../data/inferenceUnderLoadScript';

// The investigation scene's node/component highlight follows whichever
// segment is currently narrating (KEDA while pods scale, Karpenter once it
// provisions) - sampled the same way captions/audio are, from the active
// segment at the current scene-relative frame.
const InvestigationSceneWithHighlight: React.FC<{
  keyframes: InvestigationKeyframe[];
  segments: InvestigationSegment[];
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

// Renders each segment's caption inside its own nested Sequence (so
// CaptionBar's internal sentence-chunk timing is scoped to just that
// segment's span, matching how every other beat type already uses it) plus
// each segment's audio at its own offset - while the visuals underneath
// (InvestigationScene) stay in one continuous, non-resetting Sequence.
const InvestigationCaptionsAndAudio: React.FC<{
  segments: InvestigationSegment[];
  sceneDuration: number;
  fps: number;
  audioPrefix: string;
}> = ({ segments, sceneDuration, fps, audioPrefix }) => {
  return (
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
};

// Narration audio lives in its own subfolder per data file (written by
// `npm run generate:audio -- inferenceUnderLoadScript`, Chatterbox V3) so
// two scripts' beat numbering can never collide with each other.
const AUDIO_PREFIX = 'audio/inferenceUnderLoadScript/';

// `musicEnabled` (default true) plays a looping ambient bed under the whole
// video, ducked under narration via NARRATION_INTERVALS (see
// BackgroundMusic.tsx and tools/music/generate-bed.py for how the track
// itself was produced - a license-free synthesized loop, not a sample).
export const InferenceUnderLoad: React.FC<{ musicEnabled?: boolean }> = ({ musicEnabled = true }) => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {musicEnabled && (
        <BackgroundMusic
          src="audio/music/ambient-bed.wav"
          fps={FPS}
          totalDurationInFrames={TOTAL_DURATION_FRAMES}
          narrationIntervals={NARRATION_INTERVALS}
          loopDurationInFrames={Math.round(32 * FPS)}
        />
      )}
      {inferenceUnderLoadScript.map((beat, i) => {
        const from = Math.round(beat.start * FPS);
        const durationInFrames = Math.round(beat.duration * FPS);

        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              {'audioFile' in beat && beat.audioFile && (
                // Half-second lead-in so the visual establishes before speech starts.
                <Sequence from={15}>
                  <Audio src={staticFile(`${AUDIO_PREFIX}${beat.audioFile}`)} />
                </Sequence>
              )}
              {beat.type === 'title' && (
                <TitleCard title={beat.title} subtitle={beat.subtitle} />
              )}
              {beat.type === 'statement' && (
                <>
                  <StatementCard
                    eyebrow={beat.eyebrow}
                    eyebrowColor={beat.eyebrowColor}
                    statement={beat.statement}
                    support={beat.support}
                    durationInFrames={durationInFrames}
                  />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
              {beat.type === 'optionsCompare' && (
                <>
                  <OptionsCompare options={beat.options} />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
              {beat.type === 'architecture' && (
                <>
                  <ArchitectureDiagram nodes={beat.nodes} edges={beat.edges} highlightIndex={beat.highlightIndex} />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
              {beat.type === 'investigation' && (
                <>
                  <InvestigationSceneWithHighlight keyframes={beat.keyframes} segments={beat.segments} fps={FPS} />
                  <InvestigationCaptionsAndAudio
                    segments={beat.segments}
                    sceneDuration={beat.duration}
                    fps={FPS}
                    audioPrefix={AUDIO_PREFIX}
                  />
                </>
              )}
              {beat.type === 'dashboard' && (
                <>
                  <DashboardMock
                    serviceName={beat.serviceName}
                    panels={beat.panels}
                    alert={beat.alert}
                    durationInFrames={durationInFrames}
                    focusPanelIndex={beat.focusPanelIndex}
                  />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
              {beat.type === 'terminal' && (
                <>
                  <TerminalMock
                    lines={beat.lines}
                    durationInFrames={durationInFrames}
                    focusLineIndex={beat.focusLineIndex}
                  />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
              {beat.type === 'recap' && (
                <>
                  <RecapCard items={beat.items} durationInFrames={durationInFrames} />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
