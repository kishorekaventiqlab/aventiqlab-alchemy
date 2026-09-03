/**
 * The Remotion <Composition> wiring for the video/v2 spec-driven renderer.
 * Mirrors specComposition.tsx's calculateMetadata pattern exactly, driven by
 * loadVideoSpecV2/retimeBeatsV2 instead of v1's loaders.
 *
 * `/v1/render` invokes Remotion with inputProps carrying:
 *   { spec: <video/v2 video_spec>, measuredAudio?: {...}, audioPrefix }
 */
import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { SpecVideoV2 } from '../compositions/SpecVideoV2.js';
import { loadVideoSpecV2, retimeBeatsV2, type LoadedVideoV2, type MeasuredAudio } from './loadVideoSpecV2.js';
import type { VideoSpecV2 } from './videoSpecTypesV2.js';
import { SAMPLE_SPEC_V2 } from './sampleSpecV2.js';

export type SpecCompositionV2Props = {
  spec?: VideoSpecV2;
  measuredAudio?: MeasuredAudio;
  audioPrefix?: string;
  loaded?: LoadedVideoV2;
  musicEnabled?: boolean;
  [key: string]: unknown;
};

const calculateMetadata: CalculateMetadataFunction<SpecCompositionV2Props> = ({ props }) => {
  const spec = props.spec ?? SAMPLE_SPEC_V2;
  let loaded = loadVideoSpecV2(spec);
  if (props.measuredAudio && Object.keys(props.measuredAudio).length > 0) {
    loaded = retimeBeatsV2(loaded, props.measuredAudio);
  }
  return {
    durationInFrames: loaded.totalDurationFrames,
    fps: loaded.fps,
    width: 1920,
    height: 1080,
    props: { ...props, loaded, audioPrefix: props.audioPrefix ?? 'audio/spec/' },
  };
};

const SpecVideoV2Bridge: React.FC<SpecCompositionV2Props> = (props) => {
  const loaded = props.loaded ?? loadVideoSpecV2(props.spec ?? SAMPLE_SPEC_V2);
  return (
    <SpecVideoV2
      loaded={loaded}
      audioPrefix={props.audioPrefix ?? 'audio/spec/'}
      musicEnabled={props.musicEnabled}
    />
  );
};

export const SpecVideoV2Composition: React.FC = () => (
  <Composition
    id="spec-video-v2"
    component={SpecVideoV2Bridge}
    calculateMetadata={calculateMetadata}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ audioPrefix: 'audio/spec/' } as SpecCompositionV2Props}
  />
);
