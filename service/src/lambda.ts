/**
 * AWS Lambda entrypoint (container image). The same Fastify app object from
 * buildApp(), adapted with @fastify/aws-lambda. Behind a Lambda Function URL
 * (AuthType: NONE — our JWT preHandler is the actual gate) or an API Gateway
 * HTTP API.
 *
 * The app (and thus config + secret resolution) is built once per cold start.
 * awsLambdaFastify(app) must ALSO be created only once: it decorates the
 * Fastify instance and calls app.ready() internally, and Fastify forbids
 * adding a decorator after the instance has started — calling
 * awsLambdaFastify(app) again on a warm invocation throws
 * FST_ERR_DEC_AFTER_START. So the proxy, not just the app, is memoized.
 */
import awsLambdaFastify from "@fastify/aws-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { buildApp } from "./app.js";

const proxyPromise = buildApp().then((app) => awsLambdaFastify(app));

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const proxy = await proxyPromise;
  return proxy(event, context);
};
