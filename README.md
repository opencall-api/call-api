> **Canonical docs:** [https://opencall-api.com/spec](https://opencall-api.com/spec). GitHub blocks most non-Copilot bots; the canonical site serves the same docs as rendered HTML and as raw markdown for agents.

# Goodbye REST. Hello OpenCALL.

**OpenCALL** — Open Command And Lifecycle Layer — is a transport-neutral operation protocol designed for a world where humans and AI agents are equal consumers of your services.

REST is an architectural style for HTTP-mediated resource access. It works well for human-designed clients but maps awkwardly to agent-style invocation. Agent-facing tool protocols (like MCP) translate intent into actionable requests. OpenCALL is a single operation-based protocol that serves both audiences, with bindings for HTTP, WebSocket, MQTT, Kafka, WebRTC, and QUIC.

## The Problem

REST maps intent to resource hierarchies and HTTP verbs. That translation layer exists purely because REST was designed for people. Agents don't think in `GET /users/123/orders/456/items/789` — they think in operations: _"get this order item."_

So we built MCP for agents and kept REST for humans. Now you're maintaining two contracts for two audiences over the same business logic.

## The Answer

One envelope. One contract. Multiple bindings.

```
POST /call
```

```json
{
  "op": "v1:orders.getItem",
  "args": { "orderId": "456", "itemId": "789" }
}
```

That's it. A human developer can read it. An agent can call it. The operation name carries the intent. The registry describes what's available. No verb mapping, no resource nesting, no translation.

When the server advertises the path binding, the same envelope can also be invoked at a path-addressed endpoint — every operation gets a stable URL so per-route policy, observability, and (for non-mutating ops) edge caching can operate on operations as first-class resources:

```
POST /ops/v1/orders/getItem
```

## What OpenCALL Supports

- **Three execution models** — synchronous, asynchronous (poll-based), and streaming (push-based for sensors, video, telemetry)
- **Transport-agnostic core** — HTTP(S), WebSocket, MQTT, Kafka, WebRTC, QUIC. The envelope is the contract, not the wire protocol
- **Media ingress and egress** — browsers upload files via native multipart; agents use pre-signed URIs. Large media redirects via 303, never proxied
- **Session correlation** — `sessionId` and `parentId` for application-level grouping; `traceparent` for infrastructure observability
- **Data integrity** — mandatory chunk checksums with chain validation; optional frame integrity for safety-critical streams
- **Result retention** — async responses include `expiresAt` (Unix epoch seconds) so clients and agents know when results expire. No surprise 404s
- **Self-describing** — `GET /.well-known/ops` returns the full operation registry with schemas, execution models, and constraints. Agents ground themselves. Clients generate themselves
- **Code-generated registry** — the operation registry at `/.well-known/ops` is designed to be generated from source code annotations (JSDoc, decorators, doc comments), not hand-maintained. Multi-team ownership via namespaces
- **Versioned operations** — version-prefixed names (`v1:orders.getItem`), additive-first evolution rules, and a deprecation lifecycle with contractual sunset dates
- **Transport-aware auth** — HTTP uses headers, MQTT/Kafka use envelope auth, QUIC uses built-in TLS. One auth model, transport-specific enforcement
- **Caching, three ways** — server-side per-operation caches, path-addressed endpoints with deterministic ETags for edge/CDN caching of non-mutating operations, or `location` indirection for static result assets
- **Observability built in** — responses carry an op name and timing; the registry declares span names, traced attributes, and sensitive fields that handlers must redact before emitting telemetry
- **Errors served separately** — `/.well-known/errors` lists protocol-level and per-operation error codes so the operations registry stays small enough to load into agent context cheaply

## Tradeoffs

OpenCALL intentionally:

- Centralizes operations instead of distributing them across resources
- Introduces an operation registry that must be governed
- Moves semantics out of HTTP verbs and into the envelope
- Requires explicit lifecycle and version discipline

The architecture is not new. SOAP got the shape right — operation-based, envelope-wrapped, self-describing. JSON-RPC got the simplicity right — a method name, a params object, minimal overhead. OpenCALL builds on both, extending RPC with what those protocols left out:

- Explicit execution lifecycle states (`accepted → pending → complete → error`)
- Pull-based chunking with integrity validation
- Transport-agnostic bindings (HTTP, WebSocket, MQTT, Kafka, WebRTC, QUIC)
- Versioned operation naming with deprecation lifecycle and sunset governance
- Self-describing operation registry served live at `/.well-known/ops`

It is not a silver bullet. It shifts complexity rather than eliminating it. For a detailed look at how OpenCALL compares to JSON-RPC, GraphQL, gRPC, SOAP, MCP, A2A, and others — see [`comparisons.md`](comparisons.md).

## Example Implementations

The [`tests/`](tests/) directory contains a language-agnostic test suite and reference API implementations. The test suite validates any implementation against the OpenCALL contract via HTTP.

**Quick start (TypeScript):**

```bash
cd tests && bun install && bun test
```

**Docker:**

```bash
docker compose -f tests/docker/docker-compose.yml up --build -d

# Test any implementation — setup auto-registers auth tokens
API_URL=http://localhost:3001 bun test --cwd tests  # TypeScript
API_URL=http://localhost:3002 bun test --cwd tests  # Python
API_URL=http://localhost:3003 bun test --cwd tests  # Java
API_URL=http://localhost:3004 bun test --cwd tests  # Go
```

See [`tests/README.md`](tests/README.md) for details on running tests, adding new language implementations, and the test architecture.

## Read More

| Link                                                    | Description                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [www.opencall-api.com](https://www.opencall-api.com)    | The OpenCALL website — overview, live demo, and interactive API explorer.      |
| [`specification.md`](specification.md)                   | The full specification; both human and machine readable.                      |
| [`client.md`](client.md)                                 | What this means on the client side — and why your REST SDK is apology code.   |
| [`comparisons.md`](comparisons.md)                       | How OpenCALL compares to JSON-RPC, GraphQL, gRPC, SOAP, MCP, A2A, and others. |

## Origin

This started with a [blog post](https://daniel.bryar.com.au/posts/2026/02/goodbye-rest-hello-cqrs/) arguing that REST doesn't work for agentic interaction. The spec is the answer to the question that post asked.

## Contribute

This is one person's answer to a problem that affects everyone building APIs in 2026. It will only get better with input from others.

- Open an [issue](../../issues) to discuss ideas or problems
- Submit a PR to propose changes to the spec
- Star the repo if this resonates

No more first and second class audiences. No more REST.
