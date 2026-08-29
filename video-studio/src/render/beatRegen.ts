/**
 * Single-beat narration regeneration for a Vision-QA `narration_flaw` verdict
 * (AL5 rev-2 plan §9). One targeted OpenRouter call — rewrite ONE beat's
 * `narration` to fix the flaw, keeping the rest of the video coherent.
 *
 * This is deliberately NOT AL3's full-artifact generate path — that regenerates
 * a whole video_spec. Here we surgically replace one string.
 */
import OpenAI from 'openai';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import type { VideoSpec, SpecBeat } from '../spec/videoSpecTypes.js';

export interface BeatRegenParams {
  spec: VideoSpec;
  beatId: string;
  reason: string | undefined;
  region: string;
}

async function resolveOpenRouterKey(region: string): Promise<string> {
  const direct = process.env.OPENROUTER_API_KEY;
  if (direct) return direct;
  const arn = process.env.OPENROUTER_API_KEY_ARN;
  if (!arn) throw new Error('OPENROUTER_API_KEY / OPENROUTER_API_KEY_ARN not set — needed for a narration_flaw regen');
  const sm = new SecretsManagerClient({ region });
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const raw = res.SecretString ?? '';
  const jsonKey = process.env.OPENROUTER_API_KEY_JSON_KEY;
  if (!jsonKey) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const v = parsed[jsonKey];
    if (typeof v === 'string') return v;
  } catch {
    /* fall through */
  }
  throw new Error(`Secrets Manager entry has no string key "${jsonKey}"`);
}

function otherBeatsContext(spec: VideoSpec, targetId: string): string {
  return spec.beats
    .filter((b) => b.id !== targetId && b.narration.trim())
    .map((b) => `- [${b.stage ?? 'beat'}] ${b.narration}`)
    .join('\n');
}

export async function regenerateBeatNarration(params: BeatRegenParams): Promise<VideoSpec> {
  const { spec, beatId, reason } = params;
  const beat = spec.beats.find((b) => b.id === beatId);
  if (!beat) throw new Error(`narration_flaw evidence.beat_id "${beatId}" is not a beat in the spec`);

  const apiKey = await resolveOpenRouterKey(params.region);
  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    timeout: Number.parseInt(process.env.OPENROUTER_TIMEOUT_MS || '120000', 10),
    maxRetries: 0,
  });
  const model = process.env.OPENROUTER_MODEL_VIDEO || process.env.OPENROUTER_MODEL_DEFAULT || 'anthropic/claude-sonnet-4';

  const system = [
    'You rewrite ONE beat of narration for an AVENTIQLAB technical explainer video.',
    'Output ONLY a JSON object: { "narration": "<the rewritten spoken text>" }. No other keys, no prose, no markdown fence.',
    'The narration is spoken aloud — plain sentences, one engineer explaining to another. No markup, no "CAPTION:", no stage directions.',
    'Keep it roughly the same length as the original so the video timing does not break.',
    'It must stay consistent with what is on screen for this beat and with the surrounding narration.',
  ].join('\n');

  const user = [
    `This beat's stage: ${beat.stage ?? '(none)'}`,
    `This beat's on_screen (what the viewer sees): ${beat.on_screen}`,
    `The current narration (has a problem): ${beat.narration}`,
    reason ? `Vision QA flagged it because: ${reason}` : 'Vision QA flagged the narration as not matching what is said in the rendered video.',
    '',
    'The rest of the video, for continuity:',
    otherBeatsContext(spec, beatId),
    '',
    'Rewrite this one beat\'s narration to fix the problem.',
  ].join('\n');

  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const raw = res.choices[0]?.message?.content ?? '';
  let parsed: { narration?: unknown };
  try {
    parsed = JSON.parse(raw) as { narration?: unknown };
  } catch {
    const fence = /\{[\s\S]*\}/.exec(raw);
    parsed = fence ? (JSON.parse(fence[0]) as { narration?: unknown }) : {};
  }
  if (typeof parsed.narration !== 'string' || !parsed.narration.trim()) {
    throw new Error('narration_flaw regen: model did not return a usable narration string');
  }

  // Return a new spec with just that beat's narration replaced.
  const updatedBeats: SpecBeat[] = spec.beats.map((b) =>
    b.id === beatId ? { ...b, narration: parsed.narration as string } : b,
  );
  return { ...spec, beats: updatedBeats };
}
