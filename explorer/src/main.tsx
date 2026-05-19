import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

type RegistryEndpoint = "rpc" | "path";

interface SyncPolicy {
  maxMs: number;
  onTimeout: string;
}

interface IdempotencyPolicy {
  supported: boolean;
  required: boolean;
  keyHeader?: string;
  ttlSeconds?: number;
}

interface CachePolicy {
  enabled: boolean;
  ttl?: number;
  scope?: string;
  vary?: string[];
  tags?: string[];
}

interface TelemetryPolicy {
  spanName: string;
  attributes?: string[];
  sensitive?: string[];
}

interface StreamPolicy {
  supportedTransports: string[];
  supportedEncodings: string[];
  ttlSeconds: number;
  frameIntegrity?: boolean;
}

interface RegistryEntry {
  op: string;
  executionModel: "sync" | "async" | "stream";
  sideEffecting: boolean;
  argsSchema: Record<string, unknown>;
  resultSchema?: Record<string, unknown>;
  frameSchema?: Record<string, unknown>;
  mediaSchema?: Array<Record<string, unknown>>;
  authScopes: string[];
  sync?: SyncPolicy;
  idempotency?: IdempotencyPolicy;
  cache?: CachePolicy;
  telemetry?: TelemetryPolicy;
  stream?: StreamPolicy;
  ttlSeconds?: number;
  deprecated?: boolean;
  sunset?: string;
  replacement?: string;
}

interface RegistryResponse {
  callVersion: string;
  schemaHash: string;
  endpoints: RegistryEndpoint[];
  errorsUrl?: string;
  operations: RegistryEntry[];
}

interface ErrorEntry {
  code: string;
  httpStatus: number;
  state?: string;
  message: string;
  retryable: boolean;
}

interface ErrorsResponse {
  callVersion: string;
  schemaHash: string;
  service: ErrorEntry[];
  operations: Record<string, ErrorEntry[]>;
}

interface ConfigResponse {
  defaultTargetOrigin: string;
  fixedTargetOrigin: string | null;
}

interface ProxyResponse {
  status: number;
  headers: {
    contentType?: string;
    location?: string | null;
    etag?: string | null;
  };
  bodyText: string;
}

type TabId = "overview" | "operations" | "errors" | "try";
type ThemeMode = "light" | "dark";

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stat(value: unknown): string {
  if (value === undefined || value === null || value === "") return "n/a";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function hasError(
  value: RegistryResponse | ErrorsResponse | ProxyResponse | { error?: string },
): value is { error?: string } {
  return "error" in value;
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [targetOrigin, setTargetOrigin] = useState("");
  const [registry, setRegistry] = useState<RegistryResponse | null>(null);
  const [errorsCatalog, setErrorsCatalog] = useState<ErrorsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [search, setSearch] = useState("");
  const [selectedOp, setSelectedOp] = useState<string>("");
  const [authHeader, setAuthHeader] = useState("");
  const [argsText, setArgsText] = useState("{\n  \n}");
  const [ctxText, setCtxText] = useState("{\n  \n}");
  const [proxyResult, setProxyResult] = useState<ProxyResponse | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadCatalog(nextTarget?: string) {
    const target = nextTarget || targetOrigin;
    if (!target) return;

    setLoading(true);
    setLoadError(null);
    try {
      const registryRes = await fetch(
        `/api/registry?target=${encodeURIComponent(target)}`,
      );
      const registryBody = (await registryRes.json()) as RegistryResponse | { error?: string };
      if (!registryRes.ok || hasError(registryBody)) {
        throw new Error(
          hasError(registryBody) && registryBody.error ? registryBody.error : "Failed to load registry",
        );
      }
      setRegistry(registryBody);

      const errorsUrl = registryBody.errorsUrl || "/.well-known/errors";
      const errorsRes = await fetch(
        `/api/errors?target=${encodeURIComponent(target)}&errorsUrl=${encodeURIComponent(errorsUrl)}`,
      );
      const errorsBody = (await errorsRes.json()) as ErrorsResponse | { error?: string };
      if (!errorsRes.ok || hasError(errorsBody)) {
        throw new Error(
          hasError(errorsBody) && errorsBody.error
            ? errorsBody.error
            : "Failed to load error catalog",
        );
      }
      setErrorsCatalog(errorsBody);

      if (!selectedOp && registryBody.operations[0]) {
        setSelectedOp(registryBody.operations[0].op);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load explorer data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/config");
      const body = (await res.json()) as ConfigResponse;
      setTargetOrigin(body.defaultTargetOrigin);
      await loadCatalog(body.defaultTargetOrigin);
    })().catch((error) => {
      setLoading(false);
      setLoadError(error instanceof Error ? error.message : "Failed to load config");
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  const operations = registry?.operations || [];
  const filteredOperations = operations.filter((operation) =>
    operation.op.toLowerCase().includes(search.toLowerCase()),
  );
  const activeOperation =
    operations.find((operation) => operation.op === selectedOp) || filteredOperations[0] || null;

  useEffect(() => {
    if (activeOperation && activeOperation.op !== selectedOp) {
      setSelectedOp(activeOperation.op);
    }
  }, [activeOperation, selectedOp]);

  useEffect(() => {
    if (!activeOperation) return;
    setArgsText(prettyJson(exampleArgs(activeOperation.argsSchema)));
  }, [selectedOp]);

  async function submitTryIt(pathOrUrl?: string, method = "POST", body?: unknown) {
    setSubmitting(true);
    setProxyError(null);
    try {
      const headers: Record<string, string> = {};
      if (authHeader.trim()) headers.Authorization = authHeader.trim();
      const res = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetOrigin,
          path: pathOrUrl || "/call",
          url: pathOrUrl?.startsWith("http") ? pathOrUrl : undefined,
          method,
          headers,
          body:
            body !== undefined
              ? body
              : {
                  op: activeOperation?.op,
                  args: safeParseJson(argsText),
                  ctx: safeParseJson(ctxText),
                },
        }),
      });
      const result = (await res.json()) as ProxyResponse | { error?: string };
      if (!res.ok || hasError(result)) {
        throw new Error(
          hasError(result) && result.error ? result.error : "Request failed",
        );
      }
      setProxyResult(result);
    } catch (error) {
      setProxyError(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  function renderOverview() {
    if (!registry) return null;

    const deprecatedCount = registry.operations.filter((item) => item.deprecated).length;
    const asyncCount = registry.operations.filter((item) => item.executionModel === "async").length;
    const streamCount = registry.operations.filter((item) => item.executionModel === "stream").length;

    return (
      <div className="content">
        <div className="detail-grid">
          <article className="card">
            <h3>Registry contract</h3>
            <div className="badge-row">
              <span className="badge">{registry.callVersion}</span>
              {registry.endpoints.map((endpoint) => (
                <span className="badge ok" key={endpoint}>
                  endpoint:{endpoint}
                </span>
              ))}
            </div>
            <p className="mini">Schema hash: {registry.schemaHash}</p>
          </article>
          <article className="card">
            <h3>Coverage</h3>
            <div className="badge-row">
              <span className="badge">{registry.operations.length} operations</span>
              <span className="badge warn">{deprecatedCount} deprecated</span>
              <span className="badge">{asyncCount} async</span>
              <span className="badge">{streamCount} stream</span>
            </div>
            <p className="mini">Errors endpoint: {registry.errorsUrl || "/.well-known/errors"}</p>
          </article>
          <article className="card">
            <h3>What this service publishes</h3>
            <p className="mini">
              The explorer reads the live registry and error catalog, not a checked-in
              sidecar spec. What you see here is the running contract.
            </p>
          </article>
          <article className="card">
            <h3>Use the explorer</h3>
            <p className="mini">
              Browse operations, inspect schemas, check error codes, then jump to
              <strong> Try it</strong> to send a real `POST /call` request through the proxy.
            </p>
          </article>
        </div>
        <section className="panel">
          <h2>Registry JSON</h2>
          <pre className="json-block">{prettyJson(registry)}</pre>
        </section>
      </div>
    );
  }

  function renderOperations() {
    if (!activeOperation) {
      return <div className="empty">No operation matches the current filter.</div>;
    }

    return (
      <div className="content">
        <section className="detail">
          <div className="action-row">
            <h2>{activeOperation.op}</h2>
            <span className="badge ok">{activeOperation.executionModel}</span>
            {activeOperation.sideEffecting ? (
              <span className="badge warn">side-effecting</span>
            ) : (
              <span className="badge">read-only</span>
            )}
            {activeOperation.deprecated && (
              <span className="badge danger">deprecated</span>
            )}
          </div>
          <p className="muted">
            Sunset: {stat(activeOperation.sunset)}. Replacement:{" "}
            {stat(activeOperation.replacement)}.
          </p>

          <div className="detail-grid">
            <article className="card">
              <h3>Auth and execution</h3>
              <div className="badge-row">
                {activeOperation.authScopes.length > 0 ? (
                  activeOperation.authScopes.map((scope) => (
                    <span className="badge" key={scope}>
                      {scope}
                    </span>
                  ))
                ) : (
                  <span className="badge">no auth scopes declared</span>
                )}
              </div>
              {activeOperation.sync && (
                <p className="mini">
                  Sync timeout: {activeOperation.sync.maxMs}ms, onTimeout=
                  {activeOperation.sync.onTimeout}
                </p>
              )}
              {activeOperation.ttlSeconds !== undefined && (
                <p className="mini">TTL seconds: {activeOperation.ttlSeconds}</p>
              )}
            </article>

            <article className="card">
              <h3>Lifecycle policies</h3>
              <p className="mini">Idempotency: {stat(activeOperation.idempotency)}</p>
              <p className="mini">Cache: {stat(activeOperation.cache)}</p>
              <p className="mini">Telemetry: {stat(activeOperation.telemetry)}</p>
              <p className="mini">Stream: {stat(activeOperation.stream)}</p>
            </article>
          </div>
        </section>

        <section className="panel">
          <h2>Arguments schema</h2>
          <pre className="json-block">{prettyJson(activeOperation.argsSchema)}</pre>
        </section>

        {activeOperation.resultSchema && (
          <section className="panel">
            <h2>Result schema</h2>
            <pre className="json-block">{prettyJson(activeOperation.resultSchema)}</pre>
          </section>
        )}

        {activeOperation.frameSchema && (
          <section className="panel">
            <h2>Frame schema</h2>
            <pre className="json-block">{prettyJson(activeOperation.frameSchema)}</pre>
          </section>
        )}

        {activeOperation.mediaSchema && (
          <section className="panel">
            <h2>Media schema</h2>
            <pre className="json-block">{prettyJson(activeOperation.mediaSchema)}</pre>
          </section>
        )}
      </div>
    );
  }

  function renderErrors() {
    if (!errorsCatalog) return null;

    return (
      <div className="content">
        <section className="panel">
          <h2>Service errors</h2>
          <pre className="json-block">{prettyJson(errorsCatalog.service)}</pre>
        </section>
        <section className="panel">
          <h2>Operation-specific errors</h2>
          <pre className="json-block">{prettyJson(errorsCatalog.operations)}</pre>
        </section>
      </div>
    );
  }

  function renderTryIt() {
    return (
      <div className="content">
        <section className="console">
          <div className="action-row">
            <h2>Try it</h2>
            {activeOperation && <span className="badge ok">{activeOperation.op}</span>}
          </div>
          <p className="muted">
            Requests are sent through the explorer's Bun proxy. That keeps the UI usable
            even when the target service does not allow browser CORS from this origin.
          </p>

          <div className="console-grid">
            <div className="field">
              <label>Authorization header</label>
              <input
                className="input"
                value={authHeader}
                onChange={(event) => setAuthHeader(event.target.value)}
                placeholder="Bearer ..."
              />
            </div>
            <div className="field">
              <label>Context JSON</label>
              <textarea
                className="textarea"
                value={ctxText}
                onChange={(event) => setCtxText(event.target.value)}
              />
            </div>
            <div className="field">
              <label>Arguments JSON</label>
              <textarea
                className="textarea"
                value={argsText}
                onChange={(event) => setArgsText(event.target.value)}
              />
            </div>
            <div className="response-panel">
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  disabled={!activeOperation || submitting}
                  onClick={() => submitTryIt()}
                >
                  {submitting ? "Sending..." : "POST /call"}
                </button>
                {proxyResult?.headers.location && (
                  <button
                    className="btn btn-secondary"
                    disabled={submitting}
                    onClick={() => submitTryIt(proxyResult.headers.location || undefined, "GET")}
                  >
                    Follow location
                  </button>
                )}
              </div>
              {proxyError && <div className="error-banner">{proxyError}</div>}
              {proxyResult ? (
                <>
                  <div className="badge-row">
                    <span className="badge">status:{proxyResult.status}</span>
                    {proxyResult.headers.location && (
                      <span className="badge">{proxyResult.headers.location}</span>
                    )}
                    {proxyResult.headers.etag && (
                      <span className="badge">{proxyResult.headers.etag}</span>
                    )}
                  </div>
                  <pre className="json-block">
                    {prettyJson(safeParseJson(proxyResult.bodyText))}
                  </pre>
                </>
              ) : (
                <div className="empty">
                  Pick an operation, adjust the payload, then send a real request.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="hero panel">
        <div className="hero-main">
          <div className="eyebrow">OpenCALL Explorer</div>
          <div className="hero-title-row">
            <div>
              <h1>Live contract explorer for OpenCALL services</h1>
              <p>
                Inspect the published registry, review error contracts, and send real
                `POST /call` requests through the proxy without switching tools.
              </p>
            </div>
            <button
              className="btn btn-secondary theme-toggle"
              onClick={() =>
                setThemeMode((current) => (current === "light" ? "dark" : "light"))
              }
            >
              {themeMode === "light" ? "Dark mode" : "Light mode"}
            </button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="status-card">
            <span className="status-label">Target origin</span>
            <span className="status-value">{targetOrigin || "loading..."}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Registry version</span>
            <span className="status-value">{registry?.callVersion || "n/a"}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Operations</span>
            <span className="status-value">{registry?.operations.length ?? 0}</span>
          </div>
          <div className="status-card">
            <span className="status-label">Error codes</span>
            <span className="status-value">
              {(errorsCatalog?.service.length || 0) +
                Object.values(errorsCatalog?.operations || {}).reduce(
                  (sum, entries) => sum + entries.length,
                  0,
                )}
            </span>
          </div>
        </div>
      </section>

      <section className="target-bar panel">
        <div className="field">
          <label>Target origin</label>
          <input
            className="input"
            value={targetOrigin}
            onChange={(event) => setTargetOrigin(event.target.value)}
            placeholder="https://api.example.com"
          />
        </div>
        <button className="btn btn-primary" disabled={loading} onClick={() => loadCatalog()}>
          {loading ? "Loading..." : "Load service"}
        </button>
        <button
          className="btn btn-secondary"
          disabled={!activeOperation}
          onClick={() => setActiveTab("try")}
        >
          Jump to try it
        </button>
      </section>

      {loadError && <div className="error-banner">{loadError}</div>}

      <section className="layout">
        <aside className="sidebar">
          <div className="tab-row">
            {[
              ["overview", "Overview"],
              ["operations", "Operations"],
              ["errors", "Errors"],
              ["try", "Try it"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`tab ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id as TabId)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="field">
            <label>Filter operations</label>
            <input
              className="search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="v1:orders.place"
            />
          </div>

          <div className="operation-list">
            {filteredOperations.map((operation) => (
              <article
                key={operation.op}
                className={`operation-item ${selectedOp === operation.op ? "active" : ""}`}
                onClick={() => {
                  setSelectedOp(operation.op);
                  setActiveTab("operations");
                }}
              >
                <h3>{operation.op}</h3>
                <div className="operation-meta">
                  {operation.executionModel} | {operation.sideEffecting ? "mutates" : "read-only"}
                </div>
                {operation.deprecated && <div className="mini">Deprecated</div>}
              </article>
            ))}
          </div>
        </aside>

        <main>
          {activeTab === "overview" && renderOverview()}
          {activeTab === "operations" && renderOperations()}
          {activeTab === "errors" && renderErrors()}
          {activeTab === "try" && renderTryIt()}
        </main>
      </section>
    </div>
  );
}

function exampleArgs(schema: Record<string, unknown>): Record<string, unknown> {
  const rawProperties = schema.properties;
  if (!rawProperties || typeof rawProperties !== "object" || Array.isArray(rawProperties)) {
    return {};
  }

  const properties = rawProperties as Record<string, Record<string, unknown>>;
  const example: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    const type = property.type;
    if (type === "string") example[name] = "";
    else if (type === "integer" || type === "number") example[name] = 0;
    else if (type === "boolean") example[name] = false;
    else if (type === "array") example[name] = [];
    else if (type === "object") example[name] = {};
    else example[name] = null;
  }
  return example;
}

createRoot(document.getElementById("root")!).render(<App />);
