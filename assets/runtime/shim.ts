/// <reference lib="deno.ns" />
/// <reference lib="dom" />
// Minimal Lambda Runtime API loop for Deno.
// Reads _HANDLER (e.g. "mod.handler") and imports user code from /var/task.
const runtimeApi = Deno.env.get("AWS_LAMBDA_RUNTIME_API")!;
const handlerSpec = Deno.env.get("_HANDLER") ?? "mod.handler";

const [modulePath, exportName] = (() => {
    const [file, fn = "handler"] = handlerSpec.split(".");
    return [`/var/task/${file}.ts`, fn];
})();

const m = await import(`file://${modulePath}`);
const handler = (m as Record<string, unknown>)[exportName] ??
    (m as Record<string, unknown>).default;
if (typeof handler !== "function") {
    throw new Error(`Handler "${handlerSpec}" not found`);
}

async function nextEvent() {
    const res = await fetch(
        `http://${runtimeApi}/2018-06-01/runtime/invocation/next`,
    );
    const reqId = res.headers.get("Lambda-Runtime-Aws-Request-Id")!;
    const event = await res.json();
    return { reqId, event };
}

async function post(url: string, body: unknown) {
    await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

while (true) {
    const { reqId, event } = await nextEvent();
    try {
        const result = await handler(event, {});
        await post(
            `http://${runtimeApi}/2018-06-01/runtime/invocation/${reqId}/response`,
            result,
        );
    } catch (e) {
        await post(
            `http://${runtimeApi}/2018-06-01/runtime/invocation/${reqId}/error`,
            {
                errorType: "Runtime.Error",
                errorMessage: String(e),
            },
        );
    }
}
