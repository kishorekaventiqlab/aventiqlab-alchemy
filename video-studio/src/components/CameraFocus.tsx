import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

// A reusable "camera move" wrapper: scales and translates its children toward
// a focal point (expressed as a 0-1 fraction of the frame's width/height), so
// a beat can push in on the one detail the narration is pointing at instead of
// showing everything at a flat, static size the whole time.
//
// startFrame/holdFrame control the push-in timing *within the Sequence this is
// rendered inside* (i.e. already relative to the beat's own start): the zoom
// eases in between startFrame and holdFrame, then holds at targetScale.
export const CameraFocus: React.FC<{
  children: React.ReactNode;
  focalX: number; // 0-1, fraction of width
  focalY: number; // 0-1, fraction of height
  targetScale: number; // e.g. 1.35 for a 35% push-in
  startFrame?: number;
  holdFrame?: number;
}> = ({ children, focalX, focalY, targetScale, startFrame = 0, holdFrame = 30 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: frame - startFrame,
    fps,
    config: { damping: 200, mass: 0.8, stiffness: 90 },
    durationInFrames: Math.max(1, holdFrame - startFrame),
  });

  const scale = 1 + (targetScale - 1) * Math.min(1, Math.max(0, progress));

  return (
    <CameraFrame focalX={focalX} focalY={focalY} scale={scale}>
      {children}
    </CameraFrame>
  );
};

// The pure geometry half of CameraFocus, with no spring/timing logic of its
// own — for callers (like InvestigationScene) that already own a continuous,
// externally-driven scale/focal-point timeline and just need the transform
// math applied each frame without re-triggering an internal animation.
export const CameraFrame: React.FC<{
  children: React.ReactNode;
  focalX: number;
  focalY: number;
  scale: number;
}> = ({ children, focalX, focalY, scale }) => {
  const { width, height } = useVideoConfig();

  // With `transform-origin: center center`, scaling alone already zooms
  // toward the frame's center. To make it look like the camera is pushing in
  // on the focal point instead, shift the element (in its own untransformed
  // coordinate space, before scale is applied) from the frame's center toward
  // the focal point - the browser applies transform functions right-to-left,
  // so `scale(S) translate(x, y)` moves by (x, y) first, then scales the
  // whole (already-moved) result by S.
  const originX = width * focalX;
  const originY = height * focalY;
  const translateX = (width / 2 - originX) * (1 - 1 / scale);
  const translateY = (height / 2 - originY) * (1 - 1 / scale);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
        transformOrigin: 'center center',
      }}
    >
      {children}
    </div>
  );
};
