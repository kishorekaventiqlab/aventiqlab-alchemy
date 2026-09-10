import type { ErrorBody, ErrorCode } from "@aventiqlab/alchemy-core";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found`);
export const badRequest = (message: string, details?: unknown) => new ApiError(400, "bad_request", message, details);
export const validationFailed = (message: string, details?: unknown) => new ApiError(422, "validation_failed", message, details);
export const conflict = (message: string, details?: unknown) => new ApiError(409, "conflict", message, details);
export const forbidden = (message: string) => new ApiError(403, "forbidden", message);

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const BASE_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(status: number, body: unknown): HttpResponse {
  return { statusCode: status, headers: { ...BASE_HEADERS }, body: JSON.stringify(body) };
}

export function errorResponse(err: unknown, requestId?: string): HttpResponse {
  if (err instanceof ApiError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.details !== undefined) body.error.details = err.details;
    return json(err.status, body);
  }
  console.error("unhandled error", { requestId, err });
  const body: ErrorBody = { error: { code: "internal", message: "internal error" } };
  return json(500, body);
}

export function parseJsonBody(body: string | null | undefined, isBase64?: boolean): unknown {
  if (!body) throw badRequest("request body is required");
  const text = isBase64 ? Buffer.from(body, "base64").toString("utf8") : body;
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("request body must be valid JSON");
  }
}

export function encodeCursor(key: Record<string, unknown> | undefined): string | null {
  return key ? Buffer.from(JSON.stringify(key)).toString("base64url") : null;
}

export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw badRequest("invalid cursor");
}
