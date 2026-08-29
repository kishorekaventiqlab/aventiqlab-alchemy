/**
 * The Remotion <Composition> wiring for the spec-driven renderer (AL4).
 *
 * `/v1/render` (AL5) invokes Remotion with `inputProps` carrying:
 *   { spec: <video/v1 video_spec>, measuredAudio?: { <wav>: seconds }, audioPrefix }
 *
 * `calculateMetadata` runs `loadVideoSpec` (and `retimeBeats` if the render
 * already has measured audio) to compute `durationInFrames` / `fps` from the
 * spec and passes the resolved `LoadedVideo` down as a prop. In the studio with
 * no inputProps it falls back to a bundled sample so the composition previews.
 */
import React from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { SpecVideo } from '../compositions/SpecVideo.js';
import { loadVideoSpec, retimeBeats, type LoadedVideo, type MeasuredAudio } from './loadVideoSpec.js';
import type { VideoSpec } from './videoSpecTypes.js';
import { SAMPLE_SPEC } from './sampleSpec.js';

// Remotion 4.x requires a composition's prop type to be an index-signature
// object. `spec` / `measuredAudio` arrive via inputProps; `loaded` /
// `audioPrefix` are filled by calculateMetadata.
export type SpecCompositionProps = {
  spec?: VideoSpec;
  measuredAudio?: MeasuredAudio;
  audioPrefix?: string;
  loaded?: LoadedVideo;
  musicEnabled?: boolean;
  [key: string]: unknown;
};

const calculateMetadata: CalculateMetadataFunction<SpecCompositionProps> = ({ props }) => {
  const spec = props.spec ?? SAMPLE_SPEC;
  let loaded = loadVideoSpec(spec);
  if (props.measuredAudio && Object.keys(props.measuredAudio).length > 0) {
    loaded = retimeBeats(loaded, props.measuredAudio);
  }
  return {
    durationInFrames: loaded.totalDurationFrames,
    fps: loaded.fps,
    width: 1920,
    height: 1080,
    props: { ...props, loaded, audioPrefix: props.audioPrefix ?? 'audio/spec/' },
  };
};

const SpecVideoBridge: React.FC<SpecCompositionProps> = (props) => {
  const loaded = props.loaded ?? loadVideoSpec(props.spec ?? SAMPLE_SPEC);
  return (
    <SpecVideo
      loaded={loaded}
      audioPrefix={props.audioPrefix ?? 'audio/spec/'}
      musicEnabled={props.musicEnabled}
    />
  );
};

export const SpecVideoComposition: React.FC = () => (
  <Composition
    id="spec-video"
    component={SpecVideoBridge}
    calculateMetadata={calculateMetadata}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={{ audioPrefix: 'audio/spec/' } as SpecCompositionProps}
  />
);
