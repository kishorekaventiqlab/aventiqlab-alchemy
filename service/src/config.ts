/**
 * Config + secret resolution for the alchemy Content Studio service.
 *
 * Precedence for every secret:
 *   1. explicit env var (local dev, CI)
 *   2. AWS Secrets Manager, resolved once at startup by name/ARN
 *   3. fail closed — buildConfig() throws; there is no default and no dev bypass
 *
 * Mirrors how astra loads ASTRA_SERVICE_JWT_SECRET from `astra/service-secrets`
 * (aventiqlab-platform/docs/aventiqlab-integration.md §Authentication).
 */
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export interface ServiceConfig {
  /** HS256 shared secret for verifying astra -> alchemy service tokens (contract §2.3). */
  jwtSecret: string;
  /** Expected `iss` claim on inbound tokens. */
  jwtIssuer: string;
  /** Expected `aud` claim on inbound tokens. */
  jwtAudience: string;
  /** Clock-skew leeway, seconds, applied to exp/iat/nbf. */
  jwtClockToleranceSec: number;
  region: string;
  logLevel: string;
  /** Local HTTP port (ignored under Lambda). */
  port: number;
  nodeEnv: string;
  /** AL3 generation config. Resolved lazily — see loadGenerationConfig(). */
  generation: GenerationConfigLoader;
  /** AL5 render orchestration config. Resolved lazily — see loadRenderConfig(). */
  render: RenderConfigLoader;
}

export interface RenderConfig {
  /** The AL7 bucket (generated/renders/produced/tts-cache). */
  contentBucket: string;
  /** DynamoDB table for render jobs (AL5 §3). */
  renderJobsTable: string;
  /** ECS cluster ARN/name the render worker task runs in. */
  ecsCluster: string;
  /** The render worker task definition family:revision (or family). */
  renderTaskDefinition: string;
  /** Subnets for the Fargate task ENI. */
  subnets: string[];
  /** Security groups for the Fargate task ENI. */
  securityGroups: string[];
  /** Container name inside the task def (for RunTask overrides). */
  renderContainerName: string;
  /** Days a render job record lives (DynamoDB TTL). */
  jobTtlDays: number;
}

export type RenderConfigLoader = () => Promise<RenderConfig>;

export interface GenerationConfig {
  /** OpenRouter API key. Value comes later (ops); the PATH is what AL3 builds. */
  openRouterApiKey: string;
  /** OpenRouter base URL (OpenAI-compatible). */
  openRouterBaseUrl: string;
  /** Model id per artifact type (env-overridable, so tuning needs no redeploy). */
  modelByType: Record<string, string>;
  /** Default model when a per-type override is absent. */
  defaultModel: string;
  /** The S3 bucket for generated artifacts (AL7). */
  contentBucket: string;
  /** Milliseconds before a model call is abandoned as model_provider_timeout. */
  modelTimeoutMs: number;
}

/**
 * Generation config is resolved on first use (not at startup) so the service
 * still boots for /health + /v1/whoami without OPENROUTER_API_KEY set. A
 * missing key surfaces as `not_configured` on the first /v1/generate call.
 */
export type GenerationConfigLoader = () => Promise<GenerationConfig>;

const CONTRACT_ISSUER = "aventiqlab-astra";
const CONTRACT_AUDIENCE = "aventiqlab-alchemy";

class ConfigError extends Error {
  readonly code = "not_configured";
}

let secretsClient: SecretsManagerClient | undefined;

async function resolveSecret(params: {
  envVar: string;
  arnEnvVar: string;
  secretJsonKey?: string;
  region: string;
}): Promise<string> {
  const direct = process.env[params.envVar];
  if (direct && direct.length > 0) return direct;

  const secretRef = process.env[params.arnEnvVar];
  if (!secretRef) {
    throw new ConfigError(
      `Missing secret: set ${params.envVar} directly, or ${params.arnEnvVar} to a Secrets Manager name/ARN.`,
    );
  }

  secretsClient ??= new SecretsManagerClient({ region: params.region });
  const res = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretRef }));
  const raw = res.SecretString;
  if (!raw) {
    throw new ConfigError(`Secrets Manager entry ${secretRef} has no SecretString.`);
  }

  if (!params.secretJsonKey) return raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError(
      `Secrets Manager entry ${secretRef} is not JSON; expected a JSON object with key "${params.secretJsonKey}".`,
    );
  }
  const value =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)[params.secretJsonKey]
      : undefined;
  if (typeof value !== "string") {
    throw new ConfigError(
      `Secrets Manager entry ${secretRef} has no string key "${params.secretJsonKey}".`,
    );
  }
  return value;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new ConfigError(`${name} must be an integer, got "${raw}".`);
  return n;
}

/**
 * Hard product requirement, not just a cost-driven default: alchemy content
 * generation must never call Claude Sonnet (or any other non-Gemini model)
 * via OpenRouter, under any circumstance — including a future env-var
 * override (OPENROUTER_MODEL_DEFAULT/_MATERIAL/_QUIZ/_SOURCE_CODE_LAB/
 * _SKILL_EVALUATOR all read raw env, with nothing previously stopping one of
 * them from being set to a non-Gemini model). A prefix check (not an exact
 * pin) so a future Gemini point release doesn't need a code change here.
 */
function assertAllowedModel(envVarName: string, model: string): string {
  if (!model.startsWith("google/gemini-")) {
    throw new ConfigError(
      `${envVarName} resolved to "${model}", which is not a Gemini model. ` +
        `alchemy content generation must only ever call Gemini via OpenRouter — refusing to start.`,
    );
  }
  return model;
}

/**
 * Resolve all config + secrets. Call once at startup. Throws ConfigError
 * (code: "not_configured") if anything required is missing.
 */
export async function buildConfig(): Promise<ServiceConfig> {
  const region = process.env.AWS_REGION ?? "ap-south-1";

  const jwtSecret = await resolveSecret({
    envVar: "ALCHEMY_SERVICE_JWT_SECRET",
    arnEnvVar: "ALCHEMY_SERVICE_JWT_SECRET_ARN",
    // Only treat the Secrets Manager entry as a JSON blob if explicitly told
    // to (e.g. if it's ever migrated to astra's multi-key `service-secrets`
    // shape). By default CDK generates (and ops writes back) a plain string.
    secretJsonKey: process.env.ALCHEMY_SERVICE_JWT_SECRET_JSON_KEY || undefined,
    region,
  });

  if (jwtSecret.length < 32) {
    throw new ConfigError("ALCHEMY_SERVICE_JWT_SECRET is shorter than 32 chars — refusing to start.");
  }

  return {
    jwtSecret,
    jwtIssuer: process.env.ALCHEMY_JWT_ISSUER || CONTRACT_ISSUER,
    jwtAudience: process.env.ALCHEMY_JWT_AUDIENCE || CONTRACT_AUDIENCE,
    jwtClockToleranceSec: intFromEnv("ALCHEMY_JWT_CLOCK_TOLERANCE_SEC", 30),
    region,
    logLevel: process.env.LOG_LEVEL || "info",
    port: intFromEnv("PORT", 3000),
    nodeEnv: process.env.NODE_ENV || "development",
    generation: () => loadGenerationConfig(region),
    render: () => loadRenderConfig(),
  };
}

/**
 * Resolve render orchestration config on demand. Throws ConfigError
 * (-> not_configured) if a required value is missing. Only POST /v1/render and
 * POST /v1/artifacts/promote need this — /health, /v1/whoami, /v1/generate,
 * /v1/artifacts/sign boot without it.
 */
export async function loadRenderConfig(): Promise<RenderConfig> {
  const need = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new ConfigError(`${name} is not set — required for /v1/render.`);
    return v;
  };
  return {
    contentBucket: need("ALCHEMY_CONTENT_BUCKET"),
    renderJobsTable: need("ALCHEMY_RENDER_JOBS_TABLE"),
    ecsCluster: need("ALCHEMY_RENDER_ECS_CLUSTER"),
    renderTaskDefinition: need("ALCHEMY_RENDER_TASK_DEFINITION"),
    subnets: need("ALCHEMY_RENDER_SUBNETS").split(",").map((s) => s.trim()).filter(Boolean),
    securityGroups: need("ALCHEMY_RENDER_SECURITY_GROUPS").split(",").map((s) => s.trim()).filter(Boolean),
    renderContainerName: process.env.ALCHEMY_RENDER_CONTAINER_NAME || "render",
    jobTtlDays: intFromEnv("ALCHEMY_RENDER_JOB_TTL_DAYS", 30),
  };
}

/**
 * Resolve generation config on demand. Throws ConfigError (-> not_configured)
 * if OPENROUTER_API_KEY / the content bucket can't be resolved.
 */
export async function loadGenerationConfig(region: string): Promise<GenerationConfig> {
  const openRouterApiKey = await resolveSecret({
    envVar: "OPENROUTER_API_KEY",
    arnEnvVar: "OPENROUTER_API_KEY_ARN",
    secretJsonKey: process.env.OPENROUTER_API_KEY_JSON_KEY || undefined,
    region,
  });

  const contentBucket = process.env.ALCHEMY_CONTENT_BUCKET;
  if (!contentBucket) {
    throw new ConfigError("ALCHEMY_CONTENT_BUCKET is not set — the AL7 bucket name is required for /v1/generate.");
  }

  // Cost: Gemini 3.7 Flash is ~14x cheaper per call than Sonnet 4 on
  // OpenRouter and is what astra's assessment-engine already uses — picked
  // for cost consistency across the platform's two LLM-calling systems.
  // Every artifact-type prompt was re-verified against real Gemini 3.7 Flash
  // output before this default changed (generate.test.ts + prompts.ts).
  // Also a hard product requirement (assertAllowedModel, above) — not just a
  // cost-driven default a future override could quietly undo.
  const defaultModel = assertAllowedModel(
    "OPENROUTER_MODEL_DEFAULT",
    process.env.OPENROUTER_MODEL_DEFAULT || "google/gemini-3.7-flash",
  );

  return {
    openRouterApiKey,
    openRouterBaseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultModel,
    modelByType: {
      material: assertAllowedModel("OPENROUTER_MODEL_MATERIAL", process.env.OPENROUTER_MODEL_MATERIAL || defaultModel),
      quiz: assertAllowedModel("OPENROUTER_MODEL_QUIZ", process.env.OPENROUTER_MODEL_QUIZ || defaultModel),
      source_code_lab: assertAllowedModel(
        "OPENROUTER_MODEL_SOURCE_CODE_LAB",
        process.env.OPENROUTER_MODEL_SOURCE_CODE_LAB || defaultModel,
      ),
      skill_evaluator: assertAllowedModel(
        "OPENROUTER_MODEL_SKILL_EVALUATOR",
        process.env.OPENROUTER_MODEL_SKILL_EVALUATOR || defaultModel,
      ),
    },
    contentBucket,
    // Per-OpenRouter-call timeout. openrouter.ts can make up to TWO sequential
    // calls (the initial call + one reparse attempt on malformed JSON), so
    // this must leave room for both plus self-check/S3-write inside the
    // Lambda's own timeout (120s, content-studio-stack.ts) — 45s x 2 = 90s,
    // leaving ~30s of margin.
    modelTimeoutMs: intFromEnv("OPENROUTER_TIMEOUT_MS", 45_000),
  };
}

export { ConfigError };
