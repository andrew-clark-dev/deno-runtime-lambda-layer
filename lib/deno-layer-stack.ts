import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DockerImage } from "aws-cdk-lib";

export interface DenoLayerStackProps extends cdk.StackProps {
  archStr?: "arm64" | "x86_64";
  denoVersion?: string;
}

export function createDenoLayerStack(scope: Construct, id: string, props?: DenoLayerStackProps): { stack: cdk.Stack; layer: lambda.ILayerVersion } {
  const stack = new cdk.Stack(scope, id, props);

  const archStr = props?.archStr ?? "arm64";
  const denoVersion = props?.denoVersion ?? "v1.45.5";

  const architecture = archStr === "x86_64"
    ? lambda.Architecture.X86_64
    : lambda.Architecture.ARM_64;

  const denoAsset = archStr === "x86_64"
    ? "deno-x86_64-unknown-linux-gnu.zip"
    : "deno-aarch64-unknown-linux-gnu.zip";

  const layer = new lambda.LayerVersion(stack, "DenoRuntimeLayer", {
    description: `Deno custom runtime ${denoVersion} (${archStr})`,
    compatibleRuntimes: [lambda.Runtime.PROVIDED_AL2],
    compatibleArchitectures: [architecture],
    code: lambda.Code.fromAsset("assets/runtime", {
      bundling: {
        image: DockerImage.fromRegistry(
          "public.ecr.aws/amazonlinux/amazonlinux:2",
        ),
        user: "root",
        command: [
          "bash",
          "-lc",
          [
            "set -euo pipefail",
            "yum -y install curl unzip >/dev/null",
            "mkdir -p /asset-output/bin /asset-output/runtime",
            "cp /asset-input/bootstrap /asset-output/bootstrap",
            "cp /asset-input/shim.ts  /asset-output/runtime/shim.ts",
            "chmod +x /asset-output/bootstrap",
            `curl -L https://github.com/denoland/deno/releases/download/${denoVersion}/${denoAsset} -o /tmp/deno.zip`,
            "unzip -o /tmp/deno.zip -d /tmp >/dev/null",
            "mv /tmp/deno /asset-output/bin/deno",
            "chmod +x /asset-output/bin/deno",
          ].join(" && "),
        ],
      },
    }),
  });

  new cdk.CfnOutput(stack, "LayerArn", { value: layer.layerVersionArn });
  new cdk.CfnOutput(stack, "LayerArch", { value: archStr });
  new cdk.CfnOutput(stack, "DenoVersion", { value: denoVersion });

  return { stack, layer };
}