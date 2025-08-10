import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";

export interface DenoExampleFnStackProps extends cdk.StackProps {
    /** 'arm64' or 'x86_64' — must match the layer’s arch */
    archStr?: "arm64" | "x86_64";
    /** Provide this to use an existing layer */
    layerArn?: string;
    /** Or pass a layer object from another stack in the same app */
    layerFromStack?: lambda.ILayerVersion;
}

export class DenoExampleFnStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: DenoExampleFnStackProps) {
        super(scope, id, props);

        const archStr = props?.archStr ?? "arm64";
        const architecture = archStr === "x86_64"
            ? lambda.Architecture.X86_64
            : lambda.Architecture.ARM_64;

        const layer = props?.layerFromStack ??
            (props?.layerArn
                ? lambda.LayerVersion.fromLayerVersionArn(
                    this,
                    "ImportedLayer",
                    props.layerArn,
                )
                : undefined);

        if (!layer) {
            throw new Error(
                "No layer provided. Pass -c layerArn=... or supply layerFromStack.",
            );
        }

        const role = new iam.Role(this, "DenoTestFnRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        });
        role.addManagedPolicy(
            iam.ManagedPolicy.fromAwsManagedPolicyName(
                "service-role/AWSLambdaBasicExecutionRole",
            ),
        );

        const fn = new lambda.Function(this, "DenoTestFunction", {
            runtime: lambda.Runtime.PROVIDED_AL2,
            architecture,
            handler: "mod.handler",
            role,
            memorySize: 256,
            timeout: cdk.Duration.seconds(15),
            code: lambda.Code.fromAsset("function"), // contains mod.ts
            layers: [layer],
            description:
                "Tiny Deno test function backed by the custom runtime layer (separate stack)",
        });

        const url = fn.addFunctionUrl({
            authType: lambda.FunctionUrlAuthType.NONE,
        });

        new cdk.CfnOutput(this, "TestFunctionName", { value: fn.functionName });
        new cdk.CfnOutput(this, "TestFunctionUrl", { value: url.url });
    }
}
