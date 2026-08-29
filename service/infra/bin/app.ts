#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { AlchemyContentStudioStack } from "../lib/content-studio-stack.js";

const app = new App();

const account = app.node.tryGetContext("alchemy:account") as string;
const region = app.node.tryGetContext("alchemy:region") as string;

// AL5's RenderCompute creates a VPC, which needs to know the account's
// availability zones. A real lookup requires assuming a role in the target
// account (880636108741) — this dev machine's credentials are a different
// account, so that lookup always fails locally. Supply the AZ names directly
// so `cdk synth` never needs the lookup; a real deploy (different creds) can
// override this the same way, or let CDK look it up for real there.
if (!app.node.tryGetContext(`availability-zones:account=${account}:region=${region}`)) {
  app.node.setContext(`availability-zones:account=${account}:region=${region}`, [
    `${region}a`,
    `${region}b`,
    `${region}c`,
  ]);
}

new AlchemyContentStudioStack(app, "AlchemyContentStudio", {
  env: { account, region },
  description:
    "alchemy Content Studio pipeline — request-service Lambda (AL2) + content bucket (AL7). See docs/adr/0001.",
});
