/**
 * AWS Lambda entrypoint (container image). The same Fastify app object from
 * buildApp(), adapted with @fastify/aws-lambda. Behind a Lambda Function URL
 * (AuthType: NONE — our JWT preHandler is the actual gate) or an API Gateway
 * HTTP API.
 *
 * The app (and thus config + secret resolution) is built once per cold start.
 */
import awsLambdaFastify from "@fastify/aws-lambda";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { buildApp } from "./app.js";

const appPromise = buildApp();

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  const app = await appPromise;
  const proxy = awsLambdaFastify(app);
  return proxy(event, context);
};
