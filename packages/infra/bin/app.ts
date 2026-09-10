/**
 * CDK app entry. Account/region come from cdk.json context so a synth never
 * silently targets whatever AWS_PROFILE happens to be active. Deploy with:
 *
 *   npm run deploy --workspace packages/infra   (uses --profile alchemy-developer)
 *
 * Nothing here is deployed automatically. See docs/alchemy-architecture.md §"Deploying".
 */
import { App } from "aws-cdk-lib";
import { AlchemyStack } from "../lib/alchemy-stack.js";

const app = new App();
const account = app.node.tryGetContext("alchemy:account") as string;
const region = app.node.tryGetContext("alchemy:region") as string;
const stage = (app.node.tryGetContext("alchemy:stage") as string | undefined) ?? "prod";
// Browser origins allowed to GET presigned artifact URLs (video playback). The platform's Amplify
// Hosting *.amplifyapp.com origin is not recorded anywhere and must be added by the operator.
const allowedOrigins = (app.node.tryGetContext("alchemy:allowedOrigins") as string[] | undefined) ?? [
  "https://aventiqlab.com",
  "https://www.aventiqlab.com",
  "http://localhost:3000",
];
if (!account || !region) throw new Error("alchemy:account and alchemy:region context are required (see cdk.json)");

new AlchemyStack(app, `AlchemyFoundation-${stage}`, {
  env: { account, region },
  stage,
  allowedOrigins,
  description: "Alchemy: AventiqLab learning content repository (S3 + DynamoDB + REST API).",
  tags: { Project: "aventiqlab-alchemy", Stage: stage, ManagedBy: "cdk" },
});
