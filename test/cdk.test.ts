import { Template } from "aws-cdk-lib/assertions";
import * as cdk from "aws-cdk-lib";
import { createDenoLayerStack } from "../lib/deno-layer-stack";
import { createDenoExampleFnStack } from "../lib/deno-example-stack";

describe("Deno Layer Stack", () => {
    test("creates layer with correct properties", () => {
        const app = new cdk.App();
        const { stack } = createDenoLayerStack(app, "TestStack", {
            archStr: "arm64",
            denoVersion: "v1.45.5",
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::Lambda::LayerVersion", {
            Description: "Deno custom runtime v1.45.5 (arm64)",
            CompatibleRuntimes: ["provided.al2"],
            CompatibleArchitectures: ["arm64"],
        });

        template.hasOutput("LayerArn", {});
        template.hasOutput("LayerArch", { Value: "arm64" });
        template.hasOutput("DenoVersion", { Value: "v1.45.5" });
    });

    test("creates x86_64 layer", () => {
        const app = new cdk.App();
        const { stack } = createDenoLayerStack(app, "TestStack", {
            archStr: "x86_64",
            denoVersion: "v1.46.0",
        });

        const template = Template.fromStack(stack);

        template.hasResourceProperties("AWS::Lambda::LayerVersion", {
            Description: "Deno custom runtime v1.46.0 (x86_64)",
            CompatibleArchitectures: ["x86_64"],
        });

        template.hasOutput("LayerArch", { Value: "x86_64" });
        template.hasOutput("DenoVersion", { Value: "v1.46.0" });
    });
});

describe("Deno Example Function Stack", () => {
    test("creates function with layer reference", () => {
        const app = new cdk.App();
        const { layer } = createDenoLayerStack(app, "LayerStack");
        const exampleStack = createDenoExampleFnStack(app, "ExampleStack", {
            archStr: "arm64",
            layerFromStack: layer,
        });

        const template = Template.fromStack(exampleStack);

        template.hasResourceProperties("AWS::Lambda::Function", {
            Runtime: "provided.al2",
            Handler: "mod.handler",
            Architectures: ["arm64"],
            MemorySize: 256,
            Timeout: 15,
        });

        template.hasResourceProperties("AWS::IAM::Role", {
            AssumeRolePolicyDocument: {
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "lambda.amazonaws.com" },
                    Action: "sts:AssumeRole",
                }],
            },
        });

        template.hasOutput("TestFunctionName", {});
        template.hasOutput("TestFunctionUrl", {});
    });

    test("creates function with external layer ARN", () => {
        const app = new cdk.App();
        const exampleStack = createDenoExampleFnStack(app, "ExampleStack", {
            archStr: "x86_64",
            layerArn: "arn:aws:lambda:us-east-1:123456789012:layer:deno-runtime:1",
        });

        const template = Template.fromStack(exampleStack);

        template.hasResourceProperties("AWS::Lambda::Function", {
            Architectures: ["x86_64"],
        });
    });

    test("throws error when no layer provided", () => {
        const app = new cdk.App();
        
        expect(() => {
            createDenoExampleFnStack(app, "ExampleStack", {
                archStr: "arm64",
            });
        }).toThrow("No layer provided");
    });
});