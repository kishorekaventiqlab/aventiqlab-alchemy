import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile } from 'remotion';
import { theme } from '../components/theme';
import { TitleCard } from '../components/TitleCard';
import { EditorMock } from '../components/EditorMock';
import { TerminalMock } from '../components/TerminalMock';
import { CaptionBar } from '../components/CaptionBar';
import { RecapCard } from '../components/RecapCard';
import { deployInferenceServiceScript, FPS } from '../data/deployInferenceServiceScript';

// Narration audio lives in its own subfolder per data file (written by
// `npm run generate:audio -- deployInferenceServiceScript`, Chatterbox V3)
// so two scripts' beat numbering can never collide with each other.
const AUDIO_PREFIX = 'audio/deployInferenceServiceScript/';

export const DeployInferenceService: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {deployInferenceServiceScript.map((beat, i) => {
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
              {beat.type === 'editor' && (
                <>
                  <EditorMock
                    filename={beat.filename}
                    lines={beat.lines}
                    durationInFrames={durationInFrames}
                    focusLineIndex={beat.focusLineIndex}
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
