/**
 * Service-token verification (contract §2.3).
 *
 * astra -> alchemy tokens are HS256 JWTs with:
 *   iss = "aventiqlab-astra"        (rejected otherwise)
 *   aud = "aventiqlab-alchemy"      (rejected otherwise — this is what distinguishes
 *                                    a Content Studio token; mirrors the aud design
 *                                    on the platform -> astra side)
 *   sub = <experience_id>           (required, non-empty; returned to the caller)
 *   exp = <unix seconds>            (required; must be in the future)
 *   iat = <unix seconds>            (optional; checked if present)
 *
 * We NEVER trust the token's own `alg` header — HS256 is the only accepted
 * algorithm, set explicitly. `none` and any asymmetric-alg token is rejected.
 */
import { jwtVerify, errors as joseErrors } from "jose";
import { unauthorized } from "../errors/envelope.js";
import type { ServiceConfig } from "../config.js";

export interface ServiceAuth {
  /** The JWT `sub` — an astra experience_id (cexp_<ulid>). */
  sub: string;
}

export interface JwtVerifierOptions {
  secret: string;
  issuer: string;
  audience: string;
  clockToleranceSec: number;
}

export function jwtVerifierFromConfig(config: ServiceConfig): JwtVerifier {
  return new JwtVerifier({
    secret: config.jwtSecret,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    clockToleranceSec: config.jwtClockToleranceSec,
  });
}

export class JwtVerifier {
  readonly #key: Uint8Array;
  readonly #issuer: string;
  readonly #audience: string;
  readonly #clockToleranceSec: number;

  constructor(opts: JwtVerifierOptions) {
    this.#key = new TextEncoder().encode(opts.secret);
    this.#issuer = opts.issuer;
    this.#audience = opts.audience;
    this.#clockToleranceSec = opts.clockToleranceSec;
  }

  /**
   * Verify a raw bearer token. Returns { sub } on success; throws a
   * ServiceError(code: "unauthorized") with a generic message on any failure
   * (the specific reason is never surfaced to the caller, only logged upstream).
   */
  async verify(rawToken: string): Promise<ServiceAuth> {
    if (!rawToken) throw unauthorized();

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      ({ payload } = await jwtVerify(rawToken, this.#key, {
        algorithms: ["HS256"], // explicit allow-list — never read alg from the token
        issuer: this.#issuer,
        audience: this.#audience,
        clockTolerance: this.#clockToleranceSec,
        // jose requires `exp` when maxTokenAge is set; we enforce exp presence
        // explicitly below so the message is ours, not jose's.
      }));
    } catch (err) {
      // Normalise every jose failure mode to one opaque 401.
      if (
        err instanceof joseErrors.JWTExpired ||
        err instanceof joseErrors.JWTClaimValidationFailed ||
        err instanceof joseErrors.JWSSignatureVerificationFailed ||
        err instanceof joseErrors.JWSInvalid ||
        err instanceof joseErrors.JWTInvalid ||
        err instanceof joseErrors.JOSEAlgNotAllowed
      ) {
        throw unauthorized();
      }
      throw unauthorized();
    }

    if (typeof payload.exp !== "number") {
      throw unauthorized();
    }
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw unauthorized();
    }

    return { sub: payload.sub };
  }
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header value. */
export function bearerFromHeader(headerValue: string | undefined): string {
  if (!headerValue) throw unauthorized("Missing Authorization header.");
  const match = /^Bearer (.+)$/.exec(headerValue.trim());
  if (!match || !match[1]) throw unauthorized("Malformed Authorization header.");
  return match[1];
}
