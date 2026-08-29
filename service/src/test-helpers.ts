/**
 * Test-only helpers: a fixed config and a token minter, so the auth matrix can
 * be exercised with no AWS and no real secret.
 */
import { SignJWT } from "jose";
import type { ServiceConfig } from "./config.js";

export const TEST_SECRET = "test-secret-at-least-32-chars-long-000";

export const TEST_CONFIG: ServiceConfig = {
  jwtSecret: TEST_SECRET,
  jwtIssuer: "aventiqlab-astra",
  jwtAudience: "aventiqlab-alchemy",
  jwtClockToleranceSec: 30,
  region: "ap-south-1",
  logLevel: "silent",
  port: 0,
  nodeEnv: "test",
  // Default: generation config resolution fails (no key) -> not_configured.
  // Tests that exercise /v1/generate pass a generateDepsOverride to buildApp
  // instead, so this loader is never actually called for those.
  generation: async () => {
    throw new Error("OPENROUTER_API_KEY not set in tests — use generateDepsOverride");
  },
};

export interface MintOptions {
  secret?: string;
  issuer?: string;
  audience?: string;
  sub?: string | null;
  /** seconds from now; negative => already expired. Pass null to omit exp. */
  expiresInSec?: number | null;
  alg?: "HS256" | "HS384";
  omitSub?: boolean;
}

/** Mint a service token. Defaults produce a valid astra -> alchemy token. */
export async function mintToken(opts: MintOptions = {}): Promise<string> {
  const {
    secret = TEST_SECRET,
    issuer = "aventiqlab-astra",
    audience = "aventiqlab-alchemy",
    sub = "cexp_01TEST",
    expiresInSec = 300,
    alg = "HS256",
    omitSub = false,
  } = opts;

  const key = new TextEncoder().encode(secret);
  let builder = new SignJWT({}).setProtectedHeader({ alg }).setIssuedAt().setIssuer(issuer).setAudience(audience);

  if (!omitSub && sub !== null) builder = builder.setSubject(sub);
  if (expiresInSec !== null) {
    builder = builder.setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSec);
  }

  return builder.sign(key);
}

/** An `alg: none` token — must always be rejected. */
export function mintUnsignedToken(sub = "cexp_01TEST"): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "aventiqlab-astra",
      aud: "aventiqlab-alchemy",
      sub,
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString("base64url");
  return `${header}.${payload}.`;
}
