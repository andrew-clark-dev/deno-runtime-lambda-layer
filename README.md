# Deno Custom Runtime **Layer** for AWS Lambda

A minimal CDK project that builds and publishes a **Deno custom runtime** as a **Lambda layer**.  
Optionally, you can deploy a tiny **example function** that uses the layer.

---

## Prerequisites

- **AWS account** + credentials configured (`aws configure` or SSO).
- **Node.js** 18+ and **npm**.
- **AWS CDK v2** (`npm i -g aws-cdk`), or use `npx cdk …`.
- **Docker** running (only needed for Docker bundling path).  
  > On macOS, we run the container **as root** inside bundling to avoid `rpmdb` permission errors.

---

## Project structure

```text
.
├─ assets/
│  └─ runtime/
│     ├─ bootstrap           # starts the runtime (executes Deno/shim)
│     └─ shim.ts             # Runtime API loop that invokes your handler
├─ function/
│  └─ mod.ts                 # (optional) example Deno handler
├─ bin/
│  └─ deno-layer.ts          # CDK app entry
├─ lib/
│  ├─ deno-layer-stack.ts    # Stack that builds the layer
│  └─ deno-example-stack.ts  # Stack that deploys a test Lambda (optional)
└─ cdk.json / package.json / tsconfig.json
```

---

## Configure

You can control architecture and Deno version via **CDK context**:

- `architecture`: `arm64` (default) or `x86_64`  
- `denoVersion`: e.g. `v1.45.5`

These control which Deno binary is included:

- `arm64` → `deno-aarch64-unknown-linux-gnu`
- `x86_64` → `deno-x86_64-unknown-linux-gnu`

> On Apple Silicon building **x86_64** layers, make sure the bundling uses `platform: 'linux/amd64'` (already hinted in comments).

---

## Install & bootstrap

```bash
npm install

# First time in an account/region:
npx cdk bootstrap
```

---

## Build

```bash
npm run build
```

This compiles the CDK app (TypeScript → JS).  
The layer content itself is assembled during **synth/deploy** via a Docker bundling step.

---

## Deploy the **layer only**

```bash
# ARM64 (recommended for price/perf)
npx cdk deploy DenoRuntimeLayerStack -c architecture=arm64 -c denoVersion=v1.45.5

# or x86_64
npx cdk deploy DenoRuntimeLayerStack -c architecture=x86_64 -c denoVersion=v1.45.5
```

**Outputs:**

- `LayerArn` – the ARN to attach to functions
- `LayerArch` – the architecture you built
- `DenoVersion` – the Deno version included

---

## Use the layer in a Lambda (Console)

1. Create a new function:
   - **Runtime:** *Custom runtime on Amazon Linux 2* (`provided.al2`)
   - **Architecture:** must match the layer (`arm64` or `x86_64`)
   - **Execution role:** include `AWSLambdaBasicExecutionRole`
2. **Add a layer:** choose “Custom layers” and select the ARN from the output.
3. Set **Handler** to `mod.handler`.
4. Upload a zip containing a single file `mod.ts` (example below).

Example `mod.ts`:

```ts
export function handler(event: unknown) {
  return {
    message: 'Hello from Deno on Lambda!',
    echo: event,
    runtime: `Deno ${Deno.version.deno}`,
    ts: new Date().toISOString(),
  };
}
```

Zip it locally:

```bash
zip -r function.zip mod.ts
```

---

## (Optional) Deploy the example Lambda stack

Deploy both stacks (the example references the layer via a cross-stack ref):

```bash
# Using the freshly deployed layer from DenoRuntimeLayerStack
npx cdk deploy DenoRuntimeLayerStack DenoExampleFnStack -c createExample=true -c architecture=arm64
```

Or point the example stack at an **existing** layer ARN:

```bash
npx cdk deploy DenoExampleFnStack   -c createExample=true   -c layerArn=arn:aws:lambda:REGION:ACCOUNT:layer:deno-runtime:VERSION   -c architecture=arm64
```

**Outputs:**

- `TestFunctionName`
- `TestFunctionUrl` (public function URL for quick testing)

Test with curl:

```bash
curl -s "https://<function-url>/" -d '{}' | jq
```

Or via AWS CLI:

```bash
aws lambda invoke --function-name "<name-from-output>" --payload '{}' out.json
cat out.json
```

---

## Updating the layer

Change `denoVersion` or any files under `assets/runtime/`, then deploy again:

```bash
npx cdk deploy DenoRuntimeLayerStack -c architecture=arm64 -c denoVersion=v1.46.3
```

Each deploy publishes a **new layer version** (existing functions keep using their pinned version until you update them).

---

## Troubleshooting

**“Cannot connect to the Docker daemon …”**  
Start Docker Desktop and re-run the deploy. The bundling step runs inside an `amazonlinux:2` container.

**`ovl: Error while doing RPMdb copy-up / permission denied` during bundling**  
We run bundling as `user: 'root'` in the CDK code to avoid this on macOS. If you removed it, add it back.

**`/opt/bin/deno: Exec format error` at runtime**  
Architecture mismatch. Fix one of:

- Deploy the function as **ARM64** if the layer is ARM64.
- Or deploy an **x86_64** layer and attach it to an x86_64 function.

**Cold starts / dependency cache**  
`bootstrap` sets `DENO_DIR=/tmp/.deno` so Deno caches across warm invocations.

---

## Clean up

```bash
# Remove the example function (if deployed)
npx cdk destroy DenoExampleFnStack

# Then the layer
npx cdk destroy DenoRuntimeLayerStack
```

> Note: Layers don’t support AWS tags. Use naming conventions and/or store metadata (e.g., in SSM Parameter Store) if you need discoverability.

---

## How it works (quick refresher)

- A **custom runtime** in Lambda is an executable named `bootstrap` that implements the **Runtime API** loop.
- Our layer provides:
  - `/opt/bootstrap` → launches Deno with the proper flags.
  - `/opt/runtime/shim.ts` → polls the Runtime API, imports your handler (`_HANDLER`, e.g., `mod.handler`), and posts responses.
- Functions use `Runtime: provided.al2` and attach this layer to run Deno code directly (TS or JS).
