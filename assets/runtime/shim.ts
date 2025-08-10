/// <reference lib="deno.ns" />
/// <reference lib="dom" />
// Lambda Runtime API loop for Deno
const runtimeApi = Deno.env.get("AWS_LAMBDA_RUNTIME_API")!;
const handlerSpec = Deno.env.get("_HANDLER") ?? "mod.handler";

const [modulePath, exportName] = (() => {
    const [file, fn = "handler"] = handlerSpec.split(".");
    return [`/var/task/${file}.ts`, fn];
})();

// Load handler with fallback support
let handler: (event: unknown, context: unknown) => unknown;
try {
    const m = await import(`file://${modulePath}`);
    const fn = (m as Record<string, unknown>)[exportName] ??
        (m as Record<string, unknown>).default;
    if (typeof fn !== "function") {
        throw new Error(`Handler "${exportName}" is not a function`);
    }
    handler = fn as (event: unknown, context: unknown) => unknown;
} catch (e) {
    // Try .js fallback
    try {
        const jsPath = modulePath.replace(".ts", ".js");
        const m = await import(`file://${jsPath}`);
        const fn = (m as Record<string, unknown>)[exportName] ??
            (m as Record<string, unknown>).default;
        if (typeof fn !== "function") {
            throw new Error(`Handler "${exportName}" is not a function`);
        }
        handler = fn as (event: unknown, context: unknown) => unknown;
    } catch {
        console.error(`Failed to load handler: ${e}`);
        Deno.exit(1);
    }
}

const baseUrl = `http://${runtimeApi}/2018-06-01/runtime/invocation`;

while (true) {
    let reqId: string;
    let deadline: number;
    
    try {
        const res = await fetch(`${baseUrl}/next`);
        reqId = res.headers.get("Lambda-Runtime-Aws-Request-Id")!;
        deadline = parseInt(res.headers.get("Lambda-Runtime-Deadline-Ms") || "0");
        const event = await res.json();
        
        // Build Lambda context
        const context = {
            awsRequestId: reqId,
            functionName: Deno.env.get("AWS_LAMBDA_FUNCTION_NAME"),
            functionVersion: Deno.env.get("AWS_LAMBDA_FUNCTION_VERSION"),
            memoryLimitInMB: Deno.env.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE"),
            getRemainingTimeInMillis: () => Math.max(0, deadline - Date.now()),
        };
        
        const result = await handler(event, context);
        
        await fetch(`${baseUrl}/${reqId}/response`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(result),
        });
    } catch (e) {
        const error = e as Error;
        await fetch(`${baseUrl}/${reqId!}/error`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                errorType: error?.constructor?.name || "Error",
                errorMessage: String(error),
                stackTrace: error?.stack?.split?.("\n") || [],
            }),
        });
    }
}
