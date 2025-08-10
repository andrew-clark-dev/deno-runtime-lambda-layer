#!/usr/bin/env node
import process from "node:process";
import * as cdk from "aws-cdk-lib";
import { createDenoLayerStack } from "../lib/deno-layer-stack";
import { createDenoExampleFnStack } from "../lib/deno-example-stack";

const app = new cdk.App();
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

// Context knobs
const archStr = (app.node.tryGetContext("architecture") ?? "arm64") as
  | "arm64"
  | "x86_64";
const denoVersion = app.node.tryGetContext("denoVersion") ?? "v1.45.5";

// Deploy the layer stack
const { stack: layerStack, layer } = createDenoLayerStack(app, "DenoRuntimeLayerStack", {
  env,
  archStr,
  denoVersion,
});

// Deploy the example Lambda stack
const exampleStack = createDenoExampleFnStack(app, "DenoExampleFnStack", {
  env,
  archStr,
  layerArn: app.node.tryGetContext("layerArn") || undefined,
  layerFromStack: app.node.tryGetContext("layerArn") ? undefined : layer,
});

if (!app.node.tryGetContext("layerArn")) {
  exampleStack.addDependency(layerStack);
}
