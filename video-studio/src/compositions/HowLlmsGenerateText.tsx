import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { theme } from '../components/theme';
import { TitleCard } from '../components/TitleCard';
import { StatementCard } from '../components/StatementCard';
import { OptionsCompare } from '../components/OptionsCompare';
import { RecapCard } from '../components/RecapCard';
import { CaptionBar } from '../components/CaptionBar';
import { GenerationLoopScene } from '../components/GenerationLoopScene';
import { LatencyContrastScene } from '../components/LatencyContrastScene';
import { PipelineDiagram } from '../components/PipelineDiagram';
import { BackgroundMusic } from '../components/BackgroundMusic';
import {
  howLlmsGenerateTextScript,
  FPS,
  TOTAL_DURATION_FRAMES,
} from '../data/howLlmsGenerateTextScript';

// Narration audio lives in its own subfolder per data file (written by
// `npm run generate:audio -- howLlmsGenerateTextScript`, Chatterbox V3) so
// two scripts' beat numbering can never collide with each other.
const AUDIO_PREFIX = 'audio/howLlmsGenerateTextScript/';

// Renders each generationLoop/latencyContrast segment's caption inside its
// own nested Sequence (so CaptionBar's internal sentence-chunk timing is
// scoped to just that segment's span, matching every other beat type) plus
// each segment's audio at its own offset - while the visuals underneath stay
// in one continuous, non-resetting Sequence per beat.
const SegmentedCaptionsAndAudio: React.FC<{
  segments: { t: number; caption: string; audioFile: string }[];
  sceneDuration: number;
  fps: number;
}> = ({ segments, sceneDuration, fps }) => (
  <>
    {segments.map((seg, i) => {
      const nextT = segments[i + 1]?.t ?? sceneDuration;
      const from = Math.round(seg.t * fps);
      const durationInFrames = Math.round((nextT - seg.t) * fps);
      return (
        <Sequence key={seg.audioFile} from={from} durationInFrames={durationInFrames}>
          <Audio src={staticFile(`${AUDIO_PREFIX}${seg.audioFile}`)} />
          <CaptionBar text={seg.caption} durationInFrames={durationInFrames} />
        </Sequence>
      );
    })}
  </>
);

// Computes [startSeconds, endSeconds) narration windows for every beat, used
// to duck the background music - mirrors NARRATION_INTERVALS in
// inferenceUnderLoadScript.ts, kept local here since this script's beat
// shape (generationLoop/latencyContrast) differs from that file's.
const NARRATION_INTERVALS = (() => {
  const intervals: { startSeconds: number; endSeconds: number }[] = [];
  for (const beat of howLlmsGenerateTextScript) {
    if (beat.type === 'generationLoop' || beat.type === 'diagram') {
      for (let i = 0; i < beat.segments.length; i++) {
        const seg = beat.segments[i];
        const nextT = beat.segments[i + 1]?.t ?? beat.duration;
        intervals.push({ startSeconds: beat.start + seg.t, endSeconds: beat.start + nextT });
      }
    } else if ('audioFile' in beat && beat.audioFile) {
      intervals.push({ startSeconds: beat.start, endSeconds: beat.start + beat.duration });
    }
  }
  return intervals;
})();

export const HowLlmsGenerateText: React.FC<{ musicEnabled?: boolean }> = ({ musicEnabled = true }) => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {musicEnabled && (
        <BackgroundMusic
          src="audio/music/ambient-beat.mp3"
          fps={FPS}
          totalDurationInFrames={TOTAL_DURATION_FRAMES}
          narrationIntervals={NARRATION_INTERVALS}
          loopDurationInFrames={Math.round(32 * FPS)}
        />
      )}
      {howLlmsGenerateTextScript.map((beat, i) => {
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
              {beat.type === 'generationLoop' && (
                <>
                  <GenerationLoopScene fps={FPS} keyframes={beat.keyframes} />
                  <SegmentedCaptionsAndAudio segments={beat.segments} sceneDuration={beat.duration} fps={FPS} />
                </>
              )}
              {beat.type === 'diagram' && (
                <>
                  <PipelineDiagram fps={FPS} keyframes={beat.keyframes} />
                  <SegmentedCaptionsAndAudio segments={beat.segments} sceneDuration={beat.duration} fps={FPS} />
                </>
              )}
              {beat.type === 'latencyContrast' && (
                <>
                  <LatencyContrastScene fps={FPS} keyframes={beat.keyframes} />
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
