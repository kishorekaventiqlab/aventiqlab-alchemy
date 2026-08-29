/**
 * Mint a service token for poking the running service locally:
 *
 *   ALCHEMY_SERVICE_JWT_SECRET=... npm run mint-test-token -- --sub cexp_01ABC
 *   curl -H "Authorization: Bearer $(npm run -s mint-test-token)" localhost:3000/v1/whoami
 *
 * Not used in production — a real token comes from astra.
 */
import { SignJWT } from "jose";

const args = process.argv.slice(2);
const getArg = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

const secret = process.env.ALCHEMY_SERVICE_JWT_SECRET;
if (!secret) {
  console.error("Set ALCHEMY_SERVICE_JWT_SECRET in the environment.");
  process.exit(1);
}

const token = await new SignJWT({})
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setIssuer(getArg("iss", "aventiqlab-astra"))
  .setAudience(getArg("aud", "aventiqlab-alchemy"))
  .setSubject(getArg("sub", "cexp_01LOCALTEST"))
  .setExpirationTime(getArg("exp", "5m"))
  .sign(new TextEncoder().encode(secret));

process.stdout.write(token + "\n");
