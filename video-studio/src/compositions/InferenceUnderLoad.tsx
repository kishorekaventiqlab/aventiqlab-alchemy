import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { theme } from '../components/theme';
import { TitleCard } from '../components/TitleCard';
import { DashboardMock } from '../components/DashboardMock';
import { TerminalMock } from '../components/TerminalMock';
import { CaptionBar } from '../components/CaptionBar';
import { RecapCard } from '../components/RecapCard';
import { inferenceUnderLoadScript, FPS } from '../data/inferenceUnderLoadScript';

export const InferenceUnderLoad: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {inferenceUnderLoadScript.map((beat, i) => {
        const from = Math.round(beat.start * FPS);
        const durationInFrames = Math.round(beat.duration * FPS);

        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              {beat.type === 'title' && (
                <TitleCard title={beat.title} subtitle={beat.subtitle} />
              )}
              {beat.type === 'dashboard' && (
                <>
                  <DashboardMock
                    serviceName={beat.serviceName}
                    panels={beat.panels}
                    alert={beat.alert}
                    durationInFrames={durationInFrames}
                  />
                  <CaptionBar text={beat.caption} durationInFrames={durationInFrames} />
                </>
              )}
              {beat.type === 'terminal' && (
                <>
                  <TerminalMock lines={beat.lines} durationInFrames={durationInFrames} />
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
