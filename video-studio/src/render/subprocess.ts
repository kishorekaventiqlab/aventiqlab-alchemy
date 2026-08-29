/**
 * The subprocess steps for the render worker: `remotion render`, `ffmpeg`
 * poster + `ffprobe` duration, and `validate-render.ts`.
 *
 * These shell out; they're the parts that can't run in CI. The worker's
 * control flow (renderJob.ts) is tested with these mocked.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { VideoSpec } from '../spec/videoSpecTypes.js';

const exec = promisify(execFile);

export interface SubprocessConfig {
  /** Repo root of video-studio (where src/index.ts + package.json live). */
  videoStudioRoot: string;
  /** ffmpeg / ffprobe binaries (default: on PATH). */
  ffmpeg?: string;
  ffprobe?: string;
}

/**
 * `npx remotion render src/index.ts spec-video <out> --props=<json> --public-dir=<workdir>`.
 * The `spec-video` composition's calculateMetadata reads the spec from props.
 */
export async function remotionRender(
  cfg: SubprocessConfig,
  params: { spec: VideoSpec; measuredAudio: Record<string, number>; audioPrefix: string; outPath: string; workdir: string },
): Promise<void> {
  await mkdir(dirname(params.outPath), { recursive: true });
  const propsPath = join(params.workdir, 'inputProps.json');
  await writeFile(
    propsPath,
    JSON.stringify({ spec: params.spec, measuredAudio: params.measuredAudio, audioPrefix: params.audioPrefix }),
  );

  await exec(
    'npx',
    [
      'remotion',
      'render',
      'src/index.ts',
      'spec-video',
      params.outPath,
      `--props=${propsPath}`,
      `--public-dir=${params.workdir}`,
      '--codec=h264',
      '--log=error',
    ],
    { cwd: cfg.videoStudioRoot, maxBuffer: 1024 * 1024 * 64 },
  );
}

export async function extractPoster(
  cfg: SubprocessConfig,
  mp4Path: string,
  posterPath: string,
  atSeconds: number,
): Promise<void> {
  await mkdir(dirname(posterPath), { recursive: true });
  await exec(
    cfg.ffmpeg ?? 'ffmpeg',
    ['-y', '-ss', String(atSeconds), '-i', mp4Path, '-vframes', '1', '-vf', 'scale=1920:1080', posterPath],
    { maxBuffer: 1024 * 1024 * 16 },
  );
}

export async function probeDurationSeconds(cfg: SubprocessConfig, mp4Path: string): Promise<number> {
  const { stdout } = await exec(
    cfg.ffprobe ?? 'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', mp4Path],
    { maxBuffer: 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  return Number.parseFloat(parsed.format?.duration ?? '0');
}

/**
 * Run scripts/validate-render.ts in --beats mode and parse its report.
 * The script prints `[PASS] <name>\n       <detail>` lines and exits 0/1.
 * We re-run its logic by importing it would be cleaner, but it's a CLI; parse
 * its output.
 */
export async function validateRender(
  cfg: SubprocessConfig,
  params: { mp4Path: string; loadedVideoJsonPath: string; manifestPath: string },
): Promise<{ passed: boolean; checks: Array<{ name: string; pass: boolean; detail: string }> }> {
  let stdout = '';
  let passed = true;
  try {
    const res = await exec(
      'npx',
      [
        'tsx',
        'scripts/validate-render.ts',
        params.mp4Path,
        '--beats',
        params.loadedVideoJsonPath,
        '--manifest',
        params.manifestPath,
      ],
      { cwd: cfg.videoStudioRoot, maxBuffer: 1024 * 1024 * 16 },
    );
    stdout = res.stdout;
  } catch (err) {
    // exit 1 = some checks failed; still parse the report.
    stdout = (err as { stdout?: string }).stdout ?? '';
    passed = false;
  }

  const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
  const lines = stdout.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\[(PASS|FAIL)\]\s+(.+)$/.exec(lines[i]!.trim());
    if (m) {
      checks.push({
        pass: m[1] === 'PASS',
        name: m[2]!,
        detail: (lines[i + 1] ?? '').trim(),
      });
    }
  }
  if (checks.length > 0) passed = checks.every((c) => c.pass);
  return { passed, checks };
}

/** Read a JSON file (small helper the worker uses for the stashed request). */
export async function readJsonFile<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf-8')) as T;
}
