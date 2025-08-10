// function/mod.ts
export async function handler(event: unknown) {
  return {
    message: "Hello from Deno on Lambda!",
    echo: event,
    runtime: `Deno ${Deno.version.deno}`,
    ts: new Date().toISOString(),
  };
}
