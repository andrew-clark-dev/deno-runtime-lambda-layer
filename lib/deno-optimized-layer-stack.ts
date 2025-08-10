import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DockerImage } from "aws-cdk-lib";

export interface DenoOptimizedLayerStackProps extends cdk.StackProps {
  archStr?: "arm64" | "x86_64";
  denoVersion?: string;
}

export function createDenoOptimizedLayerStack(scope: Construct, id: string, props?: DenoOptimizedLayerStackProps): { stack: cdk.Stack; layer: lambda.ILayerVersion } {
  const stack = new cdk.Stack(scope, id, props);

  const archStr = props?.archStr ?? "arm64";
  const denoVersion = props?.denoVersion ?? "v1.45.5";

  const architecture = archStr === "x86_64"
    ? lambda.Architecture.X86_64
    : lambda.Architecture.ARM_64;

  const denoAsset = archStr === "x86_64"
    ? "deno-x86_64-unknown-linux-gnu.zip"
    : "deno-aarch64-unknown-linux-gnu.zip";

  const layer = new lambda.LayerVersion(stack, "DenoOptimizedRuntimeLayer", {
    description: `Deno optimized runtime ${denoVersion} (${archStr}) - fast cold starts`,
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
            
            // Copy optimized bootstrap and shim
            "cp /asset-input/bootstrap-optimized /asset-output/bootstrap",
            "cp /asset-input/shim-optimized.ts /asset-output/runtime/shim.ts",
            "chmod +x /asset-output/bootstrap",
            
            // Download and install Deno
            `curl -L https://github.com/denoland/deno/releases/download/${denoVersion}/${denoAsset} -o /tmp/deno.zip`,
            "unzip -o /tmp/deno.zip -d /tmp >/dev/null",
            "mv /tmp/deno /asset-output/bin/deno",
            "chmod +x /asset-output/bin/deno",
            
            // Pre-compile shim for faster startup
            "/asset-output/bin/deno compile --allow-net --allow-read --allow-env --output /asset-output/runtime/shim-compiled /asset-output/runtime/shim.ts || true",
            
            // Create optimized Deno cache directory structure
            "mkdir -p /asset-output/.deno/gen /asset-output/.deno/deps",
            
            // Strip debug symbols to reduce size
            "strip /asset-output/bin/deno 2>/dev/null || true",
          ].join(" && "),
        ],
      },
    }),
  });

  new cdk.CfnOutput(stack, "OptimizedLayerArn", { value: layer.layerVersionArn });
  new cdk.CfnOutput(stack, "OptimizedLayerArch", { value: archStr });
  new cdk.CfnOutput(stack, "OptimizedDenoVersion", { value: denoVersion });

  return { stack, layer };
}