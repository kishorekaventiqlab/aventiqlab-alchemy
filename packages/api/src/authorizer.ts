/**
 * API Gateway REQUEST authorizer. Two opaque bearer tokens live in Secrets
 * Manager: a READ token (handed to the AventiqLab platform) and a PUBLISH
 * token (handed to the publishing CLI). The policy returned restricts read
 * tokens to GET routes at the gateway; the service enforces scope again.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import type { APIGatewayAuthorizerResult, APIGatewayRequestAuthorizerEvent } from "aws-lambda";

export interface TokenSet {
  read: string;
  publish: string;
}

export interface Decision {
  scope: "read" | "publish";
  actor: string;
}

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

function equal(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function extractBearer(headers: Record<string, string | undefined> | null | undefined): string | null {
  if (!headers) return null;
  const raw = Object.entries(headers).find(([k]) => k.toLowerCase() === "authorization")?.[1];
  if (!raw) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return m ? m[1]! : null;
}

/** Pure decision: which scope does this token carry, if any. */
export function decide(token: string | null, tokens: TokenSet): Decision | null {
  if (!token || token.length < 16) return null;
  if (tokens.publish && equal(token, tokens.publish)) return { scope: "publish", actor: "token:publish" };
  if (tokens.read && equal(token, tokens.read)) return { scope: "read", actor: "token:read" };
  return null;
}

/** arn:aws:execute-api:{region}:{account}:{apiId}/{stage}/{METHOD}/{path} -> arn:...:{apiId}/{stage} */
export function apiBaseArn(methodArn: string): string {
  const parts = methodArn.split("/");
  return `${parts[0]}/${parts[1]}`;
}

export function buildPolicy(decision: Decision, methodArn: string): APIGatewayAuthorizerResult {
  const base = apiBaseArn(methodArn);
  const resources = decision.scope === "publish" ? [`${base}/*/*`] : [`${base}/GET/*`];
  return {
    principalId: decision.actor,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: resources }],
    },
    context: { scope: decision.scope, actor: decision.actor },
  };
}

/* ----------------------------------------------------------- secrets cache */

let cached: { tokens: TokenSet; fetchedAt: number } | undefined;
const CACHE_MS = 5 * 60 * 1000;
let sm: SecretsManagerClient | undefined;

async function secret(arn: string): Promise<string> {
  sm ??= new SecretsManagerClient({});
  const out = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const v = out.SecretString ?? "";
  if (!v) throw new Error(`secret ${arn} is empty`);
  return v.trim();
}

async function loadTokens(): Promise<TokenSet> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.tokens;
  const readArn = process.env.ALCHEMY_READ_TOKEN_SECRET_ARN;
  const publishArn = process.env.ALCHEMY_PUBLISH_TOKEN_SECRET_ARN;
  if (!readArn || !publishArn) throw new Error("token secret ARNs are not configured");
  const [read, publish] = await Promise.all([secret(readArn), secret(publishArn)]);
  cached = { tokens: { read, publish }, fetchedAt: Date.now() };
  return cached.tokens;
}

export async function handler(event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  const tokens = await loadTokens();
  const decision = decide(extractBearer(event.headers), tokens);
  if (!decision) {
    // API Gateway maps this exact string to a 401.
    throw new Error("Unauthorized");
  }
  return buildPolicy(decision, event.methodArn);
}
