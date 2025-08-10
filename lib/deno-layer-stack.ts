import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DockerImage } from "aws-cdk-lib";

export interface DenoLayerStackProps extends cdk.StackProps {
  archStr?: "arm64" | "x86_64";
  denoVersion?: string;
}

export class DenoLayerStack extends cdk.Stack {
  /** Exported so other stacks (or bin) can reference it */
  public readonly layer: lambda.ILayerVersion;

  constructor(scope: Construct, id: string, props?: DenoLayerStackProps) {
    super(scope, id, props);

    const archStr = props?.archStr ?? "arm64";
    const denoVersion = props?.denoVersion ?? "v1.45.5";

    const architecture = archStr === "x86_64"
      ? lambda.Architecture.X86_64
      : lambda.Architecture.ARM_64;

    const denoAsset = archStr === "x86_64"
      ? "deno-x86_64-unknown-linux-gnu.zip"
      : "deno-aarch64-unknown-linux-gnu.zip";

    // Build the layer in Docker (as root to avoid rpmdb perms on macOS)
    const layer = new lambda.LayerVersion(this, "DenoRuntimeLayer", {
      description: `Deno custom runtime ${denoVersion} (${archStr})`,
      compatibleRuntimes: [lambda.Runtime.PROVIDED_AL2],
      compatibleArchitectures: [architecture],
      code: lambda.Code.fromAsset("assets/runtime", {
        bundling: {
          image: DockerImage.fromRegistry(
            "public.ecr.aws/amazonlinux/amazonlinux:2",
          ),
          user: "root",
          // If you build x86 on Apple Silicon, uncomment:
          // platform: 'linux/amd64',
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

    this.layer = layer;

    new cdk.CfnOutput(this, "LayerArn", { value: layer.layerVersionArn });
    new cdk.CfnOutput(this, "LayerArch", { value: archStr });
    new cdk.CfnOutput(this, "DenoVersion", { value: denoVersion });
  }
}
