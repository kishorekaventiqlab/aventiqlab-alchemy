// Source of truth: "How an LLM Generates Text" (§3 of the Generative AI Deep Dive,
// /Users/kishorekumarojha/Documents/AI-ML_PlatformArchitect_2026/learning/week-01/day-02/
// Generative AI Deep Dive/deep-dive-generative-ai.md) - an external source document, read
// but never modified. This script adapts §3.1-3.3 (the generation loop, prefill vs decode,
// why output isn't deterministic) into the ten-stage reasoning spine from
// docs/video-artifact-constitution.md, expanded to a ~10 minute run time.
//
// If you edit the narration, regenerate audio with
// `npm run generate:audio -- howLlmsGenerateTextScript` (Chatterbox V3, local/offline), then
// update this file's start/duration values to match each beat's new measured audio length
// + a ~3s buffer (see public/audio/howLlmsGenerateTextScript/howLlmsGenerateTextScript.manifest.json
// after regenerating).
import type { CompareOption } from './inferenceUnderLoadScript';
import type { LoopKeyframe } from '../components/GenerationLoopScene';
import type { ContrastKeyframe } from '../components/LatencyContrastScene';
import type { DiagramKeyframe } from '../components/PipelineDiagram';

export const FPS = 30;

export type Beat =
  | {
      type: 'title';
      start: number;
      duration: number;
      title: string;
      subtitle: string;
      audioFile?: string;
    }
  | {
      // Problem / Stakes / Curiosity / Decision / Best Practice: one landed sentence.
      type: 'statement';
      start: number;
      duration: number;
      caption: string;
      eyebrow: string;
      eyebrowColor?: 'accent' | 'danger' | 'warning' | 'success';
      statement: string;
      support?: string;
      audioFile?: string;
    }
  | {
      // Options / Trade-offs: a 2-3 column comparison of named approaches.
      type: 'optionsCompare';
      start: number;
      duration: number;
      caption: string;
      options: CompareOption[];
      audioFile?: string;
    }
  | {
      // Investigation/Demonstration: the continuous prefill->decode animation.
      type: 'generationLoop';
      start: number;
      duration: number;
      keyframes: LoopKeyframe[];
      segments: { t: number; caption: string; audioFile: string }[];
    }
  | {
      // Context/Mental-model through Best-practice: the ONE persistent
      // pipeline diagram (PipelineDiagram.tsx), evolving continuously across
      // many narration segments instead of resetting per beat - this is the
      // fix for "I can't recall what I watched and connect it to the
      // present": every one of these segments is a state of the SAME
      // diagram, never a new full-screen slide.
      type: 'diagram';
      start: number;
      duration: number;
      keyframes: DiagramKeyframe[];
      segments: { t: number; caption: string; audioFile: string }[];
    }
  | {
      // Investigation/Demonstration (second worked example): TTFT vs total
      // latency diverging across two contrasting requests.
      type: 'latencyContrast';
      start: number;
      duration: number;
      caption: string;
      keyframes: ContrastKeyframe[];
      audioFile?: string;
    }
  | {
      type: 'recap';
      start: number;
      duration: number;
      caption: string;
      items: string[];
      audioFile?: string;
    };

export const howLlmsGenerateTextScript: Beat[] = [
  {
    type: 'title',
    start: 0,
    duration: 8,
    title: 'How an LLM Generates Text',
    subtitle: 'Why the first word takes a beat, and then the rest come one at a time',
  },

  // ===== STAGE 1: PROBLEM =====
  {
    type: 'statement',
    start: 8.0,
    duration: 14.9,
    audioFile: 'beat2.wav',
    eyebrow: 'The problem',
    eyebrowColor: 'danger',
    statement: 'You send a prompt to an LLM, and the response streams back one word at a time.',
    support: 'The first word takes a moment. Then the rest arrive in a steady rhythm.',
    caption:
      "You send a prompt to an LLM, and the response streams back one word at a time. The first word takes a moment to appear on screen. Then the rest of the answer arrives in a steady, almost mechanical rhythm — word, word, word.",
  },
  {
    type: 'statement',
    start: 22.9,
    duration: 14.2,
    audioFile: 'beat3.wav',
    eyebrow: 'The problem',
    eyebrowColor: 'danger',
    statement: 'Most engineers can describe this from the outside. Almost none can explain why it happens.',
    caption:
      "Most engineers can describe this behavior perfectly from the outside — the little pause, then the streaming text. Almost none of them can explain, mechanically, why it happens that way and not some other way.",
  },

  // ===== STAGE 2: STAKES =====
  {
    type: 'statement',
    start: 37.1,
    duration: 19.6,
    audioFile: 'beat4.wav',
    eyebrow: 'Why it matters',
    eyebrowColor: 'warning',
    statement: 'This exact mechanism decides your API latency, your bill, and why more GPUs don’t make one answer arrive faster.',
    support: 'Get this wrong and you’ll optimize the wrong thing when a request feels slow.',
    caption:
      "This isn't just curiosity. This exact mechanism decides your API latency, decides your bill down to the token, and explains why throwing more GPUs at a slow request doesn't make that one single answer arrive any faster. Get this wrong, and you'll spend an incident optimizing the wrong thing.",
  },
  {
    type: 'statement',
    start: 56.7,
    duration: 17.9,
    audioFile: 'beat5.wav',
    eyebrow: 'Why it matters',
    eyebrowColor: 'warning',
    statement: 'A platform engineer who understands this can diagnose a slow LLM call in thirty seconds. One who doesn’t will guess for an hour.',
    caption:
      "A platform engineer who actually understands this can look at a slow LLM call and diagnose it in about thirty seconds. An engineer who doesn't will guess — tune the wrong Kubernetes parameter, add pods that don't help, and burn an hour before circling back to the real cause.",
  },

  // ===== STAGE 3: CURIOSITY =====
  {
    type: 'statement',
    start: 74.6,
    duration: 13.0,
    audioFile: 'beat6.wav',
    eyebrow: 'The question',
    eyebrowColor: 'accent',
    statement: 'The model reads your whole prompt instantly. So why does it then crawl, one word at a time?',
    caption:
      "Here's the confusing part. The model reads and understands your entire prompt almost instantly, no matter how long it is. So why does it then crawl, producing the response one single word at a time?",
  },
  {
    type: 'statement',
    start: 87.6,
    duration: 13.7,
    audioFile: 'beat7.wav',
    eyebrow: 'The question',
    eyebrowColor: 'accent',
    statement: 'It isn’t reading and writing with the same mechanism. It just looks that way from the outside.',
    caption:
      "The intuitive guess is that reading and writing are the same kind of work, just running at different speeds. That guess is wrong — and the answer is the single most operationally important fact about LLM inference there is.",
  },

  // ===== STAGE 4-6+9: CONTEXT / MENTAL MODEL / OPTIONS / TRADE-OFFS / BEST PRACTICE =====
  // ONE continuous diagram beat (PipelineDiagram.tsx) replacing 8 separate
  // static "statement" screens. The viewer watches the SAME four-box
  // pipeline evolve: prefill flow -> decode loop -> zoomed logits/softmax/
  // sample -> prefill-vs-decode contrast -> batching lanes -> KV cache ->
  // sampling/determinism - instead of a new blank slide fading in per
  // sentence. Segment audio/captions are unchanged from the prior cut
  // (same beat8.wav..beat16.wav files), so no re-synthesis is needed.
  {
    type: 'diagram',
    start: 101.3,
    duration: 178.5,
    keyframes: [
      { t: 0, stage: 'idle' },
      { t: 3, stage: 'prefillFlow', promptTokensLit: 0 },
      { t: 6, stage: 'prefillFlow', promptTokensLit: 7 },
      { t: 22.5, stage: 'decodeLoop', decodeTokenIndex: 1 },
      { t: 30, stage: 'decodeLoop', decodeTokenIndex: 3 },
      { t: 42.5, stage: 'logitsSoftmax', decodeTokenIndex: 4 },
      { t: 62.5, stage: 'compare', decodeTokenIndex: 4 },
      { t: 81.2, stage: 'compare', decodeTokenIndex: 5 },
      { t: 96.3, stage: 'tradeoff', decodeTokenIndex: 5 },
      { t: 114.5, stage: 'batching', batchLanes: 1, decodeTokenIndex: 5 },
      { t: 123, stage: 'batching', batchLanes: 1, decodeTokenIndex: 5 },
      { t: 128, stage: 'batching', batchLanes: 64, decodeTokenIndex: 6 },
      { t: 137.4, stage: 'batching', batchLanes: 64, decodeTokenIndex: 6 },
      { t: 155.5, stage: 'kvCache', decodeTokenIndex: 6, quadBarPct: 15, kvBarPct: 15 },
      { t: 161, stage: 'kvCache', decodeTokenIndex: 6, quadBarPct: 92, kvBarPct: 18 },
      { t: 178.5, stage: 'kvCache', decodeTokenIndex: 7, quadBarPct: 96, kvBarPct: 34 },
    ],
    segments: [
      {
        t: 0,
        audioFile: 'beat8.wav',
        caption:
          "Here's the mental model. Generating text from an LLM is a loop, not a single operation. First, prefill processes your whole prompt, one time. Then decode generates one token, checks whether to stop — and if not, loops back and generates the next one. Prefill happens exactly once. Decode happens once for every single output token.",
      },
      {
        t: 22.5,
        audioFile: 'beat9.wav',
        caption:
          "Zoom into a single decode step. The model produces a raw score — a logit — for every token in its vocabulary, often over a hundred thousand of them. Softmax turns those logits into probabilities that sum to one. Then a sampling step picks exactly one token from that distribution, and it gets appended to the sequence.",
      },
      {
        t: 42.5,
        audioFile: 'beat10.wav',
        caption:
          "Prefill and decode are not the same workload wearing two names. Prefill processes every prompt token in parallel — it's compute-bound, and it determines time to first token. Decode generates one token at a time, strictly sequential — it's memory-bandwidth-bound, and it determines time per output token.",
      },
      {
        t: 61.2,
        audioFile: 'beat11.wav',
        caption:
          "So a long prompt costs you time to first token — caching the prompt fixes that. A long answer costs you total latency — asking for brevity fixes that instead. They are genuinely different problems, and fixing one does nothing for the other.",
      },
      {
        t: 76.3,
        audioFile: 'beat12.wav',
        caption:
          "And decode cannot be parallelised within a single response. Adding more GPUs increases throughput — how many concurrent users you can serve — but not the speed of any one answer. A two-thousand-token response takes roughly four times as long as a five-hundred-token one, and no amount of extra hardware changes that.",
      },
      {
        t: 94.5,
        audioFile: 'beat13.wav',
        caption:
          "This memory-bound nature of decode has a strange, useful consequence. At batch size one, the GPU loads every weight from memory just to compute one tiny multiplication — it's bandwidth-bound, with most of its compute sitting idle. At batch size sixty-four, those same weights get loaded once and reused across all sixty-four sequences, so the same hardware becomes compute-bound instead.",
      },
      {
        t: 117.4,
        audioFile: 'beat14.wav',
        caption:
          "That single shift, from mostly-idle to mostly-busy, is why continuous batching gives five to twenty times more throughput on the same GPUs, with no change to the model at all. It's a direct, mechanical consequence of decode being memory-bound in the first place — not a separate trick.",
      },
      {
        t: 135.5,
        audioFile: 'beat15.wav',
        caption:
          "One more piece of the mental model, worth slowing down for. Without a cache, generating token number five hundred would mean reprocessing all four hundred and ninety-nine tokens before it, from scratch, every single time — a cost that grows quadratically with sequence length. That would make long conversations essentially unusable.",
      },
      {
        t: 154.5,
        audioFile: 'beat16.wav',
        caption:
          "The KV cache is what turns that quadratic cost into a linear one. Every decode step reuses the already-computed key and value vectors of every prior token, and only does the work for the one new token being generated. This single piece of engineering is the reason decode is affordable at all, and it's why context length has a real memory cost attached to it — that cache has to live in GPU memory for as long as the conversation does.",
      },
    ],
  },

  // ===== STAGE 7: INVESTIGATION / DEMONSTRATION =====
  // One continuous scene (GenerationLoopScene.tsx): prompt tokens light up
  // together during prefill, then output tokens appear one at a time during
  // decode with a running elapsed-time counter, a KV-cache callout, and a
  // closing bar chart showing decode time scaling linearly with length.
  {
    type: 'generationLoop',
    start: 279.8,
    duration: 92.1,
    keyframes: [
      { t: 0, phase: 'idle', promptTokensLit: 0, outputTokensShown: 0, elapsedMs: 0 },
      { t: 3, phase: 'prefill', promptTokensLit: 3, outputTokensShown: 0, elapsedMs: 20 },
      { t: 6.5, phase: 'prefill', promptTokensLit: 7, outputTokensShown: 0, elapsedMs: 60 },
      { t: 15.6, phase: 'prefill', promptTokensLit: 7, outputTokensShown: 0, elapsedMs: 340 },
      { t: 17.3, phase: 'decode', promptTokensLit: 7, outputTokensShown: 1, elapsedMs: 360, highlightKvCache: true },
      { t: 24.4, phase: 'decode', promptTokensLit: 7, outputTokensShown: 3, elapsedMs: 560, highlightKvCache: true },
      { t: 34.5, phase: 'decode', promptTokensLit: 7, outputTokensShown: 6, elapsedMs: 880, highlightKvCache: true },
      { t: 41.4, phase: 'decode', promptTokensLit: 7, outputTokensShown: 9, elapsedMs: 1180 },
      { t: 51.6, phase: 'decode', promptTokensLit: 7, outputTokensShown: 13, elapsedMs: 1520 },
      { t: 63.7, phase: 'decode', promptTokensLit: 7, outputTokensShown: 17, elapsedMs: 1820 },
      { t: 66.7, phase: 'done', promptTokensLit: 7, outputTokensShown: 17, elapsedMs: 1860 },
      { t: 92.1, phase: 'done', promptTokensLit: 7, outputTokensShown: 17, elapsedMs: 1860 },
    ],
    segments: [
      {
        t: 0,
        audioFile: 'beat17.wav',
        caption:
          "Let's watch it happen, one real request at a time. Summarise this contract in three bullets — that's the prompt.",
      },
      {
        t: 7.8,
        audioFile: 'beat18.wav',
        caption:
          "Watch the prompt tokens. All seven of them light up together — not one after another. That's prefill: the entire prompt processed in one parallel pass, because every token's relationship to every other token can be computed simultaneously.",
      },
      {
        t: 21.8,
        audioFile: 'beat19.wav',
        caption:
          "Now decode begins, and the rhythm changes completely. One token at a time. Each one needs a full forward pass through every layer of the model before the next token can even start — and each step reuses the cached key and value vectors of every token before it, instead of reprocessing the whole sequence from scratch. That cache is what makes this affordable at all.",
      },
      {
        t: 40.4,
        audioFile: 'beat20.wav',
        caption:
          "Notice the pace holding steady — not speeding up, not slowing down. It can't speed up, because token number twelve genuinely cannot exist before token number eleven does. This is strictly sequential. There is no shortcut, no matter how much compute you throw at it.",
      },
      {
        t: 55.0,
        audioFile: 'beat21.wav',
        caption:
          "We're most of the way through now. Notice something else: nothing about the prompt is being touched again. All of that work happened once, at the very beginning, during prefill. Everything since has been pure decode.",
      },
      {
        t: 66.7,
        audioFile: 'beat22.wav',
        caption:
          "And there's the finished response. This one took under two seconds. Here's the part that actually surprises people: a five-hundred-token response takes roughly four times as long as this one. A two-thousand-token response takes roughly sixteen times as long. That scaling is linear with output length — and it holds no matter how many GPUs are behind the model, because decode within one response can never be parallelised.",
      },
    ],
  },
  {
    type: 'latencyContrast',
    start: 371.9,
    duration: 43.0,
    audioFile: 'beat23.wav',
    caption:
      "One more comparison makes this concrete. Request A pastes a six-thousand-word contract and asks for a one-sentence summary — a huge prompt, a tiny answer. Request B asks a short question and asks for a detailed, fifteen-hundred-word explanation — a tiny prompt, a huge answer. Watch what happens to each one's two bars. Request A's blue prefill bar is long — that's your time to first token, dominated by processing all that pasted text. Its orange decode bar is short, because the answer itself is one sentence. Request B is the mirror image: a short blue bar, because the prompt was short, and a long orange bar, because generating fifteen hundred tokens one at a time simply takes a while. Same model. Same GPU. Two completely different latency profiles, for two completely mechanical reasons.",
    keyframes: [
      { t: 0, leftPrefillMs: 0, leftDecodeMs: 0, rightPrefillMs: 0, rightDecodeMs: 0 },
      { t: 6, leftPrefillMs: 0, leftDecodeMs: 0, rightPrefillMs: 0, rightDecodeMs: 0 },
      { t: 16, leftPrefillMs: 2400, leftDecodeMs: 0, rightPrefillMs: 180, rightDecodeMs: 0 },
      { t: 27, leftPrefillMs: 2400, leftDecodeMs: 220, rightPrefillMs: 180, rightDecodeMs: 3600 },
      { t: 43, leftPrefillMs: 2400, leftDecodeMs: 220, rightPrefillMs: 180, rightDecodeMs: 3600 },
    ],
  },

  // ===== STAGE 8/9: DECISION + BEST PRACTICE (determinism) =====
  // Second continuous diagram beat: same pipeline, now showing the
  // "compare"/"tradeoff" framing one more time for the decision stage, then
  // the sampling die + probability distribution for determinism - again one
  // evolving visual instead of 5 separate blank statement screens.
  {
    type: 'diagram',
    start: 414.9,
    duration: 86.0,
    keyframes: [
      { t: 0, stage: 'tradeoff', decodeTokenIndex: 5 },
      { t: 18.1, stage: 'tradeoff', decodeTokenIndex: 5 },
      { t: 31.6, stage: 'logitsSoftmax', decodeTokenIndex: 5 },
      { t: 42, stage: 'determinism', decodeTokenIndex: 5, sampledTokenLabel: 'renews', diceRoll: 0 },
      { t: 49.3, stage: 'determinism', decodeTokenIndex: 5, sampledTokenLabel: 'renews', diceRoll: 0.3 },
      { t: 58, stage: 'determinism', decodeTokenIndex: 6, sampledTokenLabel: 'annually', diceRoll: 0.6 },
      { t: 62.9, stage: 'determinism', decodeTokenIndex: 6, sampledTokenLabel: 'annually', diceRoll: 0.75 },
      { t: 76, stage: 'determinism', decodeTokenIndex: 7, sampledTokenLabel: 'pinned + cached = repeatable', diceRoll: 1 },
      { t: 86, stage: 'determinism', decodeTokenIndex: 7, sampledTokenLabel: 'pinned + cached = repeatable', diceRoll: 1 },
    ],
    segments: [
      {
        t: 0,
        audioFile: 'beat24.wav',
        caption:
          "So the decision is this. If time to first token is your problem, the fix lives on the prefill side — prompt caching, or a shorter prompt. If total latency is your problem, the fix lives on the decode side — asking for a shorter answer, batching more requests together, or speculative decoding.",
      },
      {
        t: 18.1,
        audioFile: 'beat25.wav',
        caption:
          "Apply a prefill fix to a decode problem, or the reverse, and the number you're trying to move won't budge. You'll have correctly diagnosed nothing, and spent real engineering effort on the wrong half of the loop.",
      },
      {
        t: 31.6,
        audioFile: 'beat26.wav',
        caption:
          "Here's the rule worth keeping. The forward pass through the model — everything up through softmax — is deterministic. Determinism is only ever lost at the sampling step, after the model has already finished computing. Setting temperature to zero gives you greedy decoding, which is deterministic in principle.",
      },
      {
        t: 49.3,
        audioFile: 'beat27.wav',
        caption:
          "In practice, exact reproducibility is still hard even at temperature zero — floating-point summation order shifts with batch composition, and two logits separated by almost nothing can flip which one wins.",
      },
      {
        t: 62.9,
        audioFile: 'beat28.wav',
        caption:
          "Here's the version worth having ready for an interview. Temperature zero gives you greedy decoding, which is deterministic in theory. In production you also need to pin the model version, and accept that floating-point non-associativity across varying batch compositions can still flip a near-tied token. If your system genuinely requires bit-identical outputs, that's a signal you should be caching responses rather than regenerating them.",
      },
    ],
  },

  // ===== STAGE 10: TAKEAWAY =====
  {
    type: 'recap',
    start: 500.9,
    duration: 22.1,
    audioFile: 'beat29.wav',
    caption:
      "Prefill processes your whole prompt in parallel and sets your time to first token. Decode generates one token at a time and sets your total latency. The KV cache turns what would be a quadratic cost into a linear one, which is what makes decode affordable at all. And determinism is only ever lost at the very last step — the sampling choice, never the computation before it.",
    items: [
      'Prefill — parallel, compute-bound, sets Time To First Token',
      'Decode — sequential, memory-bound, sets Time Per Output Token',
      'The KV cache makes decode linear instead of quadratic',
      'Determinism is lost at sampling, never during the forward pass',
    ],
  },
];

export const TOTAL_DURATION_SECONDS = 523.0;
export const TOTAL_DURATION_FRAMES = Math.round(TOTAL_DURATION_SECONDS * FPS);
