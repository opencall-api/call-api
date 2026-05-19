import app from "./index.html";

const PORT = parseInt(process.env.EXPLORER_PORT || process.env.PORT || "9090", 10);
const FIXED_TARGET_ORIGIN = process.env.TARGET_ORIGIN;

interface ProxyRequestBody {
  targetOrigin?: string;
  url?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function resolveTargetOrigin(request: Request, explicit?: string | null): string {
  const value = explicit || FIXED_TARGET_ORIGIN || new URL(request.url).origin;
  const target = new URL(value);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("Target origin must use http or https");
  }
  return target.origin;
}

function resolveUrl(targetOrigin: string, pathOrUrl: string): string {
  return new URL(pathOrUrl, targetOrigin).toString();
}

async function proxyJson(request: Request, url: string): Promise<Response> {
  const upstream = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  const bodyText = await upstream.text();
  const headers = new Headers();
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
  );
  const etag = upstream.headers.get("ETag");
  if (etag) headers.set("ETag", etag);
  const cache = upstream.headers.get("Cache-Control");
  if (cache) headers.set("Cache-Control", cache);

  return new Response(bodyText, {
    status: upstream.status,
    headers,
  });
}

const server = Bun.serve({
  port: PORT,
  routes: {
    "/": app,
    "/api/config": (request) => {
      try {
        return json({
          defaultTargetOrigin: resolveTargetOrigin(request, null),
          fixedTargetOrigin: FIXED_TARGET_ORIGIN ?? null,
        });
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Invalid configuration" },
          { status: 400 },
        );
      }
    },
    "/api/registry": async (request) => {
      try {
        const url = new URL(request.url);
        const targetOrigin = resolveTargetOrigin(request, url.searchParams.get("target"));
        return await proxyJson(request, `${targetOrigin}/.well-known/ops`);
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Failed to load registry" },
          { status: 400 },
        );
      }
    },
    "/api/errors": async (request) => {
      try {
        const url = new URL(request.url);
        const targetOrigin = resolveTargetOrigin(request, url.searchParams.get("target"));
        const errorsUrl = url.searchParams.get("errorsUrl") || "/.well-known/errors";
        return await proxyJson(request, resolveUrl(targetOrigin, errorsUrl));
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Failed to load errors" },
          { status: 400 },
        );
      }
    },
    "/api/proxy": async (request) => {
      if (request.method !== "POST") {
        return json({ error: "Use POST /api/proxy" }, { status: 405 });
      }

      let input: ProxyRequestBody;
      try {
        input = (await request.json()) as ProxyRequestBody;
      } catch {
        return json({ error: "Request body must be valid JSON" }, { status: 400 });
      }

      try {
        const targetOrigin = resolveTargetOrigin(request, input.targetOrigin || null);
        const targetUrl = input.url
          ? resolveUrl(targetOrigin, input.url)
          : resolveUrl(targetOrigin, input.path || "/call");
        const method = (input.method || "GET").toUpperCase();
        const headers = new Headers(input.headers || {});
        if (!headers.has("Accept")) headers.set("Accept", "application/json");

        let body: string | undefined;
        if (input.body !== undefined) {
          body = JSON.stringify(input.body);
          if (!headers.has("Content-Type")) {
            headers.set("Content-Type", "application/json");
          }
        }

        const upstream = await fetch(targetUrl, {
          method,
          headers,
          body,
        });
        const text = await upstream.text();
        const responseHeaders = {
          contentType:
            upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
          location: upstream.headers.get("Location"),
          etag: upstream.headers.get("ETag"),
        };

        return json({
          status: upstream.status,
          headers: responseHeaders,
          bodyText: text,
        });
      } catch (error) {
        return json(
          { error: error instanceof Error ? error.message : "Proxy request failed" },
          { status: 502 },
        );
      }
    },
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`OpenCALL Explorer listening on http://localhost:${PORT}`);
console.log(
  `Default target origin: ${FIXED_TARGET_ORIGIN || "(same origin as incoming request)"}`,
);

export { server };
