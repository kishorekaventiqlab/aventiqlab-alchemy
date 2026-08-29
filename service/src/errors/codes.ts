/**
 * The error-code enum alchemy's Content Studio service can emit, from the frozen
 * contract (aventiqlab-platform/docs/content-studio-pipeline-contract-v1.md v1.3
 * §9 + §7.6). Every non-2xx response body is:
 *
 *   { "error": { "code": <slug>, "message": <human-readable>, "retryable": <bool> } }
 *
 * Platform / astra branch on `code`, never on `message`.
 *
 * AL2 (this task) only *uses* unauthorized / validation_failed / not_configured /
 * internal_error. The generation/render/model codes are defined now so AL3 (§7.1)
 * and AL5 (§7.4) just throw the matching ServiceError subclass.
 */

export interface ErrorCodeSpec {
  httpStatus: number;
  retryable: boolean;
}

export const ERROR_CODES = {
  /** bad/expired JWT, wrong iss/aud, or missing sub. */
  unauthorized: { httpStatus: 401, retryable: false },
  /** request body failed schema validation. */
  validation_failed: { httpStatus: 422, retryable: false },
  /** artifact_type alchemy cannot generate (e.g. "battleground"), or a non-v1 type. */
  unsupported_type: { httpStatus: 422, retryable: false },
  /** AL3: model produced output that failed alchemy's self-check after one reparse. */
  generation_failed: { httpStatus: 502, retryable: true },
  /** AL5: the render pipeline failed. */
  render_failed: { httpStatus: 502, retryable: true },
  /** AL5: unknown render_job_id (or one belonging to a different experience). */
  render_job_not_found: { httpStatus: 404, retryable: false },
  /** AL5: a render is already in progress for this experience, or a call is out of pipeline order. */
  invalid_pipeline_state: { httpStatus: 409, retryable: false },
  /** transient OpenRouter/model outage. */
  model_provider_unavailable: { httpStatus: 503, retryable: true },
  /** model call timed out. */
  model_provider_timeout: { httpStatus: 504, retryable: true },
  /** model returned output that couldn't be parsed at all. */
  malformed_model_response: { httpStatus: 502, retryable: true },
  /** OpenRouter account out of credits/quota — retrying never helps (contract confirmed 2026-08-18). */
  model_provider_quota_exceeded: { httpStatus: 503, retryable: false },
  /** AL6 (§5bis): the underlying S3 object aged out under the lifecycle policy. */
  artifact_expired: { httpStatus: 404, retryable: false },
  /** server-side: a required secret / config value is missing. */
  not_configured: { httpStatus: 500, retryable: false },
  /** catch-all for an unhandled exception. Never leaks the underlying error to the caller. */
  internal_error: { httpStatus: 500, retryable: false },
} as const satisfies Record<string, ErrorCodeSpec>;

export type ErrorCode = keyof typeof ERROR_CODES;

export function isErrorCode(value: string): value is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_CODES, value);
}
