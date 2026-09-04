/**
 * Mobile visual QA — a real, separate check from validate-render.ts's
 * mechanical/audio-duration checklist. That script has no frame-image
 * extraction or pixel-level inspection at all (audio RMS + ffprobe metadata
 * only); this one exists specifically to answer "does this actually read on
 * an iPhone 15" — the product requirement that prompted the whole
 * mobile-readability pass (video-studio/src/components/theme.ts's `density`/
 * `fontSize`/`spacing` tokens, CaptionBar's short-caption redesign, the
 * layoutGrid entity-scaling helper).
 *
 * Extracts one representative frame per beat (ffmpeg -vframes 1, same tool
 * subprocess.ts's extractPoster already uses), downscales each to an
 * iPhone-15-viewport-equivalent size, and sends them to Gemini 3.7 Flash
 * (multimodal, same Gemini-only model policy the generate path already
 * enforces — no policy exception needed for this call) with a structured
 * prompt asking it to score each frame across the categories from the
 * mobile-readability spec: Typography, Contrast, Diagram clarity, Mobile
 * readability, Code readability, Content density — each /100 — plus
 * overflow/clipping flags.
 *
 * This is a REAL PASS/FAIL GATE, not just an advisory number: the verdict
 * (VisualQaResult below) is wired into RenderJobResult exactly like
 * mechanicalQa.passed already is, so a failing render is never marked
 * publish-ready. What it does NOT do (deliberate scope cut, confirmed with
 * the peer relaying this task): automatically regenerate/re-layout a beat
 * that fails and re-check. Mapping a vision-QA verdict back to a concrete
 * regeneration instruction is a comparable-sized design problem to this
 * whole pass and is an explicit follow-up, not a bolt-on here.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... npx tsx scripts/validate-render-visual.ts \
 *     out/video.mp4 out/loaded-video.json [--out report.json] [--max-frames 8]
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import OpenAI from 'openai';

const exec = promisify(execFile);

const MODEL = process.env.OPENROUTER_MODEL_VISUAL_QA || 'google/gemini-3.7-flash';
// iPhone 15's logical viewport is 393x852 (portrait); we render 16:9 landscape
// so downscale to a comparable SHORT-EDGE pixel budget instead of literally
// matching the phone's aspect ratio — the point is "would this text still be
// legible if compressed to a small mobile-class frame," not literally
// simulating the LMS player's exact layout.
const MOBILE_WIDTH = 480;
const MOBILE_HEIGHT = 270;

export type QaCategory =
  | 'typography'
  | 'contrast'
  | 'diagram_clarity'
  | 'mobile_readability'
  | 'code_readability'
  | 'content_density';

export interface FrameVerdict {
  beatIndex: number;
  beatType: string;
  atSeconds: number;
  scores: Record<QaCategory, number>;
  overflow: boolean;
  clippedText: boolean;
  notes: string;
}

export interface VisualQaResult {
  passed: boolean;
  threshold: number;
  frames: FrameVerdict[];
  /** Per-category minimum across all sampled frames — what actually gates pass/fail. */
  categoryMinimums: Record<QaCategory, number>;
  failureReasons: string[];
}

interface LoadedBeat {
  type: string;
  start: number;
  duration: number;
}

const CATEGORIES: QaCategory[] = [
  'typography',
  'contrast',
  'diagram_clarity',
  'mobile_readability',
  'code_readability',
  'content_density',
];

const DEFAULT_THRESHOLD = 90;

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i]!.startsWith('--')) {
      args[argv[i]!.slice(2)] = argv[i + 1]!;
      i += 1;
    } else {
      positional.push(argv[i]!);
    }
  }
  return { args, positional };
}

async function extractFrame(mp4Path: string, atSeconds: number, outPath: string): Promise<void> {
  await mkdir(dirname(outPath), { recursive: true });
  await exec(
    'ffmpeg',
    ['-y', '-ss', String(Math.max(0, atSeconds)), '-i', mp4Path, '-vframes', '1', '-vf', `scale=${MOBILE_WIDTH}:${MOBILE_HEIGHT}`, outPath],
    { maxBuffer: 1024 * 1024 * 16 },
  );
}

function representativeTimestamps(beats: LoadedBeat[], maxFrames: number): Array<{ index: number; type: string; at: number }> {
  // One frame per beat at its midpoint (where content is most likely fully
  // settled — entrance animations done, before any exit fade), capped at
  // maxFrames by taking an evenly-spaced sample if there are more beats than
  // that (cost control — every extra frame is another vision-model call).
  const all = beats.map((b, i) => ({ index: i, type: b.type, at: b.start + b.duration / 2 }));
  if (all.length <= maxFrames) return all;
  const step = all.length / maxFrames;
  const sampled: typeof all = [];
  for (let i = 0; i < maxFrames; i++) sampled.push(all[Math.floor(i * step)]!);
  return sampled;
}

async function scoreFrame(client: OpenAI, imagePath: string, beatType: string): Promise<Omit<FrameVerdict, 'beatIndex' | 'beatType' | 'atSeconds'>> {
  const imageBuffer = await readFile(imagePath);
  const dataUrl = `data:image/png;base64,${imageBuffer.toString('base64')}`;

  const system = [
    'You are a mobile-readability QA reviewer for an educational video frame.',
    'The image shown is a downscaled simulation of how this frame looks on a phone screen (an iPhone-15-class viewport), NOT the full desktop resolution.',
    'Score this ONE frame honestly across six categories, each 0-100, where 100 = perfectly legible/clear on a phone with no squinting, and below 90 means a real learner would struggle.',
    'Categories: typography (is text large enough to read at a glance), contrast (does text stand out from its background), diagram_clarity (if there is a diagram/architecture visual, are its labels/shapes clear), mobile_readability (overall — would this frame pass a "read it on an iPhone 15" test), code_readability (if there is terminal/code text, is it legible), content_density (is there one clear idea, or is the frame cluttered/cramped).',
    'If a category does not apply to this frame (e.g. no diagram, no code), score it 100 (not applicable is not a failure).',
    'Reply with ONLY a JSON object: {"typography": N, "contrast": N, "diagram_clarity": N, "mobile_readability": N, "code_readability": N, "content_density": N, "overflow": bool, "clippedText": bool, "notes": "one sentence"}. overflow = true if any element appears cut off by the frame edge. clippedText = true if any text appears truncated or cut off.',
  ].join(' ');

  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: `This is a "${beatType}" beat.` },
          { type: 'image_url', image_url: { url: dataUrl } },
        ] as never,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const raw = res.choices[0]?.message?.content ?? '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const fence = /\{[\s\S]*\}/.exec(raw);
    parsed = fence ? JSON.parse(fence[0]) : {};
  }

  const scores = Object.fromEntries(CATEGORIES.map((c) => [c, Number(parsed[c]) || 0])) as Record<QaCategory, number>;
  return {
    scores,
    overflow: Boolean(parsed.overflow),
    clippedText: Boolean(parsed.clippedText),
    notes: typeof parsed.notes === 'string' ? parsed.notes : '',
  };
}

export async function runVisualQa(
  mp4Path: string,
  beats: LoadedBeat[],
  opts: { maxFrames?: number; threshold?: number; apiKey?: string } = {},
): Promise<VisualQaResult> {
  const apiKey = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set — required for mobile visual QA');
  const client = new OpenAI({ apiKey, baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1', timeout: 120_000 });

  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const maxFrames = opts.maxFrames ?? 10;
  const targets = representativeTimestamps(beats, maxFrames);

  const workdir = await mkdtemp(join(tmpdir(), 'visual-qa-'));
  const frames: FrameVerdict[] = [];

  for (const target of targets) {
    const framePath = join(workdir, `beat-${target.index}.png`);
    await extractFrame(mp4Path, target.at, framePath);
    const verdict = await scoreFrame(client, framePath, target.type);
    frames.push({ beatIndex: target.index, beatType: target.type, atSeconds: target.at, ...verdict });
  }

  const categoryMinimums = Object.fromEntries(
    CATEGORIES.map((c) => [c, frames.length ? Math.min(...frames.map((f) => f.scores[c])) : 100]),
  ) as Record<QaCategory, number>;

  const failureReasons: string[] = [];
  for (const c of CATEGORIES) {
    if (categoryMinimums[c] < threshold) {
      const worst = frames.find((f) => f.scores[c] === categoryMinimums[c]);
      failureReasons.push(
        `${c} scored ${categoryMinimums[c]} (< ${threshold}) on beat ${worst?.beatIndex} (${worst?.beatType})${worst?.notes ? `: ${worst.notes}` : ''}`,
      );
    }
  }
  for (const f of frames) {
    if (f.overflow) failureReasons.push(`beat ${f.beatIndex} (${f.beatType}) has an element overflowing the frame`);
    if (f.clippedText) failureReasons.push(`beat ${f.beatIndex} (${f.beatType}) has clipped/truncated text`);
  }

  return { passed: failureReasons.length === 0, threshold, frames, categoryMinimums, failureReasons };
}

async function main(): Promise<void> {
  const { args, positional } = parseArgs(process.argv.slice(2));
  const [mp4Path, loadedVideoJsonPath] = positional;
  if (!mp4Path || !loadedVideoJsonPath) {
    console.error('Usage: npx tsx scripts/validate-render-visual.ts <path-to.mp4> <loaded-video.json> [--out report.json] [--max-frames N] [--threshold N]');
    process.exit(2);
  }

  const loaded = JSON.parse(await readFile(loadedVideoJsonPath, 'utf-8')) as { beats: LoadedBeat[] };
  const maxFrames = args['max-frames'] ? Number(args['max-frames']) : undefined;
  const threshold = args.threshold ? Number(args.threshold) : undefined;

  const result = await runVisualQa(mp4Path, loaded.beats, { maxFrames, threshold });

  console.log(`\nMobile Visual QA — threshold ${result.threshold}/100 per category`);
  console.log('Category minimums (worst frame per category):');
  for (const c of CATEGORIES) {
    const v = result.categoryMinimums[c];
    console.log(`  [${v >= result.threshold ? 'PASS' : 'FAIL'}] ${c}: ${v}`);
  }
  if (result.failureReasons.length) {
    console.log('\nFailure reasons:');
    for (const r of result.failureReasons) console.log(`  - ${r}`);
  }
  console.log(`\nOverall: ${result.passed ? 'PASS' : 'FAIL'}\n`);

  if (args.out) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(args.out, JSON.stringify(result, null, 2));
    console.log(`Full report written to ${args.out}`);
  }

  process.exit(result.passed ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
