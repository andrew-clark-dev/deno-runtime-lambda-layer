/// <reference lib="deno.ns" />
/// <reference lib="dom" />
// Optimized Lambda Runtime API loop for Deno - fast cold starts
const runtimeApi = Deno.env.get("AWS_LAMBDA_RUNTIME_API")!;
const handlerSpec = Deno.env.get("_HANDLER") ?? "mod.handler";

// Pre-parse handler spec
const [moduleName, exportName] = (() => {
    const [file, fn = "handler"] = handlerSpec.split(".");
    return [file, fn];
})();

// Pre-build URLs
const baseUrl = `http://${runtimeApi}/2018-06-01/runtime/invocation`;
const nextUrl = `${baseUrl}/next`;

// Load handler with optimized caching
let handler: (event: unknown, context: unknown) => unknown;
const moduleCache = new Map<string, Record<string, unknown>>();

async function loadHandler(): Promise<void> {
    const extensions = [".ts", ".js", ".mjs"];
    
    for (const ext of extensions) {
        const modulePath = `/var/task/${moduleName}${ext}`;
        const cacheKey = `file://${modulePath}`;
        
        try {
            let m = moduleCache.get(cacheKey);
            if (!m) {
                m = await import(cacheKey);
                moduleCache.set(cacheKey, m);
            }
            
            const fn = m[exportName] ?? m.default;
            if (typeof fn === "function") {
                handler = fn as typeof handler;
                return;
            }
        } catch {
            continue;
        }
    }
    
    throw new Error(`Handler "${exportName}" not found in ${moduleName}`);
}

// Pre-load handler
await loadHandler();

// Pre-build context template
const contextTemplate = {
    functionName: Deno.env.get("AWS_LAMBDA_FUNCTION_NAME"),
    functionVersion: Deno.env.get("AWS_LAMBDA_FUNCTION_VERSION"),
    memoryLimitInMB: Deno.env.get("AWS_LAMBDA_FUNCTION_MEMORY_SIZE"),
};

// Optimized runtime loop
while (true) {
    let reqId: string;
    let deadline: number;
    
    try {
        const res = await fetch(nextUrl);
        reqId = res.headers.get("Lambda-Runtime-Aws-Request-Id")!;
        deadline = parseInt(res.headers.get("Lambda-Runtime-Deadline-Ms") || "0");
        const event = await res.json();
        
        // Build context with pre-computed values
        const context = {
            awsRequestId: reqId,
            ...contextTemplate,
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