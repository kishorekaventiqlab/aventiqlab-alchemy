import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

// A second, contrastive demonstration: two requests side by side, animating
// their prefill (TTFT) and decode (total latency) bars growing in real time
// so "a long prompt costs TTFT, a long answer costs total latency" is
// something the viewer watches diverge, not just a sentence about it.
export type ContrastKeyframe = {
  t: number; // seconds, scene-relative
  leftPrefillMs: number;
  leftDecodeMs: number;
  rightPrefillMs: number;
  rightDecodeMs: number;
};

function sampleAt(keyframes: ContrastKeyframe[], tSec: number) {
  if (tSec <= keyframes[0].t) return { kf: keyframes[0], next: keyframes[0], p: 0 };
  const last = keyframes[keyframes.length - 1];
  if (tSec >= last.t) return { kf: last, next: last, p: 1 };
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (tSec >= a.t && tSec <= b.t) {
      const p = b.t === a.t ? 1 : (tSec - a.t) / (b.t - a.t);
      return { kf: a, next: b, p };
    }
  }
  return { kf: last, next: last, p: 1 };
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

const RequestColumn: React.FC<{
  label: string;
  sublabel: string;
  prefillMs: number;
  decodeMs: number;
  maxMs: number;
}> = ({ label, sublabel, prefillMs, decodeMs, maxMs }) => {
  const totalMs = prefillMs + decodeMs;
  const prefillPct = (prefillMs / maxMs) * 100;
  const decodePct = (decodeMs / maxMs) * 100;
  return (
    <div style={{ width: 560 }}>
      <div style={{ fontFamily: theme.fontFamily, fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: theme.fontFamily, fontSize: 15, color: theme.textDim, marginBottom: 14 }}>{sublabel}</div>
      <div style={{ display: 'flex', height: 46, borderRadius: 8, overflow: 'hidden', border: `1px solid ${theme.panelBorder}`, background: theme.panelBg }}>
        <div style={{ width: `${prefillPct}%`, background: theme.accent, transition: 'none' }} />
        <div style={{ width: `${decodePct}%`, background: theme.warning, transition: 'none' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: theme.monoFontFamily, fontSize: 15 }}>
        <span style={{ color: theme.accentStrong, fontWeight: 700 }}>TTFT {(prefillMs / 1000).toFixed(2)}s</span>
        <span style={{ color: theme.warning, fontWeight: 700 }}>total {(totalMs / 1000).toFixed(2)}s</span>
      </div>
    </div>
  );
};

export const LatencyContrastScene: React.FC<{
  fps: number;
  keyframes: ContrastKeyframe[];
}> = ({ fps, keyframes }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;
  const { kf, next, p } = sampleAt(keyframes, tSec);

  const leftPrefillMs = lerp(kf.leftPrefillMs, next.leftPrefillMs, p);
  const leftDecodeMs = lerp(kf.leftDecodeMs, next.leftDecodeMs, p);
  const rightPrefillMs = lerp(kf.rightPrefillMs, next.rightPrefillMs, p);
  const rightDecodeMs = lerp(kf.rightDecodeMs, next.rightDecodeMs, p);

  const maxMs = Math.max(
    ...keyframes.map((k) => Math.max(k.leftPrefillMs + k.leftDecodeMs, k.rightPrefillMs + k.rightDecodeMs)),
  );

  return (
    <div style={{ position: 'absolute', inset: 0, top: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 60 }}>
      <div style={{ display: 'flex', gap: 12, fontFamily: theme.fontFamily, fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
        <span style={{ color: theme.accent }}>■ Prefill (TTFT)</span>
        <span style={{ color: theme.warning }}>■ Decode (total latency)</span>
      </div>
      <RequestColumn
        label="Request A — a long document, a short answer"
        sublabel="Paste a 6,000-word contract, ask for a one-sentence summary"
        prefillMs={leftPrefillMs}
        decodeMs={leftDecodeMs}
        maxMs={maxMs}
      />
      <RequestColumn
        label="Request B — a short question, a long answer"
        sublabel="Ask for a detailed 1,500-word explanation of a short question"
        prefillMs={rightPrefillMs}
        decodeMs={rightDecodeMs}
        maxMs={maxMs}
      />
    </div>
  );
};
