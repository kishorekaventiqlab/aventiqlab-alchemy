/**
 * The generation orchestrator: one /v1/generate request -> one model call ->
 * self-check -> S3 write -> response. No astra-style retry loop (astra drives
 * retries per contract §7.1 / §8).
 */
import { ServiceError } from "../errors/envelope.js";
import { DELIVERABLE_SCHEMA } from "./schemas.js";
import { buildPrompt } from "./prompts.js";
import { selfCheck } from "./selfcheck.js";
import { derivePreview } from "./preview.js";
import { narrationHash, specHash } from "./video-hash.js";
import { SCHEMA_VERSION, type Al3SupportedType, type GenerateRequest, type GenerateResponse } from "./types.js";
import type { ModelClient } from "./openrouter.js";
import type { ArtifactStore } from "./store.js";
import type { Logger } from "./logger.js";

export interface GeneratorDeps {
  model: ModelClient;
  store: ArtifactStore;
  modelByType: Record<string, string>;
  defaultModel: string;
  log: Logger;
}

export async function generateArtifact(
  req: GenerateRequest,
  type: Al3SupportedType,
  deps: GeneratorDeps,
): Promise<GenerateResponse> {
  const model = deps.modelByType[type] ?? deps.defaultModel;
  const prompt = buildPrompt(type, req.learning_context, req.prior_error);
  const key = { experienceId: req.experience_id, artifactType: type, attempt: req.attempt };

  let result;
  try {
    result = await deps.model.generateJson({
      system: prompt.system,
      user: prompt.user,
      model,
      responseSchema: DELIVERABLE_SCHEMA[type] as object,
      schemaName: `${type}_v1`,
    });
  } catch (err) {
    // Model-layer errors (timeout/quota/unavailable/malformed) are already
    // ServiceErrors from openrouter.ts. Record the trail if we have raw output.
    if (err instanceof ServiceError && err.code === "malformed_model_response") {
      await safeWriteError(deps, key, req, model, prompt.promptVersion, err, extractRaw(err));
    }
    throw err;
  }

  const content = result.parsed;
  if (typeof content !== "object" || content === null || Array.isArray(content)) {
    const e = new ServiceError("generation_failed", "Model output was not a JSON object.");
    await safeWriteError(deps, key, req, model, prompt.promptVersion, e, result.raw);
    throw e;
  }

  // Work on a copy — never mutate the parsed model output in place.
  const working = structuredClone(content) as Record<string, unknown>;

  // For video: alchemy computes the pinned hashes (the model is told not to).
  // Done BEFORE self-check so the schema's `narration_hash`/`spec_hash` patterns
  // validate against real values, not model guesses.
  if (type === "video") {
    fillVideoHashes(working);
  }

  const check = selfCheck(type, working);
  if (!check.ok) {
    const e = new ServiceError(
      "generation_failed",
      `Generated ${type} failed self-check: ${check.errors.join("; ")}`,
    );
    await safeWriteError(deps, key, req, model, prompt.promptVersion, e, result.raw);
    throw e;
  }

  const contentObj = working;
  const preview = derivePreview(type, contentObj);

  const envelope = {
    artifact_type: type,
    schema_version: SCHEMA_VERSION[type],
    content: contentObj,
    preview,
    s3_pointer: "", // filled after the write
    metadata: {
      experience_id: req.experience_id,
      attempt: req.attempt,
      prompt_version: prompt.promptVersion,
      model,
      generated_at: new Date().toISOString(),
    },
  };

  let s3Pointer: string;
  try {
    s3Pointer = await deps.store.putEnvelope(key, { ...envelope, s3_pointer: "" });
  } catch (err) {
    deps.log.error({ err }, "S3 write failed for generated artifact");
    throw new ServiceError("internal_error", "Failed to persist the generated artifact.", err);
  }

  return {
    artifact_type: type,
    schema_version: SCHEMA_VERSION[type],
    content: contentObj,
    preview,
    s3_pointer: s3Pointer,
  };
}

function extractRaw(err: ServiceError): string | null {
  const d = err.internalDetail as { raw2?: string; raw?: string } | undefined;
  return d?.raw2 ?? d?.raw ?? null;
}

/**
 * Set each beat's narration_hash (§1.5) and the top-level spec_hash (§5) on a
 * generated video_spec, overwriting anything the model produced. alchemy owns
 * these values; the pinned formulas live in video-hash.ts.
 */
function fillVideoHashes(spec: Record<string, unknown>): void {
  const voice = spec.voice ?? {};
  const beats = Array.isArray(spec.beats) ? (spec.beats as Array<Record<string, unknown>>) : [];
  for (const b of beats) {
    b.narration_hash = narrationHash(String(b.narration ?? ""), voice);
  }
  spec.spec_hash = specHash(spec as never);
}

async function safeWriteError(
  deps: GeneratorDeps,
  key: { experienceId: string; artifactType: string; attempt: number },
  req: GenerateRequest,
  model: string,
  promptVersion: string,
  err: ServiceError,
  raw: string | null,
): Promise<void> {
  try {
    await deps.store.putErrorEnvelope(key, {
      artifact_type: key.artifactType,
      experience_id: req.experience_id,
      attempt: req.attempt,
      error: { code: err.code, message: err.message },
      raw_model_output: raw,
      prompt_version: promptVersion,
      model,
      failed_at: new Date().toISOString(),
    });
  } catch (writeErr) {
    deps.log.error({ err: writeErr }, "failed to write attempt-N.error.json (non-fatal)");
  }
}
