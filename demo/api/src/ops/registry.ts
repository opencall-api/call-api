import { buildRegistry as buildServerRegistry, type OperationModule } from "@opencall/server";
import { join, dirname } from "node:path";

let cachedJson: string | null = null;
let cachedETag: string | null = null;
let cachedModules: Map<string, OperationModule> = new Map();

export function getOperationModules(): Map<string, OperationModule> {
  return cachedModules;
}

export async function buildRegistry(): Promise<void> {
  const opsDir = join(dirname(new URL(import.meta.url).pathname), "..", "operations");
  const { modules, json, etag } = await buildServerRegistry({
    opsDir,
    endpoints: ["rpc", "path"],
    callVersion: process.env.CALL_VERSION,
  });
  cachedJson = json;
  cachedETag = etag;
  cachedModules = modules;
}

export function handleRegistryRequest(request: Request): Response {
  if (!cachedJson || !cachedETag) {
    return new Response(
      JSON.stringify({ error: "Registry not initialized" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch === cachedETag) {
    return new Response(null, { status: 304, headers: { ETag: cachedETag } });
  }

  return new Response(cachedJson, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      ETag: cachedETag,
    },
  });
}
