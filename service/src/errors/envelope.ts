/**
 * The shared error envelope (contract §9). One ServiceError type carries a
 * contract error `code`; the Fastify error handler renders it (and anything
 * unexpected) into:
 *
 *   { "error": { "code", "message", "retryable" } }
 *
 * The real cause of an unexpected error is logged, never put in the response.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ERROR_CODES, type ErrorCode } from "./codes.js";

export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
  };
}

export class ServiceError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  /** Optional internal detail — logged, never sent to the caller. */
  readonly internalDetail?: unknown;

  constructor(code: ErrorCode, message: string, internalDetail?: unknown) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    const spec = ERROR_CODES[code];
    this.httpStatus = spec.httpStatus;
    this.retryable = spec.retryable;
    this.internalDetail = internalDetail;
  }

  toEnvelope(): ErrorEnvelope {
    return { error: { code: this.code, message: this.message, retryable: this.retryable } };
  }
}

/** Convenience constructors for the codes AL2 uses directly. */
export const unauthorized = (message = "Invalid or expired token.") =>
  new ServiceError("unauthorized", message);

export const validationFailed = (message: string, internalDetail?: unknown) =>
  new ServiceError("validation_failed", message, internalDetail);

export const notConfigured = (message: string) => new ServiceError("not_configured", message);

const GENERIC_INTERNAL = "An internal error occurred.";

/**
 * Wire the envelope onto a Fastify instance: a ServiceError renders to its
 * envelope; a Fastify schema-validation error renders to `validation_failed`;
 * anything else renders to `internal_error` with a generic message (the real
 * error is logged at `error`).
 */
export function registerErrorEnvelope(app: FastifyInstance): void {
  app.setNotFoundHandler((_req: FastifyRequest, reply: FastifyReply) => {
    const err = new ServiceError("validation_failed", "No such route.");
    reply.status(err.httpStatus).send(err.toEnvelope());
  });

  app.setErrorHandler((error, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ServiceError) {
      if (error.httpStatus >= 500) {
        request.log.error(
          { err: error, code: error.code, internalDetail: error.internalDetail },
          "service error (5xx)",
        );
      } else {
        request.log.info({ code: error.code }, "service error (4xx)");
      }
      reply.status(error.httpStatus).send(error.toEnvelope());
      return;
    }

    // Fastify's own schema validation failures.
    const validation = (error as { validation?: unknown }).validation;
    if (validation) {
      const message = error instanceof Error ? error.message : "Request validation failed.";
      const ve = new ServiceError("validation_failed", message);
      request.log.info({ code: ve.code, validation }, "request validation failed");
      reply.status(ve.httpStatus).send(ve.toEnvelope());
      return;
    }

    // Anything else: log the truth, tell the caller nothing.
    request.log.error({ err: error }, "unhandled error");
    const fallback = new ServiceError("internal_error", GENERIC_INTERNAL);
    reply.status(fallback.httpStatus).send(fallback.toEnvelope());
  });
}
