/**
 * The OpenRouter model client. OpenRouter is OpenAI-API-compatible, so the
 * `openai` SDK with a base-URL override.
 *
 * alchemy runs NO astra-style retry loop (contract §7.1, §8 — astra drives
 * retries). The only in-request retry here is ONE reparse of malformed JSON.
 *
 * Errors are mapped to contract §9 codes:
 *   timeout / abort        -> model_provider_timeout   (504, retryable)
 *   429 / quota / billing   -> model_provider_quota_exceeded (503, NOT retryable)
 *   5xx / network / other   -> model_provider_unavailable (503, retryable)
 *   unparseable JSON x2      -> malformed_model_response (502, retryable)
 */
import OpenAI from "openai";
import { ServiceError } from "../errors/envelope.js";
import type { GenerationConfig } from "../config.js";

export interface ModelCallInput {
  system: string;
  user: string;
  model: string;
  /** JSON schema the response must match (JSON-mode structure hint). */
  responseSchema: object;
  schemaName: string;
}

export interface ModelCallResult {
  parsed: unknown;
  /** The raw model text — stored in the error envelope on a later self-check failure. */
  raw: string;
  model: string;
}

export interface ModelClient {
  generateJson(input: ModelCallInput): Promise<ModelCallResult>;
}

function mapOpenAiError(err: unknown): ServiceError {
  const status = (err as { status?: number }).status;
  const name = (err as { name?: string }).name;
  const message = (err as { message?: string }).message ?? "model call failed";

  if (name === "AbortError" || /timeout|timed out/i.test(message)) {
    return new ServiceError("model_provider_timeout", "The model call timed out.", err);
  }
  if (status === 429 || /quota|insufficient_quota|billing|credit/i.test(message)) {
    return new ServiceError(
      "model_provider_quota_exceeded",
      "The model provider is out of quota or credits.",
      err,
    );
  }
  if (status === undefined || status >= 500) {
    return new ServiceError("model_provider_unavailable", "The model provider is unavailable.", err);
  }
  // 4xx other than 429 — a request-shape problem on our side; not the caller's.
  return new ServiceError("generation_failed", `Model request rejected: ${message}`, err);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Fast path.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip a ```json fence if the model added one despite instructions.
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fence && fence[1]) {
    return JSON.parse(fence[1].trim());
  }
  // Grab the outermost {...}.
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  throw new SyntaxError("no JSON object found in model output");
}

export class OpenRouterClient implements ModelClient {
  readonly #client: OpenAI;
  readonly #timeoutMs: number;

  constructor(config: GenerationConfig) {
    this.#client = new OpenAI({
      apiKey: config.openRouterApiKey,
      baseURL: config.openRouterBaseUrl,
      timeout: config.modelTimeoutMs,
      maxRetries: 0, // astra owns retries; we do not
    });
    this.#timeoutMs = config.modelTimeoutMs;
  }

  async generateJson(input: ModelCallInput): Promise<ModelCallResult> {
    const call = (extraUserSuffix?: string) =>
      this.#client.chat.completions.create({
        model: input.model,
        messages: [
          { role: "system", content: input.system },
          {
            role: "user",
            content: extraUserSuffix ? `${input.user}\n\n${extraUserSuffix}` : input.user,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      });

    let raw = "";
    try {
      const res = await call();
      raw = res.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw mapOpenAiError(err);
    }

    try {
      return { parsed: extractJson(raw), raw, model: input.model };
    } catch {
      /* one reparse attempt */
    }

    // Ask the model to fix its own JSON — a single in-request retry, not the
    // astra loop.
    let raw2 = "";
    try {
      const res2 = await call(
        "Your previous response was not valid JSON. Reply again with ONLY the JSON object, nothing else.",
      );
      raw2 = res2.choices[0]?.message?.content ?? "";
    } catch (err) {
      throw mapOpenAiError(err);
    }

    try {
      return { parsed: extractJson(raw2), raw: raw2, model: input.model };
    } catch {
      throw new ServiceError(
        "malformed_model_response",
        "The model did not return valid JSON after a reparse attempt.",
        { raw, raw2 },
      );
    }
  }
}
