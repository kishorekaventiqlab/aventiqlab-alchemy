import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

// The single persistent visual anchor for "How an LLM Generates Text".
// Lives inside ONE continuous <Sequence> spanning nearly the whole video
// (mirroring the rule already established for GenerationLoopScene /
// InvestigationScene: never split a running animation into per-beat
// Sequences, or useCurrentFrame() resets and the motion stutters). Every
// beat instead supplies a `stage` + small stage-specific numbers, so the
// viewer is always looking at the same four boxes (PROMPT -> PREFILL ->
// DECODE loop -> OUTPUT) evolving, rather than a new full-screen slide per
// sentence - directly addressing "I can't recall what I watched and
// connect it to the present."

export type Stage =
  | 'idle'
  | 'prefillFlow'
  | 'decodeLoop'
  | 'logitsSoftmax'
  | 'compare'
  | 'tradeoff'
  | 'batching'
  | 'kvCache'
  | 'determinism';

export type DiagramKeyframe = {
  t: number; // seconds, scene-relative to the whole pipeline sequence
  stage: Stage;
  // Stage-specific numeric drivers, all optional & defaulted so callers
  // only set what a given stage needs.
  promptTokensLit?: number; // 0..7, prefillFlow
  decodeTokenIndex?: number; // 0..N, decodeLoop / logitsSoftmax / kvCache
  batchLanes?: number; // 1..64(displayed capped), batching
  kvBarPct?: number; // 0..100, kvCache "linear vs quadratic" bar
  quadBarPct?: number; // 0..100, kvCache
  sampledTokenLabel?: string; // determinism
  diceRoll?: number; // 0..1, determinism (drives a little spin)
};

const PROMPT_TOKENS = ['The', ' agree-', 'ment', ' renews', ' every', ' year', '.'];
const DECODE_TOKENS = ['It', ' auto', '-renews', ' annually', ' unless', ' cancelled', '.'];

function sampleAt<T extends { t: number }>(keyframes: T[], tSec: number): { kf: T; next: T; p: number } {
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

const Box: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sublabel?: string;
  active: boolean;
  color?: string;
  dashed?: boolean;
  labelAtTop?: boolean;
}> = ({ x, y, w, h, label, sublabel, active, color = theme.accent, dashed, labelAtTop }) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      height: h,
      borderRadius: 14,
      border: `2.5px ${dashed ? 'dashed' : 'solid'} ${active ? color : theme.panelBorder}`,
      background: active ? `${color}14` : theme.panelBg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: labelAtTop ? 'flex-start' : 'center',
      paddingTop: labelAtTop ? 14 : 0,
      gap: 4,
      boxShadow: active ? `0 6px 20px ${color}33` : '0 2px 8px rgba(16,24,40,0.06)',
    }}
  >
    <div style={{ fontFamily: theme.fontFamily, fontWeight: 700, fontSize: labelAtTop ? 16 : 20, color: active ? color : theme.textDim, letterSpacing: 0.5 }}>
      {label}
    </div>
    {sublabel && (
      <div style={{ fontFamily: theme.fontFamily, fontWeight: 500, fontSize: 13, color: theme.textDim, textAlign: 'center', maxWidth: w - 24 }}>
        {sublabel}
      </div>
    )}
  </div>
);

const FlowDot: React.FC<{ x0: number; y0: number; x1: number; y1: number; phase: number; color: string }> = ({ x0, y0, x1, y1, phase, color }) => {
  const p = ((phase % 1) + 1) % 1;
  const x = lerp(x0, x1, p);
  const y = lerp(y0, y1, p);
  return <div style={{ position: 'absolute', left: x - 5, top: y - 5, width: 10, height: 10, borderRadius: 5, background: color }} />;
};

const Arrow: React.FC<{ x0: number; y0: number; x1: number; y1: number; active: boolean; color?: string }> = ({ x0, y0, x1, y1, active, color = theme.textDim }) => {
  const angle = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
  const len = Math.hypot(x1 - x0, y1 - y0);
  return (
    <div
      style={{
        position: 'absolute',
        left: x0,
        top: y0,
        width: len,
        height: 0,
        borderTop: `2.5px solid ${active ? theme.accent : color}`,
        transform: `rotate(${angle}deg)`,
        transformOrigin: '0 0',
        opacity: active ? 1 : 0.5,
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -2,
          top: -6,
          width: 0,
          height: 0,
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderLeft: `10px solid ${active ? theme.accent : color}`,
        }}
      />
    </div>
  );
};

// Layout constants (1920x1080 canvas, diagram occupies the upper 2/3 so a
// caption strip always has room below it without ever overlapping).
const PROMPT_X = 90, PROMPT_Y = 130, PROMPT_W = 260, PROMPT_H = 90;
const PREFILL_X = 460, PREFILL_Y = 130, PREFILL_W = 300, PREFILL_H = 90;
const DECODE_X = 900, DECODE_Y = 90, DECODE_W = 340, DECODE_H = 210;
const LOGITS_X = 940, LOGITS_Y = 148, LOGITS_W = 120, LOGITS_H = 46;
const SOFTMAX_X = 1090, SOFTMAX_Y = 148, SOFTMAX_W = 130, SOFTMAX_H = 46;
const SAMPLE_X = 1015, SAMPLE_Y = 216, SAMPLE_W = 150, SAMPLE_H = 46;
const OUTPUT_X = 1350, OUTPUT_Y = 130, OUTPUT_W = 480, OUTPUT_H = 90;
const KV_X = 660, KV_Y = 330, KV_W = 340, KV_H = 70;

export const PipelineDiagram: React.FC<{
  fps: number;
  keyframes: DiagramKeyframe[];
}> = ({ fps, keyframes }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;
  const { kf, next, p } = sampleAt(keyframes, tSec);
  const stage = p < 1 ? kf.stage : next.stage;

  const promptLit = Math.round(lerp(kf.promptTokensLit ?? 0, next.promptTokensLit ?? kf.promptTokensLit ?? 0, p));
  const decodeIdx = Math.round(lerp(kf.decodeTokenIndex ?? 0, next.decodeTokenIndex ?? kf.decodeTokenIndex ?? 0, p));
  const batchLanes = Math.round(lerp(kf.batchLanes ?? 1, next.batchLanes ?? kf.batchLanes ?? 1, p));
  const kvBarPct = lerp(kf.kvBarPct ?? 0, next.kvBarPct ?? kf.kvBarPct ?? 0, p);
  const quadBarPct = lerp(kf.quadBarPct ?? 0, next.quadBarPct ?? kf.quadBarPct ?? 0, p);
  const diceRoll = lerp(kf.diceRoll ?? 0, next.diceRoll ?? kf.diceRoll ?? 0, p);
  const sampledTokenLabel = (p < 1 ? kf.sampledTokenLabel : next.sampledTokenLabel) ?? kf.sampledTokenLabel;

  const prefillActive = stage === 'prefillFlow' || stage === 'compare' || stage === 'tradeoff';
  const decodeActive = stage === 'decodeLoop' || stage === 'logitsSoftmax' || stage === 'batching' || stage === 'kvCache' || stage === 'determinism' || stage === 'compare' || stage === 'tradeoff';
  const decodeDetailActive = stage === 'logitsSoftmax' || stage === 'determinism';
  const kvActive = stage === 'kvCache';
  const showBatching = stage === 'batching';

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'relative', width: 1920, height: 760 }}>
        {/* Static pipeline skeleton, always present once we've entered the diagram */}
        <Box x={PROMPT_X} y={PROMPT_Y} w={PROMPT_W} h={PROMPT_H} label="PROMPT" sublabel="your input text" active={stage !== 'idle'} color={theme.textDim} />
        <Arrow x0={PROMPT_X + PROMPT_W} y0={PROMPT_Y + PROMPT_H / 2} x1={PREFILL_X} y1={PREFILL_Y + PREFILL_H / 2} active={prefillActive} />
        <Box x={PREFILL_X} y={PREFILL_Y} w={PREFILL_W} h={PREFILL_H} label="PREFILL" sublabel="whole prompt, one parallel pass" active={prefillActive} color={theme.accent} />

        {/* Parallel flow dots during prefill: several dots moving in lockstep = "all at once" */}
        {stage === 'prefillFlow' &&
          [0, 0.15, 0.3, 0.45].map((offset, i) => (
            <FlowDot key={i} x0={PROMPT_X + PROMPT_W} y0={PROMPT_Y + 20 + i * 18} x1={PREFILL_X} y1={PREFILL_Y + 20 + i * 18} phase={tSec * 0.8 + offset} color={theme.accent} />
          ))}

        <Arrow x0={PREFILL_X + PREFILL_W} y0={PREFILL_Y + PREFILL_H / 2} x1={DECODE_X} y1={DECODE_Y + DECODE_H / 2} active={decodeActive} />

        {/* DECODE loop box */}
        <Box
          x={DECODE_X}
          y={DECODE_Y}
          w={DECODE_W}
          h={DECODE_H}
          label="DECODE"
          sublabel={decodeDetailActive ? undefined : 'one token at a time, sequential'}
          active={decodeActive}
          color={theme.warning}
          labelAtTop={decodeDetailActive}
        />

        {decodeDetailActive && (
          <>
            <Box x={LOGITS_X} y={LOGITS_Y} w={LOGITS_W} h={LOGITS_H} label="LOGITS" active={decodeDetailActive} color={theme.warning} />
            <Arrow x0={LOGITS_X + LOGITS_W} y0={LOGITS_Y + LOGITS_H / 2} x1={SOFTMAX_X} y1={SOFTMAX_Y + SOFTMAX_H / 2} active={decodeDetailActive} />
            <Box x={SOFTMAX_X} y={SOFTMAX_Y} w={SOFTMAX_W} h={SOFTMAX_H} label="SOFTMAX" active={decodeDetailActive} color={theme.warning} />
            <Arrow x0={SOFTMAX_X + SOFTMAX_W / 2} y0={SOFTMAX_Y + SOFTMAX_H} x1={SAMPLE_X + SAMPLE_W / 2} y1={SAMPLE_Y} active={decodeDetailActive} />
            <Box
              x={SAMPLE_X}
              y={SAMPLE_Y}
              w={SAMPLE_W}
              h={SAMPLE_H}
              label="SAMPLE"
              active={decodeDetailActive}
              color={stage === 'determinism' ? theme.danger : theme.warning}
            />
            {stage === 'determinism' && (
              <div
                style={{
                  position: 'absolute',
                  left: SAMPLE_X + SAMPLE_W + 24,
                  top: SAMPLE_Y - 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  maxWidth: OUTPUT_X - (SAMPLE_X + SAMPLE_W) - 40,
                }}
              >
                <div
                  style={{
                    fontSize: 22,
                    flexShrink: 0,
                    transform: `rotate(${Math.sin(diceRoll * Math.PI * 2) * 25}deg)`,
                    display: 'inline-block',
                  }}
                >
                  🎲
                </div>
                <div style={{ fontFamily: theme.monoFontFamily, fontSize: 15, fontWeight: 700, color: theme.danger, opacity: 0.9, lineHeight: 1.3 }}>
                  {sampledTokenLabel ? `→ "${sampledTokenLabel}"` : ''}
                </div>
              </div>
            )}
          </>
        )}

        <Arrow x0={DECODE_X + DECODE_W} y0={DECODE_Y + DECODE_H / 2} x1={OUTPUT_X} y1={OUTPUT_Y + OUTPUT_H / 2} active={decodeActive} />
        <Box x={OUTPUT_X} y={OUTPUT_Y} w={OUTPUT_W} h={OUTPUT_H} label="OUTPUT" sublabel="streams back one token at a time" active={decodeActive} color={theme.success} />

        {/* Loop-back arrow: decode checks stop condition, loops to itself */}
        {decodeActive && !showBatching && !kvActive && (
          <>
            <svg style={{ position: 'absolute', left: DECODE_X - 10, top: DECODE_Y + DECODE_H, width: DECODE_W + 20, height: 44, overflow: 'visible' }}>
              <path
                d={`M ${DECODE_W + 10} 0 C ${DECODE_W + 60} 34, -40 34, 10 0`}
                fill="none"
                stroke={theme.warning}
                strokeWidth={2.5}
                opacity={0.7}
              />
            </svg>
            <div style={{ position: 'absolute', left: DECODE_X + DECODE_W / 2 - 60, top: DECODE_Y + DECODE_H + 44, fontFamily: theme.fontFamily, fontSize: 12, fontWeight: 700, color: theme.warning, letterSpacing: 0.5 }}>
              loop until stop
            </div>
          </>
        )}

        {/* Output token strip, grows during decodeLoop/logitsSoftmax/kvCache/determinism */}
        {decodeActive && (
          <div style={{ position: 'absolute', left: OUTPUT_X, top: OUTPUT_Y + OUTPUT_H + 16, width: OUTPUT_W, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {DECODE_TOKENS.slice(0, decodeIdx).map((t, i) => (
              <span
                key={i}
                style={{
                  fontFamily: theme.monoFontFamily,
                  fontSize: 16,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: i === decodeIdx - 1 ? theme.success : `${theme.success}22`,
                  color: i === decodeIdx - 1 ? '#fff' : theme.success,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Prompt tokens lighting up during prefillFlow */}
        {stage === 'prefillFlow' && (
          <div style={{ position: 'absolute', left: PROMPT_X, top: PROMPT_Y + PROMPT_H + 16, width: PROMPT_W + 60, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {PROMPT_TOKENS.map((t, i) => (
              <span
                key={i}
                style={{
                  fontFamily: theme.monoFontFamily,
                  fontSize: 15,
                  fontWeight: 600,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: i < promptLit ? theme.accent : theme.panelBorder,
                  color: i < promptLit ? '#fff' : theme.textDim,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        )}

        {/* Batching lanes: multiple decode requests sharing one GPU pass */}
        {showBatching && (
          <div style={{ position: 'absolute', left: DECODE_X - 40, top: DECODE_Y + DECODE_H + 60, width: DECODE_W + 400 }}>
            <div style={{ fontFamily: theme.fontFamily, fontSize: 13, fontWeight: 700, color: theme.textDim, letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>
              {batchLanes} concurrent request{batchLanes === 1 ? '' : 's'} sharing this same GPU pass
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: 700 }}>
              {Array.from({ length: Math.min(batchLanes, 64) }, (_, i) => (
                <div key={i} style={{ width: 14, height: 14, borderRadius: 3, background: theme.accent, opacity: 0.85 }} />
              ))}
            </div>
          </div>
        )}

        {/* KV cache attachment on the Decode box */}
        {kvActive && (
          <>
            <Arrow x0={DECODE_X + DECODE_W / 2} y0={DECODE_Y + DECODE_H} x1={KV_X + KV_W / 2} y1={KV_Y} active color={theme.accent} />
            <Box x={KV_X} y={KV_Y} w={KV_W} h={KV_H} label="KV CACHE" sublabel="reused every step, not recomputed" active color={theme.accent} />
            <div style={{ position: 'absolute', left: KV_X + KV_W + 40, top: KV_Y - 10, width: 420 }}>
              <div style={{ fontFamily: theme.fontFamily, fontSize: 13, fontWeight: 700, color: theme.danger, marginBottom: 4 }}>Without cache — quadratic</div>
              <div style={{ height: 16, background: theme.panelBorder, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ width: `${quadBarPct}%`, height: '100%', background: theme.danger }} />
              </div>
              <div style={{ fontFamily: theme.fontFamily, fontSize: 13, fontWeight: 700, color: theme.success, marginBottom: 4 }}>With KV cache — linear</div>
              <div style={{ height: 16, background: theme.panelBorder, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${kvBarPct}%`, height: '100%', background: theme.success }} />
              </div>
            </div>
          </>
        )}

        {/* Prefill / Decode contrast labels for the "compare" and "tradeoff" stages */}
        {(stage === 'compare' || stage === 'tradeoff') && (
          <>
            <div style={{ position: 'absolute', left: PREFILL_X, top: PREFILL_Y - 46, fontFamily: theme.fontFamily, fontSize: 14, fontWeight: 700, color: theme.accent }}>
              parallel · compute-bound · sets TTFT
            </div>
            <div style={{ position: 'absolute', left: DECODE_X, top: DECODE_Y - 46, fontFamily: theme.fontFamily, fontSize: 14, fontWeight: 700, color: theme.warning }}>
              sequential · memory-bound · sets total latency
            </div>
          </>
        )}
      </div>
    </div>
  );
};
