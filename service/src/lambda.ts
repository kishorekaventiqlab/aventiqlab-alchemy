/**
 * AWS Lambda entrypoint (container image). The same Fastify app object from
 * buildApp(), adapted with @fastify/aws-lambda in streamed mode. Behind a
 * Lambda Function URL with InvokeMode RESPONSE_STREAM (AuthType: NONE — our
 * JWT preHandler is the actual gate; content-studio-stack.ts).
 *
 * Streamed, not buffered: a Function URL in the default BUFFERED invoke mode
 * hard-caps the client-visible response at 29s regardless of the Lambda's own
 * Timeout — a real /v1/generate call (~25-30s, more for video) was getting
 * killed mid-request. RESPONSE_STREAM has no such cap while the Lambda is
 * still running. This does NOT stream partial output to the client — every
 * route still builds its full JSON body before calling reply.send() — it only
 * changes the transport so a slow-but-legitimate response isn't cut off.
 *
 * The app (and thus config + secret resolution) is built once per cold start.
 * awsLambdaFastify(app, opts) must ALSO be created only once: it decorates the
 * Fastify instance and calls app.ready() internally, and Fastify forbids
 * adding a decorator after the instance has started — calling
 * awsLambdaFastify(app, opts) again on a warm invocation throws
 * FST_ERR_DEC_AFTER_START. So the proxy, not just the app, is memoized.
 */
import awsLambdaFastify from "@fastify/aws-lambda";
import type { Context } from "aws-lambda";
import { pipeline } from "node:stream/promises";
import { buildApp } from "./app.js";

const proxyPromise = buildApp().then((app) => awsLambdaFastify(app, { payloadAsStream: true }));

export const handler = awslambda.streamifyResponse(
  async (event: unknown, responseStream: awslambda.HttpResponseStream, context: Context) => {
    const proxy = await proxyPromise;
    const { meta, stream } = await proxy(event, context);
    const httpStream = awslambda.HttpResponseStream.from(responseStream, { ...meta });
    await pipeline(stream, httpStream);
  },
);
