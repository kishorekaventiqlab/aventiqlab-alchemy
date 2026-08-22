import React from 'react';
import { Composition } from 'remotion';
import { InferenceUnderLoad } from './compositions/InferenceUnderLoad';
import { FPS, TOTAL_DURATION_FRAMES } from './data/inferenceUnderLoadScript';

// One <Composition> per experience Video artifact. Add the next one here as
// each experience's content/video-script.md is written (see
// /experience-catalog/<exp>/content/video-script.md for the source script).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="inference-under-load-video"
        component={InferenceUnderLoad}
        durationInFrames={TOTAL_DURATION_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
