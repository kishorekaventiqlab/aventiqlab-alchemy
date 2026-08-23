import React from 'react';
import { Audio, Sequence, staticFile, interpolate } from 'remotion';

// One [startSeconds, endSeconds) window per stretch of continuous narration
// audio, scene-relative to the whole video (not per-beat) - used to duck
// the music bed under speech and let it rise during silent stretches (the
// title card, and any other narration-free gaps).
export type NarrationInterval = { startSeconds: number; endSeconds: number };

const DUCK_VOLUME = 0.35; // relative to the bed's own quiet baseline (bed is already mixed at -18dBFS)
const RAISED_VOLUME = 1.0;
const TRANSITION_SECONDS = 0.6; // fade time in/out of a duck, avoids an audible volume "pump"

const volumeAtSeconds = (tSec: number, narrationIntervals: NarrationInterval[]): number => {
  for (const { startSeconds, endSeconds } of narrationIntervals) {
    if (tSec >= startSeconds - TRANSITION_SECONDS && tSec <= endSeconds + TRANSITION_SECONDS) {
      if (tSec < startSeconds) {
        return interpolate(tSec, [startSeconds - TRANSITION_SECONDS, startSeconds], [RAISED_VOLUME, DUCK_VOLUME], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
      }
      if (tSec > endSeconds) {
        return interpolate(tSec, [endSeconds, endSeconds + TRANSITION_SECONDS], [DUCK_VOLUME, RAISED_VOLUME], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
      }
      return DUCK_VOLUME;
    }
  }
  return RAISED_VOLUME;
};

/**
 * A single looping background-music track for the whole video, volume-
 * automated (ducked) under narration. Deliberately generic: it takes
 * `narrationIntervals` and a track path, and knows nothing about beats,
 * captions, or which TTS engine produced the narration.
 *
 * Not built on Remotion's <Loop>: <Loop> resets its children's
 * useCurrentFrame()/volume-callback frame to 0 at every iteration (it's
 * implemented as nested <Sequence>s), which would make it impossible to
 * tell "is narration playing right now" from inside the volume callback -
 * that check needs the *global* timeline position, not a loop-local one.
 * Instead this manually tiles one <Sequence> per loop repetition and folds
 * each tile's own known offset into its volume callback, so every tile can
 * correctly compute "what's the real, whole-video second right now".
 */
export const BackgroundMusic: React.FC<{
  src: string;
  fps: number;
  totalDurationInFrames: number;
  narrationIntervals: NarrationInterval[];
  loopDurationInFrames: number;
}> = ({ src, fps, totalDurationInFrames, narrationIntervals, loopDurationInFrames }) => {
  const tileCount = Math.ceil(totalDurationInFrames / loopDurationInFrames);

  return (
    <>
      {Array.from({ length: tileCount }, (_, i) => {
        const tileStartFrame = i * loopDurationInFrames;
        const tileDuration = Math.min(loopDurationInFrames, totalDurationInFrames - tileStartFrame);
        if (tileDuration <= 0) return null;
        return (
          <Sequence key={i} from={tileStartFrame} durationInFrames={tileDuration}>
            <Audio
              src={staticFile(src)}
              volume={(localFrame) => volumeAtSeconds((tileStartFrame + localFrame) / fps, narrationIntervals)}
            />
          </Sequence>
        );
      })}
    </>
  );
};
