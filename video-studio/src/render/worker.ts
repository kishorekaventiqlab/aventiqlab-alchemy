/**
 * The one-shot Fargate render worker entrypoint (AL5 rev-2 plan §2).
 *
 * Env (set by the Lambda's ecs:RunTask overrides):
 *   RENDER_JOB_ID            the job to run
 *   RENDER_REQUEST_S3_KEY    where the request body was stashed
 *   ALCHEMY_CONTENT_BUCKET   the AL7 bucket
 *   ALCHEMY_RENDER_JOBS_TABLE the DynamoDB table
 *   AWS_REGION               (Fargate sets this)
 *   OPENROUTER_API_KEY[_ARN] for the narration_flaw regen
 *   CHATTERBOX_PYTHON / CHATTERBOX_VOICE_REF / CHATTERBOX_DEVICE=cpu
 *
 * Reads the stashed request from S3, runs runRenderJob, writes the terminal
 * job record. A watchdog self-fails the record if the task is about to be
 * SIGTERM'd (Fargate stopTimeout) so a poll shows `failed` not stuck `running`.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'node:fs';
import type { Readable } from 'node:stream';

import { runRenderJob, type RenderJobInput, type RenderSteps, type VisionQaFeedback } from './renderJob.js';
import type { VideoSpec } from '../spec/videoSpecTypes.js';
import { ChatterboxProvider } from '../audio/providers/ChatterboxProvider.js';
import { loadAudioConfig, voiceName } from '../audio/config.js';
import { S3AudioCache } from './s3AudioCache.js';
import { remotionRender, extractPoster, probeDurationSeconds, validateRender } from './subprocess.js';
import { DynamoRenderJobUpdater } from './jobUpdater.js';
import { regenerateBeatNarration } from './beatRegen.js';
import { narrationHash, specHash } from './videoHash.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_STUDIO_ROOT = resolve(__dirname, '../..');

interface StashedRequest {
  render_job_id: string;
  experience_id: string;
  cycle: number;
  video_spec: VideoSpec;
  vision_qa_feedback?: VisionQaFeedback | null;
}

async function getJson<T>(s3: S3Client, bucket: string, key: string): Promise<T> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await streamToString(res.Body as Readable);
  return JSON.parse(body) as T;
}

function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('error', reject);
    stream.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function main(): Promise<void> {
  const region = process.env.AWS_REGION ?? 'ap-south-1';
  const bucket = required('ALCHEMY_CONTENT_BUCKET');
  const table = required('ALCHEMY_RENDER_JOBS_TABLE');
  const renderJobId = required('RENDER_JOB_ID');
  const requestKey = required('RENDER_REQUEST_S3_KEY');

  const s3 = new S3Client({ region });
  const jobs = new DynamoRenderJobUpdater(table, region);

  // Watchdog: if we get SIGTERM (Fargate stopTimeout), record `failed`.
  let finished = false;
  const onTerm = async () => {
    if (finished) return;
    await jobs.patch(renderJobId, {
      status: 'failed',
      finished_at: new Date().toISOString(),
      error: { code: 'render_failed', message: 'Render task was stopped before completing.', retryable: true },
    });
    process.exit(1);
  };
  process.on('SIGTERM', () => void onTerm());

  await jobs.patch(renderJobId, { status: 'running', phase: null, started_at: new Date().toISOString() });

  try {
    const req = await getJson<StashedRequest>(s3, bucket, requestKey);
    const workdir = await mkdtemp(join(tmpdir(), 'render-'));

    const audioCfg = loadAudioConfig(VIDEO_STUDIO_ROOT);
    const ttsProvider = new ChatterboxProvider({
      pythonBin: audioCfg.chatterbox.pythonBin,
      scriptPath: audioCfg.chatterbox.scriptPath,
      voiceRefPath: audioCfg.chatterbox.voiceRefPath,
      device: audioCfg.chatterbox.device,
    });
    void voiceName; // (voice is folded into narration_hash upstream)

    const cyclePrefix = `renders/${req.experience_id}/cycle-${req.cycle}`;

    const steps: RenderSteps = {
      regenerateBeatNarration: (spec, beatId, reason) =>
        regenerateBeatNarration({ spec, beatId, reason, region }),
      narrationHash,
      specHash,
      ttsProvider,
      audioCache: new S3AudioCache(bucket, region, s3),
      workdir,
      remotionRender: (p) => remotionRender({ videoStudioRoot: VIDEO_STUDIO_ROOT }, p),
      extractPoster: (mp4, poster, at) => extractPoster({ videoStudioRoot: VIDEO_STUDIO_ROOT }, mp4, poster, at),
      probeDurationSeconds: (mp4) => probeDurationSeconds({ videoStudioRoot: VIDEO_STUDIO_ROOT }, mp4),
      validateRender: (p) => validateRender({ videoStudioRoot: VIDEO_STUDIO_ROOT }, p),
      uploadRenderArtifact: async (localPath, name) => {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `${cyclePrefix}/${name}`,
            Body: readFileSync(localPath),
            ContentType: contentType(name),
          }),
        );
        return `s3://${bucket}/${cyclePrefix}/${name}`;
      },
      putRenderJson: async (obj, name) => {
        await s3.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `${cyclePrefix}/${name}`,
            Body: JSON.stringify(obj, null, 2),
            ContentType: 'application/json',
          }),
        );
        return `s3://${bucket}/${cyclePrefix}/${name}`;
      },
      onPhase: (phase) => jobs.patch(renderJobId, { phase }),
      log: (line) => console.log(line),
    };

    const input: RenderJobInput = {
      renderJobId,
      experienceId: req.experience_id,
      cycle: req.cycle,
      videoSpec: req.video_spec,
      visionQaFeedback: req.vision_qa_feedback,
    };

    const result = await runRenderJob(input, steps);

    finished = true;
    await jobs.patch(renderJobId, {
      status: 'done',
      phase: null,
      finished_at: new Date().toISOString(),
      mechanical_qa: result.mechanicalQa,
      output: result.output,
      rendered_spec_pointer: result.renderedSpecPointer,
    });
    console.log(`render job ${renderJobId} done`);
  } catch (err) {
    finished = true;
    const message = err instanceof Error ? err.message : String(err);
    await jobs.patch(renderJobId, {
      status: 'failed',
      phase: null,
      finished_at: new Date().toISOString(),
      error: { code: renderErrorCode(message), message: `Render failed: ${message}`.slice(0, 1000), retryable: true },
    });
    console.error(err);
    process.exit(1);
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

function contentType(name: string): string {
  if (name.endsWith('.mp4')) return 'video/mp4';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

function renderErrorCode(message: string): string {
  if (/openrouter|model|quota|OPENROUTER/i.test(message)) return 'generation_failed';
  return 'render_failed';
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
