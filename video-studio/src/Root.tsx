import React from 'react';
import { Composition } from 'remotion';
import { InferenceUnderLoad } from './compositions/InferenceUnderLoad';
import {
  FPS as INFERENCE_UNDER_LOAD_FPS,
  TOTAL_DURATION_FRAMES as INFERENCE_UNDER_LOAD_FRAMES,
} from './data/inferenceUnderLoadScript';
import { DeployInferenceService } from './compositions/DeployInferenceService';
import {
  FPS as DEPLOY_INFERENCE_SERVICE_FPS,
  TOTAL_DURATION_FRAMES as DEPLOY_INFERENCE_SERVICE_FRAMES,
} from './data/deployInferenceServiceScript';

// One <Composition> per experience Video artifact. Add the next one here as
// each experience's content/video-script.md is written (see
// /experience-catalog/<exp>/content/video-script.md for the source script).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="inference-under-load-video"
        component={InferenceUnderLoad}
        durationInFrames={INFERENCE_UNDER_LOAD_FRAMES}
        fps={INFERENCE_UNDER_LOAD_FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="deploy-inference-service-video"
        component={DeployInferenceService}
        durationInFrames={DEPLOY_INFERENCE_SERVICE_FRAMES}
        fps={DEPLOY_INFERENCE_SERVICE_FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
