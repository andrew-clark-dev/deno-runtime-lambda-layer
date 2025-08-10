#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DenoLayerStack } from "../lib/deno-layer-stack";
import { DenoExampleFnStack } from "../lib/deno-example-stack";

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

// Deploy the layer stack (always)
const layerStack = new DenoLayerStack(app, "DenoRuntimeLayerStack", {
  env,
  archStr,
  denoVersion,
});

// Optionally deploy the example Lambda stack:
// - use `-c layerArn=...` to point at an existing layer
// - otherwise it will wire to the layer from the stack above
const createExample = app.node.tryGetContext("createExample") === "true" ||
  app.node.tryGetContext("createExample") === true;

if (createExample) {
  new DenoExampleFnStack(app, "DenoExampleFnStack", {
    env,
    archStr,
    // prefer explicit ARN if provided
    layerArn: app.node.tryGetContext("layerArn") || undefined,
    // otherwise pass the layer from the first stack
    layerFromStack: layerStack.layer,
  });
}
