#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { AlchemyContentStudioStack } from "../lib/content-studio-stack.js";

const app = new App();

const account = app.node.tryGetContext("alchemy:account") as string;
const region = app.node.tryGetContext("alchemy:region") as string;

new AlchemyContentStudioStack(app, "AlchemyContentStudio", {
  env: { account, region },
  description:
    "alchemy Content Studio pipeline — request-service Lambda (AL2) + content bucket (AL7). See docs/adr/0001.",
});
