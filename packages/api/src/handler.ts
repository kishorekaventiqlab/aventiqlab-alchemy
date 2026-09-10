/**
 * Lambda entry point for the REST API (API Gateway Lambda proxy integration).
 * One function serves every route; the authorizer Lambda (authorizer.ts) has
 * already established the caller's scope by the time we run.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { loadConfig } from "./config.js";
import { DynamoContentStore } from "./dynamo-store.js";
import { route } from "./router.js";
import { S3ObjectStore } from "./s3-store.js";
import { AlchemyService, type Caller, type Scope } from "./service.js";

let service: AlchemyService | undefined;

function getService(): AlchemyService {
  if (!service) {
    const config = loadConfig();
    service = new AlchemyService(new DynamoContentStore(config.tableName), new S3ObjectStore(config.bucketName), config);
  }
  return service;
}

function callerFrom(event: APIGatewayProxyEvent): Caller {
  const ctx = (event.requestContext.authorizer ?? {}) as Record<string, unknown>;
  const scope = ctx.scope === "publish" ? "publish" : "read";
  const actor = typeof ctx.actor === "string" && ctx.actor ? ctx.actor : `token:${scope}`;
  return { scope: scope as Scope, actor };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const query: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(event.queryStringParameters ?? {})) query[k] = v ?? undefined;
  const res = await route(getService(), {
    method: event.httpMethod,
    path: event.path,
    query,
    body: event.body,
    isBase64: event.isBase64Encoded,
    caller: callerFrom(event),
    requestId: event.requestContext.requestId,
  });
  return { statusCode: res.statusCode, headers: res.headers, body: res.body };
}
