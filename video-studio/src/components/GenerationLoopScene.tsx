import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { theme } from './theme';

// One continuous scene for "how an LLM generates text": prompt tokens
// arrive, PREFILL processes them all at once (parallel, compute-bound),
// then DECODE emits output tokens one at a time (sequential, memory-bound)
// with a running elapsed-time readout - so the prefill/decode asymmetry is
// something the viewer watches happen, not just a sentence they're told.
// Lives inside one <Sequence> in the composition (never split into several)
// so useCurrentFrame() never resets mid-animation, matching the pattern
// established in InvestigationScene.tsx for the same reason.

export type LoopKeyframe = {
  t: number; // seconds, scene-relative
  phase: 'idle' | 'prefill' | 'decode' | 'done';
  promptTokensLit: number; // how many of the prompt tokens are "processed" so far (0..promptTokens.length)
  outputTokensShown: number; // how many output tokens have been emitted so far
  elapsedMs: number; // the in-fiction "elapsed time" counter to display
  highlightKvCache?: boolean;
};

const PROMPT_TOKENS = ['Summar-', 'ise', ' this', ' contract', ' in', ' three', ' bullets'];
const OUTPUT_TOKENS = ['The', ' agreement', ' renews', ' annually', ',', ' caps', ' liability', ' at', ' $50', 'k', ',', ' and', ' requires', ' 30-day', ' notice', ' to', ' cancel', '.'];

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

const Token: React.FC<{ text: string; lit: boolean; mono?: boolean }> = ({ text, lit, mono }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '6px 10px',
      margin: '3px',
      borderRadius: 8,
      fontFamily: mono ? theme.monoFontFamily : theme.fontFamily,
      fontSize: 20,
      fontWeight: 600,
      background: lit ? theme.accent : theme.panelBg,
      color: lit ? '#ffffff' : theme.textDim,
      border: `1.5px solid ${lit ? theme.accent : theme.panelBorder}`,
      transition: 'none',
    }}
  >
    {text}
  </span>
);

export const GenerationLoopScene: React.FC<{
  fps: number;
  keyframes: LoopKeyframe[];
}> = ({ fps, keyframes }) => {
  const frame = useCurrentFrame();
  const tSec = frame / fps;
  const { kf, next, p } = sampleAt(keyframes, tSec);

  // Discrete fields snap at the boundary (no "half a token" state); numeric
  // fields (elapsed time) interpolate continuously so the counter visibly counts.
  const active = p < 1 ? kf : next;
  const promptLit = active.promptTokensLit;
  const outputShown = active.outputTokensShown;
  const phase = active.phase;
  const elapsedMs = kf.elapsedMs + (next.elapsedMs - kf.elapsedMs) * p;
  const showKv = Boolean(active.highlightKvCache);

  const phaseLabel =
    phase === 'prefill' ? 'PREFILL — processing the whole prompt in parallel' :
    phase === 'decode' ? 'DECODE — generating one token at a time' :
    phase === 'done' ? 'RESPONSE COMPLETE' : 'WAITING';

  const phaseColor = phase === 'prefill' ? theme.accent : phase === 'decode' ? theme.warning : phase === 'done' ? theme.success : theme.textDim;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Phase indicator + elapsed time */}
      <div style={{ position: 'absolute', top: 60, left: 60, right: 60, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            fontFamily: theme.fontFamily,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: phaseColor,
            background: theme.panelBg,
            border: `2px solid ${phaseColor}`,
            borderRadius: 12,
            padding: '10px 20px',
          }}
        >
          {phaseLabel}
        </div>
        <div
          style={{
            fontFamily: theme.monoFontFamily,
            fontSize: 28,
            fontWeight: 700,
            color: theme.text,
            background: theme.panelBg,
            border: `1px solid ${theme.panelBorder}`,
            borderRadius: 12,
            padding: '10px 20px',
          }}
        >
          {(elapsedMs / 1000).toFixed(2)}s elapsed
        </div>
      </div>

      {/* Prompt row */}
      <div style={{ position: 'absolute', top: 170, left: 60, right: 60 }}>
        <div style={{ fontFamily: theme.fontFamily, fontSize: 14, fontWeight: 700, letterSpacing: 1, color: theme.textDim, textTransform: 'uppercase', marginBottom: 8 }}>
          Prompt (processed all at once — prefill)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 1400 }}>
          {PROMPT_TOKENS.map((t, i) => (
            <Token key={i} text={t} lit={i < promptLit} mono />
          ))}
        </div>
      </div>

      {/* Output row */}
      <div style={{ position: 'absolute', top: 320, left: 60, right: 60 }}>
        <div style={{ fontFamily: theme.fontFamily, fontSize: 14, fontWeight: 700, letterSpacing: 1, color: theme.textDim, textTransform: 'uppercase', marginBottom: 8 }}>
          Output (generated one token at a time — decode)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 1400, minHeight: 120 }}>
          {OUTPUT_TOKENS.slice(0, outputShown).map((t, i) => (
            <Token key={i} text={t} lit={i === outputShown - 1 && phase === 'decode'} mono />
          ))}
          {phase === 'decode' && (
            <span
              style={{
                display: 'inline-block',
                width: 3,
                height: 28,
                margin: '6px 4px',
                background: theme.warning,
                opacity: 0.5 + 0.5 * Math.sin(frame / 3),
              }}
            />
          )}
        </div>
      </div>

      {/* KV cache callout */}
      {showKv && (
        <div
          style={{
            position: 'absolute',
            top: 500,
            left: 60,
            right: 60,
            background: theme.panelBg,
            border: `2px solid ${theme.accent}`,
            borderRadius: 12,
            padding: '18px 24px',
            fontFamily: theme.fontFamily,
            fontSize: 18,
            color: theme.text,
            maxWidth: 1200,
          }}
        >
          <span style={{ fontWeight: 700, color: theme.accentStrong }}>KV cache: </span>
          each new token reuses the cached key/value vectors of every previous token instead of
          reprocessing the whole sequence — this is what makes decode affordable at all.
        </div>
      )}

      {/* Latency bar comparing this response's length to a longer one */}
      {phase === 'done' && (
        <div style={{ position: 'absolute', top: 620, left: 60, right: 60 }}>
          <div style={{ fontFamily: theme.fontFamily, fontSize: 14, fontWeight: 700, letterSpacing: 1, color: theme.textDim, textTransform: 'uppercase', marginBottom: 12 }}>
            Decode time scales with output length — not with how many GPUs you add
          </div>
          <BarRow label={`${OUTPUT_TOKENS.length} tokens (this response)`} widthPct={25} color={theme.accent} value={`${(elapsedMs / 1000).toFixed(2)}s`} />
          <BarRow label="500 tokens" widthPct={45} color={theme.warning} value="~2.1s" />
          <BarRow label="2,000 tokens" widthPct={100} color={theme.danger} value="~8.4s" />
        </div>
      )}
    </div>
  );
};

const BarRow: React.FC<{ label: string; widthPct: number; color: string; value: string }> = ({ label, widthPct, color, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
    <div style={{ width: 260, fontFamily: theme.fontFamily, fontSize: 16, color: theme.text, fontWeight: 600 }}>{label}</div>
    <div style={{ flex: 1, height: 28, background: theme.panelBorder, borderRadius: 6, overflow: 'hidden', maxWidth: 700 }}>
      <div style={{ width: `${widthPct}%`, height: '100%', background: color, borderRadius: 6 }} />
    </div>
    <div style={{ width: 80, fontFamily: theme.monoFontFamily, fontSize: 16, fontWeight: 700, color }}>{value}</div>
  </div>
);
