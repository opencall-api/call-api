# OpenCALL — Open Command And Lifecycle Layer

## Overview

OpenCALL is a transport-neutral operation protocol. It unifies human-oriented APIs and agent-style tool invocation into a single operation contract using a uniform envelope, independent of how that envelope reaches the server.

It is designed to serve both:

- human-facing UI/frontends, and
- LLM-powered agents

via a single `call` endpoint and tool.

The system supports:

- synchronous, asynchronous, and streaming execution
- chunked pull-based result retrieval
- continuous push-based stream subscriptions (sensor, video, telemetry)
- redirection to external object/media/stream endpoints
- strong error signaling without overloading HTTP status codes
- backend orchestration via state machines
- application-level session correlation and infrastructure-level tracing

The core specification is transport-agnostic; semantics are operation-driven. Transport-specific behavior is defined in the [Transport Bindings Appendix](#transport-bindings-appendix).

---

## Design Principles

1. **Operation-first, not resource-first**
2. **Caller does not distinguish command vs query** — the operation name carries intent
3. **Always return a meaningful payload when possible**
4. **Asynchronous by default, synchronous when cheap**
5. **Pull-based progression (agent-compatible), push-based when the domain requires it**
6. **Single canonical envelope**
7. **One controller registry, multiple bindings**
8. **No duplicate media ingress/egress** - lower cost, better performance, native client handling, cache-friendly
9. **Transport-agnostic core, transport-specific bindings**
10. **Self-describing envelopes** — an envelope should be understandable in isolation

---

## Domains

- `api.example.com` — UI and general API access
- `agent.example.com` — agent access (MCP-like, single tool)
- `results.example.com` — optional external result storage (e.g. S3/CDN)
- `streams.example.com` — optional external stream endpoints

---

## Operation Invocation Endpoint

### Endpoint

```
POST /call
```

#### GET /call

Servers SHOULD respond to `GET /call` with `405 Method Not Allowed`, an `Allow: POST` header,
and a JSON error body directing the caller to `POST /call` for invocation and
`GET /.well-known/ops` for operation discovery.

### Operation Naming Convention

Every operation name MUST be prefixed with a version: `v{N}:namespace.operation`.

```
v1:orders.getItem
v1:identity.verify
v1:device.readPosition
```

The version prefix is part of the `op` name — it flows through the envelope, registry, and routing unchanged. Version numbers are positive integers, monotonically increasing per operation lineage (`v1`, `v2`, `v3`, ...).

All operations start at `v1`. When a breaking change is needed, a new version is introduced (e.g. `v2:orders.getItem`) while the old version remains available until its sunset date. See [Schema Evolution](#schema-evolution) for what constitutes a breaking change.

If a namespace is not needed for a simple API, the operation name can be just `v1:getItem`. The version prefix is still required.

---

## Path-Based Operation Endpoint

Servers MAY expose non-mutating operations at a path-addressed endpoint in addition to `POST /call`. The path-based form maps the operation name into a URL so that infrastructure caches, edge proxies, per-route policy, and standard HTTP observability tooling can operate on operations as first-class resources.

### Endpoint

```
POST /ops/{version}/{path}
```

`{version}` is the operation's version prefix (e.g. `v1`). `{path}` is the operation name with the version prefix removed and `.` replaced by `/`.

| Operation name           | Path                          |
| ------------------------ | ----------------------------- |
| `v1:user.auth.login`     | `/ops/v1/user/auth/login`     |
| `v1:orders.getItem`      | `/ops/v1/orders/getItem`      |
| `v1:device.readPosition` | `/ops/v1/device/readPosition` |

The mapping is built by splitting the operation name on `:` to extract the version, then splitting the remainder on `.` and joining the segments with `/`. Implementations MUST use standard URL construction tooling rather than ad-hoc string templating. The `:` and `.` separators are structural; they MUST NOT be percent-encoded into the URL path.

The `/ops/{requestId}` and `/ops/{requestId}/chunks` endpoints use `GET`, so they do not collide with this `POST` path.

### Request Body

The request body is the canonical envelope with `op` omitted (the operation is implicit in the URL):

```json
{
  "args": {},
  "media": [],
  "ctx": {},
  "auth": {}
}
```

If the body includes an `op` field that disagrees with the URL, the server MUST reject the request with `400` and an `INVALID_REQUEST` error.

### Eligibility

The path-based endpoint is a service-level binding capability. Servers that expose it MUST expose it for every operation in the registry — clients can rely on the path mapping working for any `op` they discover via `/.well-known/ops`. Whether the server supports this binding at all is declared at the top of the registry response in the `endpoints` array — see [Self-Description Endpoint](#self-description-endpoint).

Path-based addressing is independent of execution model. Async and streaming operations return the same `202` + `location` or `202` + `stream` envelopes they would return via `/call`. Side-effecting operations work the same way too — `POST` is not cached by HTTP intermediaries by default, and per-operation cacheability is governed by the registry's `cache.enabled`, which MUST be `false` for side-effecting operations regardless of which endpoint invoked them.

### Cache Key and ETag

For operations with `cache.enabled: true` in the registry, the server MUST set an `ETag` header on path-based responses. The ETag is the SHA-256 of the deterministic concatenation of the operation name and the canonicalized args:

```
ETag = "\"sha256:" + hex(sha256(opName + canonicalize(args))) + "\""
```

Where `opName` is the full version-prefixed operation name (e.g. `v1:user.auth.login`) and `canonicalize(args)` produces a deterministic byte sequence using the rules below.

### Canonicalization Rules

The args are canonicalized to a UTF-8 byte sequence under these rules:

- Object keys are sorted lexicographically by Unicode code point
- All insignificant whitespace is removed
- String values use the same JSON escape sequences they were submitted with — implementations MUST NOT re-escape (e.g. `"A"` MUST NOT be normalized to `"A"`)
- **Numbers preserve their submitted textual form.** A value submitted as `47` and a value submitted as `47.00` produce different cache keys. Implementations MUST NOT reformat numeric tokens before hashing
- `null` is preserved — a missing key and a `null`-valued key produce different hashes
- Arrays preserve their submitted order

This is a stricter form of [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785) — JCS normalizes numbers via ECMAScript serialization, which OpenCALL does not, because numeric precision is sometimes semantically meaningful (currency, scientific measurements) and the cache key must reflect what the caller sent.

### Conditional Requests

Clients MAY send `If-None-Match` with a previously-received ETag. When the server's current representation matches, it MUST respond with `304 Not Modified` and an empty body. Otherwise it returns `200` with the new representation and a new ETag.

### Cache-Control

Servers SHOULD set `Cache-Control` on path-based responses according to the operation's registry `cache` block. See [Operation Registry](#operation-registry-source-of-truth).

### Response

The response body and status codes match the synchronous behavior of `/call` — `200` with the canonical envelope on success, `4xx`/`5xx` with the canonical error envelope on failure. The path-based endpoint does not change response semantics; it only changes addressing.

---

## Invocation Request Envelope

```json
{
  "op": "string",
  "args": {},
  "media": [
    {
      "name": "string",
      "mimeType": "string",
      "ref": "string (URI, optional)",
      "part": "string (multipart part name, optional)"
    }
  ],
  "ctx (optional)": {
    "requestId": "uuid",
    "sessionId": "uuid (optional)",
    "parentId": "uuid (optional)",
    "idempotencyKey": "string (optional)",
    "timeoutMs": 2500,
    "locale": "string (optional)",
    "traceparent": "string (optional)"
  },
  "auth": {
    "iss": "string",
    "sub": "string",
    "credentialType": "string",
    "credential": "string (optional)"
  }
}
```

### Fields

- `op`
  Fully-qualified operation name. Used for routing to a controller.

- `args`
  Operation-specific payload. Validated against the operation schema.

- `media`
  Optional array of media attachments accompanying the invocation. Each entry describes one file or binary object. See [Media Ingress](#media-ingress) for full semantics.
  - `media[].name` — Logical name for the attachment (e.g. `"selfie"`, `"bankStatement"`). Must match a name declared in the operation's `mediaSchema`.
  - `media[].mimeType` — MIME type of the attachment (e.g. `"image/jpeg"`, `"application/pdf"`).
  - `media[].ref` — URI of a pre-uploaded object. Used for large files. Mutually exclusive with `part`.
  - `media[].part` — Multipart part name where the binary data is attached. Used for inline uploads via `multipart/form-data`. Mutually exclusive with `ref`.

- `ctx`
  Optional. If omitted, the server generates a `requestId` and uses defaults for all other context fields.

- `ctx.requestId`
  Required when `ctx` is present. Client-supplied correlation ID. If `ctx` is omitted entirely, the server generates a UUID.

- `ctx.sessionId`
  Optional. Groups related operations into an application-level session (e.g. a robot mission, a monitoring window, a multi-step workflow). Set by the caller.

- `ctx.parentId`
  Optional. References the `requestId` of the operation that caused this one (e.g. a `moveArm` command triggered by a sensor reading). Enables causal chaining within a session.

- `ctx.idempotencyKey`
  Required for side-effecting operations. Optional otherwise.

- `ctx.timeoutMs`
  Client hint for synchronous execution threshold. If omitted, the server uses its own default threshold for deciding between synchronous and asynchronous execution.

- `ctx.locale`
  Optional localization hint. Used for operations that return human-facing content (e.g. error messages, generated text, formatted documents) when localization is supported.

- `ctx.traceparent`
  Optional. OpenTelemetry trace context for infrastructure-level distributed tracing. Serves a different layer than `sessionId`/`parentId` — application-level correlation vs infrastructure observability.

- `auth`
  Optional top-level authentication block. Required by transport bindings that lack native auth mechanisms (e.g. MQTT, Kafka). HTTP(S) bindings use the `Authorization` header instead. See [Auth Model](#auth-model).

- `auth.iss`
  Issuer (e.g. `auth.example.com`). The authority that issued the credential.

- `auth.sub`
  Subject identity (e.g. `device:1234`, `agent:claude-session-xyz`).

- `auth.credentialType`
  Credential type (e.g. `bearer`, `apiKey`, `otk`, `mTLS`).

- `auth.credential`
  The credential itself. Optional when the transport carries credentials natively. **Implementations MUST treat an incoming `auth.credential` as a secret and MUST NOT log it.**

---

## Invocation Response Envelope (Canonical)

All protocol-level responses SHOULD return this canonical envelope whenever a payload can be delivered.

```json
{
  "requestId": "uuid",
  "sessionId": "uuid (optional, echoed)",
  "state": "accepted | pending | complete | streaming | error",
  "result": {},
  "error": {
    "code": "string",
    "message": "string",
    "cause": {}
  },
  "stream": {
    "transport": "wss | mqtt | kafka | webrtc | quic",
    "encoding": "protobuf | json | cbor | binary",
    "schema": "string",
    "location": "string (URI)",
    "sessionId": "uuid (optional, echoed from parent session)",
    "expiresAt": "integer (Unix epoch seconds, optional)",
    "auth": {
      "credentialType": "bearer | apiKey | otk | mTLS",
      "credential": "string",
      "expiresAt": "integer (Unix epoch seconds, optional)"
    }
  },
  "location": {
    "uri": "string",
    "auth": {
      "credentialType": "bearer | apiKey | otk | mTLS",
      "credential": "string",
      "expiresAt": "integer (Unix epoch seconds, optional)"
    }
  },
  "expiresAt": "integer (Unix epoch seconds, optional)",
  "retryAfterMs": 500,
  "meta": {
    "op": "string",
    "durationMs": "integer",
    "tenantId": "string (optional)"
  }
}
```

### Fields

- `state`
  - `accepted` — the server has acknowledged and queued the operation but execution has not yet started — the operation may be waiting for resources, upstream availability, or scheduling. The `accepted` state may appear in the initial response or the polling response. The operation is not rejected and has not failed.
  - `pending` — execution has started and is in progress. The server is actively working on producing a result. The final result is not yet ready.
  - `complete` — operation finished successfully, `result` present
  - `streaming` — stream established, `stream` object present
  - `error` — domain-level failure (not transport failure)

- `sessionId`
  Echoed from the request `ctx.sessionId` so responses are self-describing.

- `result`
  Present when `state=complete` and the result is delivered inline. Mutually exclusive with `location`, `error`, and `stream`. When the result is hosted externally (e.g. a generated file in an object store), the server returns `location` instead. Clients MUST check for both `result` and `location` when `state=complete`.

- `error`
  Present only when `state=error`. Mutually exclusive with `result`, `location`, and `stream`.

- `stream`
  Present only when `state=streaming`. Mutually exclusive with `result`, `location`, and `error`. Contains everything the caller needs to connect to the stream. Fields:
  - `stream.transport` — The protocol to connect with (e.g. `wss`, `mqtt`, `kafka`, `webrtc`, `quic`).
  - `stream.encoding` — How frames are encoded on the wire (e.g. `protobuf`, `json`, `cbor`, `binary`).
  - `stream.schema` — Fully-qualified schema name for each frame, so the consumer knows how to deserialize.
  - `stream.location` — URI of the stream endpoint to connect to.
  - `stream.sessionId` — Stream session identifier. Echoed from the request `ctx.sessionId` if present.
  - `stream.expiresAt` — Optional. Integer (Unix epoch seconds) indicating when the server may close the stream. The caller SHOULD re-subscribe before this time.
  - `stream.auth` — Optional. When present, provides credentials for the stream endpoint. When absent, the caller SHOULD reuse the same credential it used for the original `/call` request. Omitted when `stream.location` does not require additional authentication beyond what the transport provides natively.
  - `stream.auth.credentialType` — Credential type: `bearer` (Authorization header), `apiKey` (query parameter or header), `otk` (one-time key consumed on first use).
  - `stream.auth.credential` — The credential value.
  - `stream.auth.expiresAt` — Optional. Integer (Unix epoch seconds) indicating when the credentials expire. The caller MUST re-subscribe before this time to obtain fresh credentials. Omitted for one-time keys that have no time-based expiry.

- `result`, `location`, `error`, and `stream` are mutually exclusive — exactly one is present depending on `state`.

- `location`
  Present when the caller should retrieve a result from, or poll at, a different endpoint. MAY appear with any `state` except `error`. A self-describing object containing the target URI and optional auth.
  During async execution (`state=accepted` or `state=pending`), `location` points to the polling endpoint. On completion (`state=complete`), `location` points to the external result (e.g. a generated file in an object store). A given operation may use `location` for polling, for the final result, or for both at different stages.
  The server returns 303 only when the target requires no caller-supplied credentials and no transport change (client auto-follows). Otherwise the server returns 202 and the client reads the body to get the URI, auth, and any transport details.
  - `location.uri` — The target endpoint URI.
  - `location.auth` — Optional. When present, provides credentials for the target. When absent, the caller SHOULD reuse the same credential it used for the original `/call` request (e.g. the same `Authorization` header). Omitted entirely when the URI is pre-signed or publicly accessible.
  - `location.auth.credentialType` — Credential type: e.g. `bearer`, `apiKey`, `otk`, `mTLS`.
  - `location.auth.credential` — The credential value.
  - `location.auth.expiresAt` — Optional. Integer (Unix epoch seconds) indicating when the credentials expire.

- `retryAfterMs`
  Optional hint for polling cadence.

- `expiresAt`
  Optional. Integer (Unix epoch seconds) indicating when the operation instance and its results (including chunks) will expire. After this time, `GET /ops/{requestId}` and chunk endpoints return `404`. Present on `state=accepted`, `state=pending`, and `state=complete` responses. Allows clients and agents to know how long they have to poll or retrieve results.

- `meta`
  Optional observability block. When present:
  - `meta.op` — Required. The fully-qualified operation name as recognized by the server (e.g. `v1:user.auth.login`). This is the canonical name used for span naming, dashboarding, and rate-limit attribution. Servers SHOULD always include this when emitting `meta`.
  - `meta.durationMs` — Optional. Integer milliseconds the server spent producing this response, measured from envelope receipt to response serialization. Excludes network and queueing time outside the server's control.
  - `meta.tenantId` — Optional. The tenant identity associated with this invocation, when the server resolves authentication into a tenant. Useful for multi-tenant telemetry and audit logs.

  The `meta` block is response-only metadata. Servers MUST NOT use `meta` to carry result data or error information — `result` and `error` are the only fields that carry domain payload. Servers MAY emit `meta` on any state, including `error`.

  Operations declare their telemetry configuration in the registry `telemetry` block — see [Operation Registry](#operation-registry-source-of-truth) for span naming, attribute capture, and sensitive field redaction.

---

## Execution Models

The spec supports three execution models. The operation registry declares which model each operation uses.

### Synchronous

1. Caller sends `POST /call`
2. Server returns `200` with `state=complete` and `result`

Used when the operation is expected to complete within the caller's `timeoutMs` hint. It is up to the controller implementation to determine what "expected" means — it could be based on historical execution times, a static threshold, or dynamic load conditions.

#### Synchronous Timeout Behavior

Operations declare a maximum synchronous execution time and an `onTimeout` policy in the registry's `sync` block. When server-side execution exceeds `sync.maxMs`, the server applies the declared policy:

- `fail` — Server returns `state=error` with code `TIMEOUT`. The caller MUST NOT retry automatically; a retry is appropriate only if the caller has reason to believe the timeout was transient (e.g. via observed system health, not blind retry).
- `retry` — Server returns `503 Service Unavailable` with `retryAfterMs`. The caller SHOULD retry after the indicated delay. Use this when the timeout reflects transient pressure that a brief backoff is expected to clear.
- `escalate` — Server transitions the in-flight operation to async execution and returns `202` with `state=accepted` and a polling `location`. The caller polls `GET /ops/{requestId}` until completion. Use this when the operation can complete given more time without caller intervention.

Operations that declare `executionModel: "sync"` MUST declare an `onTimeout` policy. Operations declared as `async` or `stream` do not use `onTimeout` — async has its own polling/expiry model and stream has its own lifetime model.

The caller's `ctx.timeoutMs` hint is advisory and applies only to the caller's willingness to wait for a synchronous reply on the wire. It does not override the server-side `sync.maxMs` policy. A server SHOULD honor an aggressive `ctx.timeoutMs` (e.g. 200ms when its own `sync.maxMs` is 2000ms) by abandoning synchronous waiting for that caller, but it MAY still apply `onTimeout: escalate` so the operation continues server-side and the caller can poll.

### Asynchronous

1. Caller sends `POST /call`
2. Server returns `202` with `state=accepted` and a `location` for polling
3. Caller polls `GET /ops/{requestId}` until `state=complete` or `state=error`

Used for longer running operations, particularly those that involve heavy computation, human review, or orchestration of multiple steps. The `location` object in the `202` response tells the caller where to poll for results and how long they have until the operational result expires.

### Stream Subscription

1. Caller sends `POST /call` with a streaming operation (e.g. `op: "v1:subscribeToStream"`)
2. Server returns `202` with the canonical response envelope containing the `stream` object (streams may involve a transport change, so 303 auto-follow is not appropriate)
3. Caller reads the `stream` object, connects to `stream.location` using the specified `stream.transport` and credentials if provided
4. Frames arrive as raw encoded data — no envelope wrapping per frame

Used for continuous data feeds (sensor telemetry, video, position tracking). The server manages the stream lifecycle and can enforce TTLs via `stream.expiresAt`. The client is responsible for re-subscribing before expiry to maintain continuity.

### Note on Media Proxies and Large Object Handling

Operations that involve large media objects (e.g. video, audio, large files) use a redirection pattern rather than proxying the data through the API server. This is covered in detail in the [Media and Large Object Handling](#media-and-large-object-handling) section.

---

## HTTP Status Code Semantics

### Always Return Payloads

The system MUST return a descriptive payload whenever possible.

### Status Code Usage

| Status | Meaning                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200    | Successful synchronous completion.                                                                                                                     |
| 202    | Accepted — result not yet ready, or resource at a location requiring credentials or a transport change. See note below.                                |
| 303    | Resource available via HTTP(S) redirect that can be safely auto-followed using standard client behavior. See note below.                               |
| 304    | Not Modified — used by the path-based endpoint when a conditional `If-None-Match` request matches the current ETag. Body MUST be empty.                |
| 400    | Invalid operation — the request is malformed, the operation does not exist, or the arguments fail schema validation. The error payload describes why.  |
| 401    | Authentication invalid.                                                                                                                                |
| 403    | Authentication valid but insufficient.                                                                                                                 |
| 404    | Resource not found — the requested operation result, chunk, or media object does not exist or has expired.                                             |
| 405    | Method not allowed — the HTTP method is not supported for the requested endpoint.                                                                      |
| 410    | Operation removed — the operation existed but has been removed (past its sunset date). The error payload includes `replacement` if a successor exists. |
| 429    | Too many requests — the caller is polling too frequently. The `retryAfterMs` field indicates how long to wait before retrying. See note below.         |
| 500    | Internal failure with full error payload.                                                                                                              |
| 502    | Upstream dependency failure.                                                                                                                           |
| 503    | Service unavailable.                                                                                                                                   |

### Notes

- 303 is reserved for plain HTTP redirects. The `Location` header and `location.uri` carry the same URI. No response body processing is required and no transport changes should occur.
- 202 MUST be used instead of 303 when any of: auth is required, the target uses a non-HTTP transport (WebSocket, MQTT, QUIC, etc.), or the result is not yet ready. The caller reads the body and connects manually.
- 202 responses MUST be read by the client. The body contains the canonical envelope with `location` (for polling or retrieval), `stream` (for stream subscription), or `auth` details the client needs to proceed. The client MUST NOT treat 202 as a simple acknowledgement.

- **Domain errors vs protocol errors:** Business and domain failures — "user not found", "insufficient funds", "order already cancelled" — return HTTP 200 (for sync) or HTTP 202 (for async) with `state=error` and a structured error payload. HTTP 4xx codes are reserved for protocol-level failures: malformed envelope (400), unknown operation (400), expired resource (404), invalid auth (401), insufficient permissions (403). A caller should never need to inspect HTTP status codes to distinguish business outcomes — that information is always in the `state` and `error` fields.
- 400 responses MUST include the canonical error envelope describing the validation failure (e.g. unknown operation, missing required arguments, schema mismatch).
  When the request does not include a parseable requestId, the server MUST generate one for the error response.
- 404 responses on `/ops/{requestId}` or `/ops/{requestId}/chunks` indicate the operation instance has expired past its TTL or never existed. Callers should not retry.
- HTTP 500 responses MUST include a full error payload and any panic/error code.
- 410 responses indicate that a deprecated operation has been removed past its sunset date. The error payload MUST include the `OP_REMOVED` code and SHOULD include the `replacement` operation name if one exists.
- <a id="429-scope"></a>**429 scope:** The `429 Too Many Requests` status is defined principally for **polling** — when a caller polls `GET /ops/{requestId}` too frequently, the server returns 429 with `retryAfterMs` to throttle the cadence. It does **not** apply to chunked result retrieval (`GET /ops/{requestId}/chunks`), which is a sequential pull-based data transfer, not a retry loop. Implementers MAY additionally apply broader rate limiting to `POST /call` or other endpoints to prevent abuse, but this is an operational concern outside the protocol — the spec does not prescribe it.
- **Zero-information responses are forbidden.** _"There was a problem, that's all we know"_ is **not acceptable**. If the server doesn't know what went wrong, it should say so in the error message rather than leaving the caller in the dark.
  Should infrastructure errors occur or a pre-filter (e.g. WAF rule, transport layer auth failure, etc.) be triggered before the request reaches the application, a generic response with no body is acceptable since the request never made it to the API.

---

## Caching

The `POST /call` endpoint is not cacheable by HTTP intermediaries by design — operation semantics live in the envelope, not the URL or method. Caching is an orthogonal concern handled by one of three mechanisms, declared per-operation in the registry's `cache` block.

### Server-Side Operation Cache

The server MAY cache results internally, keyed by operation name and arguments. The `cache` block in the registry declares caching intent per operation — TTL, scope, vary dimensions, and invalidation tags. The server controls cache keys, invalidation, and TTL; HTTP intermediaries see only `POST /call` and treat each invocation as uncacheable.

### Path-Based Endpoint (Infrastructure-Cacheable)

When the registry's top-level `endpoints` array includes `"path"`, callers MAY invoke any operation via [`POST /ops/{version}/{path}`](#path-based-operation-endpoint). For operations where `cache.enabled: true`, the server emits an `ETag` derived from the canonicalized operation name and args, plus `Cache-Control` headers driven by the registry's `cache` block. Edge proxies and CDNs that understand body-aware POST caching can cache responses at the infrastructure layer; clients can use `If-None-Match` to receive `304 Not Modified`.

Cacheability is per-operation, not per-endpoint: it follows `cache.enabled`, which MUST be `false` for side-effecting operations. The path binding makes responses *addressable* in cache infrastructure; the registry decides whether they are *cached*.

### Location Indirection (Cacheable Resources)

For large or static results, the server returns `202` with a `location` pointing to a cacheable resource endpoint (CDN, S3, pre-signed URL). The resource at that URI follows standard HTTP caching semantics — `Cache-Control`, `ETag`, `Last-Modified` — and can be cached by any HTTP intermediary.

This pattern naturally separates the invocation (which is operation-specific) from the result (which may be a static asset). A `POST /call` for `v1:reports.generate` might return a `location` pointing to a PDF on a CDN. The invocation is not cached; the PDF is.

### When Caching Is Not Relevant

Many operations are inherently uncacheable — commands, side-effecting mutations, real-time queries. OpenCALL does not impose caching where it would be incorrect. The `cache` block exists so that the registry can express `enabled: false` explicitly per operation.

---

## Asynchronous Result Retrieval

### Result State Endpoint

The `location.uri` SHOULD include the caller's `requestId` for polling — unless the target is a static asset that can be retrieved directly. When the target is hosted on a different domain or shard, the `location.uri` MUST be a fully-qualified URL (not just a path), and the client MUST be able to resolve it.

The suggested polling endpoint is:

```
GET /ops/{requestId}
```

Returns the canonical response envelope.

The controller may implement rate limiting and return `429 Too Many Requests` if the caller exceeds a reasonable polling cadence. The `retryAfterMs` field in the response indicates how long the caller should wait before polling again. See [429 Scope](#429-scope) for details on where rate limiting applies.

---

## Chunked Result Retrieval (Pull-Based Streaming)

Used for large datasets or long-running queries.

### Endpoint

```
GET /ops/{requestId}/chunks?cursor={cursor}
```

### Response

```json
{
  "requestId": "uuid",
  "sessionId": "uuid (optional, echoed)",
  "state": "pending | complete",
  "mimeType": "string",
  "cursor": "string",
  "chunk": {
    "offset": 0,
    "length": 1048576,
    "checksum": "sha256:a1b2c3d4...",
    "checksumPrevious": null
  },
  "total": 536870912,
  "data": "chunk or base64-encoded binary chunk"
}
```

### Semantics

- `cursor`
  Opaque position marker for next retrieval.

- `chunk.offset`
  Absolute byte offset.

- `chunk.length`
  Size of this chunk.

- `chunk.checksum`
  SHA-256 hash of this chunk's `data` payload. The receiver MUST verify this before accepting the chunk. Format: `sha256:{hex}`.

- `chunk.checksumPrevious`
  SHA-256 hash of the immediately preceding chunk's `data` payload — a single value, not a cumulative list. `null` for the first chunk. Enables the receiver to verify that chunks are consumed in order and detect gaps during reassembly.

- `total`
  Total size if known; omitted if unknown.

- `mimeType`
  Media type of the content.

- `state`
  - `pending` — more chunks available
  - `complete` — final chunk delivered

### Chunk Data Encoding

For the HTTP(S) binding, the default chunk response is a JSON object with `data` as a string. For text-based content (e.g. CSV), the `data` field contains the raw text. For binary content, the `data` field contains base64-encoded bytes.

Implementers MAY support a binary response mode where the chunk metadata is carried in response headers and the body contains raw bytes. This is a binding-level optimization — the logical chunk semantics (offset, checksum, cursor, chain validation) are unchanged.

### Checksum Chain Semantics

The `checksumPrevious` field implements adjacent chaining, not a Merkle tree. Each chunk references the checksum of the immediately preceding chunk only. This is designed for sequential pull-based reassembly: the receiver processes chunks in order and verifies that each chunk follows its predecessor without gaps or reordering.

---

## Media and Large Object Handling

### Rule

The API SHOULD NOT proxy or re-stream large media objects (audio/video).

### Media Flow

1. Operation returns either:
   - `303 See Other` with `Location` header — when no explicit auth is needed and the target is plain HTTP (e.g. pre-signed URL, public CDN). Client auto-follows.
   - `202 Accepted` with `location` object — when credentials are needed or the target uses a non-HTTP transport. Client reads the body and connects manually.

2. No envelope is returned at the redirected location.
3. The redirected endpoint serves:
   - raw object bytes
   - correct `Content-Type`
   - standard HTTP range semantics

### Rationale

- Avoids duplicate ingress/egress costs
- Enables CDN optimization
- Allows native browser and media player handling

---

## Media Ingress

Operations that accept binary attachments (images, documents, audio, video) use the `media` array on the request envelope.

### Two Delivery Modes

**Inline (multipart)** — The binary is sent as a part in a `multipart/form-data` request. The `media` entry references it by `part` name. The envelope JSON is sent as a part named `envelope`. This is the browser-native path — a standard `<form>` or `fetch` with `FormData` can construct it without any framework.

**Reference (pre-uploaded)** — The binary is uploaded to an external object store beforehand (e.g. via a pre-signed URL). The `media` entry references it by `ref` URI. The request is plain JSON. This is the natural path for agents and programmatic callers — no multipart overhead, just a clean JSON envelope.

Each `media` entry uses exactly one of `part` or `ref`, never both.

### Audience Guidance

The two delivery modes map naturally to the two audiences:

- **Browsers and human-facing UIs** use **inline multipart**. Native `FormData`, native `<form>`, zero framework dependencies.
- **Agents and programmatic callers** use **references**. Plain JSON, no multipart construction, no boundary handling. The agent uploads the file first (via a pre-signed URL or an upload operation), then sends a clean call with `ref` URIs.

Both paths produce the same `media` array on the envelope. The server handles them identically.

### Example: Identity Verification

A user submits a selfie, a bank statement PDF, and structured form data in a single invocation:

```
POST /call HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...
Content-Type: multipart/form-data; boundary=----boundary

------boundary
Content-Disposition: form-data; name="envelope"
Content-Type: application/json

{
  "op": "v1:identity.verify",
  "args": {
    "fullName": "Jane Smith",
    "dateOfBirth": "1990-05-15",
    "address": "123 Main St, Sydney NSW 2000"
  },
  "media": [
    { "name": "selfie", "mimeType": "image/jpeg", "part": "selfie" },
    { "name": "bankStatement", "mimeType": "application/pdf", "part": "bankStatement" }
  ],
  "ctx": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "idempotencyKey": "verify-jane-2026-02-10"
  }
}
------boundary
Content-Disposition: form-data; name="selfie"; filename="selfie.jpg"
Content-Type: image/jpeg

<binary JPEG data>
------boundary
Content-Disposition: form-data; name="bankStatement"; filename="statement.pdf"
Content-Type: application/pdf

<binary PDF data>
------boundary--
```

### Example: Large File via Reference

A pre-uploaded video is referenced by URI:

```json
{
  "op": "v1:media.transcode",
  "args": { "outputFormat": "h265", "quality": "high" },
  "media": [
    {
      "name": "source",
      "mimeType": "video/mp4",
      "ref": "https://uploads.example.com/obj/abc123"
    }
  ],
  "ctx": {
    "requestId": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

### Operation Registry

Operations that accept media declare a `mediaSchema` in the registry:

```json
{
  "op": "v1:identity.verify",
  "mediaSchema": [
    {
      "name": "selfie",
      "required": true,
      "acceptedTypes": ["image/jpeg", "image/png"],
      "maxBytes": 10485760
    },
    {
      "name": "bankStatement",
      "required": true,
      "acceptedTypes": ["application/pdf"],
      "maxBytes": 52428800
    }
  ]
}
```

- `name` — Matches the `media[].name` in the request envelope.
- `required` — Whether the attachment is mandatory.
- `acceptedTypes` — Allowed MIME types. The server MUST reject attachments with types not in this list.
- `maxBytes` — Maximum file size. The server MUST reject attachments exceeding this limit.

Agents discover media requirements via `/.well-known/ops` and can construct valid multipart requests or pre-upload files accordingly.

### Rules

- The `media` array is always optional at the envelope level. Operations that require attachments enforce this via `mediaSchema`.
- The server MUST validate each attachment's `mimeType` and size against the operation's `mediaSchema`.
- When using inline multipart delivery, the envelope JSON MUST be in a part named `envelope`.
- When no `media` is present, the request is plain `application/json` as normal.

---

## Stream Subscription Lifecycle

### Subscription

1. Caller sends `POST /call` with a streaming operation and relevant `args`
2. Server returns `202` with the `stream` object (streams involve a transport change)
3. Caller reads the body, connects to `stream.location` using the specified `stream.transport` and credentials if provided
4. Frames arrive as raw encoded data in the declared `encoding` and `schema` — no per-frame envelope overhead

### During the Stream

- Frames are raw bytes in the declared `encoding` and `schema`. No per-frame envelope wrapping. For high-frequency streams (e.g. a robot joint streaming position at 100Hz), every byte counts.
- The stream is one-way: server to caller. If the caller needs to send commands back, that is a separate `POST /call` correlated via `sessionId`.
- Multiple concurrent streams can share a `sessionId` (e.g. position, torque, and vision streams all part of one mission).

### Frame Integrity (Optional)

For streams where data integrity must be verified above the transport layer, the server MAY prepend a lightweight integrity header to each frame. The format is transport-binding specific, but the logical fields are:

- `seq` — Monotonically increasing frame sequence number
- `checksum` — Hash of the frame payload (e.g. CRC-32 for low-latency, SHA-256 for high-assurance)

Frame integrity is optional because most stream transports (QUIC, TLS-over-WebSocket, MQTT with QoS 1+) already provide delivery guarantees. It is recommended for:

- Untrusted or lossy transport layers
- Safety-critical applications (robotics actuation, medical devices)
- Scenarios where the consumer must detect gaps in the frame sequence

The operation registry MAY declare `frameIntegrity: true` to indicate that frames for a given operation include integrity headers.

### Termination

- **Caller-initiated** — The caller calls an `unsubscribeFromStream` operation, passing the stream's `sessionId` or `requestId`.
- **Server-initiated** — The server closes the transport channel. The caller should treat a closed channel as stream-ended and re-subscribe if needed.
- **Expiry** — `stream.expiresAt` indicates when the stream expires. The server may close the stream at or after this time. The caller can re-subscribe.

### Observability

- The original `requestId` from the call identifies the subscription.
- `ctx.traceparent` propagates through to the stream infrastructure for end-to-end tracing.
- `ctx.sessionId` groups related streams and commands within the same application-level session.
- The operation registry declares which ops return streams, so agents can discover streaming capabilities via `/.well-known/ops`.

---

## Error Model

### Domain Error (Execution-Level)

```json
{
  "requestId": "uuid",
  "state": "error",
  "error": {
    "code": "DOMAIN_ERROR_CODE",
    "message": "Human-readable explanation",
    "cause": {}
  }
}
```

### Operation Removed (410)

```json
{
  "requestId": "uuid",
  "state": "error",
  "error": {
    "code": "OP_REMOVED",
    "message": "v1:orders.getItem was removed on 2026-06-01",
    "cause": {
      "removedOp": "v1:orders.getItem",
      "replacement": "v2:orders.getItem"
    }
  }
}
```

### Transport/System Error (500–503)

```json
{
  "requestId": "uuid",
  "state": "error",
  "error": {
    "code": "PANIC_UPSTREAM_TIMEOUT",
    "message": "Service dependency failed",
    "cause": {
      "service": "payments-db",
      "timeoutMs": 3000
    }
  }
}
```

---

## Data Integrity

### Chunk Integrity (Pull-Based)

Pull-based chunked retrieval MUST include per-chunk checksums (`chunk.checksum`) and chain validation (`chunk.checksumPrevious`). This is not optional — when a caller is reassembling a file or dataset from chunks, integrity verification is essential. See [Chunked Result Retrieval](#chunked-result-retrieval-pull-based-streaming) for the field definitions.

### Frame Integrity (Push-Based Streams)

Push-based stream frames MAY include lightweight integrity headers. This is optional and declared per-operation in the registry via `frameIntegrity: true`. See [Frame Integrity](#frame-integrity-optional) for details.

### Response Signing

The core spec does not define response signing at the envelope level. Response authenticity and integrity are transport-layer concerns:

- **HTTP(S)** — TLS provides transport integrity. For additional assurance, implementers can use HTTP Message Signatures ([RFC 9421](https://www.rfc-editor.org/rfc/rfc9421)) or mTLS for mutual authentication.
- **QUIC** — TLS 1.3 is built in.
- **MQTT/Kafka** — TLS on the broker connection.

When security requirements demand end-to-end response signing beyond transport guarantees (e.g. non-repudiation, offline verification, multi-hop relay scenarios), implementers SHOULD use HTTP Message Signatures or equivalent mechanisms at the transport binding layer rather than adding signing fields to the canonical envelope.

---

## Schema Evolution

Operations evolve. The versioning model ensures that evolution is safe for existing callers.

### Safe Changes (Non-Breaking)

These changes do not require a new version. The operation keeps its existing `v{N}:` prefix:

- Add an optional field to `argsSchema`
- Add a field to `resultSchema`
- Add an optional slot to `mediaSchema`
- Widen a type (e.g. `integer` → `number`, enum gains a value)
- Relax a constraint (e.g. reduce `minLength`, increase `maxBytes`)

#### Client Obligations for Safe Changes

Safe changes are safe for _robust_ clients — those that follow the [Robustness Principle](#robustness-principle). Specifically:

- Clients MUST ignore unknown fields in response envelopes, result payloads, and stream frames.
- Clients that match on enum values MUST treat unknown values as unrecognized (e.g. map to an `"other"` / `"unknown"` variant) rather than failing. An enum gaining a value is a non-breaking change, but only if clients handle the new value gracefully.
- Strict or exhaustive pattern matching on enum-typed fields is a client-side choice with a known tradeoff: it provides compile-time safety at the cost of requiring client updates when the server adds values. The spec considers this non-breaking; the client's type system may disagree.

#### Schema Design Note

OpenCALL is schema-agnostic — it transports JSON Schema, it does not prescribe how schemas are written. One practical recommendation: prefer string types for values where numeric serialization introduces ambiguity.

For example, a date field that callers display as `"06/2026"`:

```json
{
  "month": "06",
  "year": "2026"
}
```

Using strings preserves leading zeros and avoids numeric formatting differences across languages and serializers (`6` vs `06`, `2026` vs `2.026e3`). This is a schema design choice, not a protocol requirement.

### Breaking Changes

These changes require a new version (`v{N+1}:op.name`):

- Remove or rename a field in `argsSchema` or `resultSchema`
- Narrow a type (e.g. `number` → `integer`, enum loses a value)
- Make an optional field required
- Change the `executionModel` (e.g. `sync` → `async`)
- Remove an accepted MIME type from `mediaSchema`

When a breaking change is needed, introduce the new version (e.g. `v2:orders.getItem`) and deprecate the old version (e.g. `v1:orders.getItem`). Both versions coexist in the registry until the old version's sunset date.

### Robustness Principle

Callers MUST ignore unknown fields in response envelopes, result payloads, and stream frames. This ensures that additive server-side changes — new result fields, new envelope metadata — do not break existing callers.

---

## Auth Model

Authentication is transport-aware. The core spec defines the `auth` shape; enforcement is deferred to transport bindings.

### Auth Block Shape

```json
{
  "auth": {
    "iss": "string",
    "sub": "string",
    "credentialType": "bearer | apiKey | otk | mTLS",
    "credential": "string (optional)"
  }
}
```

- `iss` — Issuer (e.g. `auth.example.com`). The authority that issued the credential.
- `sub` — Subject identity (e.g. `device:1234`, `agent:claude-session-xyz`)
- `credentialType` — Credential type (e.g. `bearer`, `apiKey`, `otk`, `mTLS`). It is up to the implementation to define the supported methods and their semantics.
- `credential` — The credential itself. Optional when the transport carries it natively.

### Transport Auth Mapping

| Transport | Auth mechanism                                             | `auth` in envelope?       |
| --------- | ---------------------------------------------------------- | ------------------------- |
| HTTP(S)   | `Authorization` header                                     | No — use header           |
| WebSocket | Initial handshake header, or first message                 | Optional after handshake  |
| MQTT      | MQTT `CONNECT` credentials + envelope `auth`               | Yes                       |
| Kafka     | SASL for broker auth + envelope `auth` for caller identity | Yes                       |
| WebRTC    | Signaling channel (HTTPS) handles auth                     | No — handled at signaling |
| QUIC      | TLS 1.3 built into transport + envelope `auth` if needed   | Optional                  |

### Rules

- The envelope `auth` block is always optional in the core spec.
- Transport bindings declare whether it is required.
- The operation registry’s `authScopes` field declares required permissions per operation, regardless of transport.
- The server MUST use 202 (not 303) when the client must read the response body to proceed — including to obtain short-lived credentials (`stream.auth` / `location.auth`), to handle a transport change (WebSocket/MQTT/QUIC/etc.), or to apply any connection instructions beyond standard HTTP redirect handling.
- The server MAY use 303 only for HTTP(S) redirects that a generic client can safely auto-follow using standard redirect behavior (typically a GET), without requiring specific processing of the OpenCALL response body. This includes public resources, pre-signed URLs, same-origin resources using ambient credentials (e.g. cookies), or environments where authenticated access is already implicitly satisfied.

---

## Operation Registry (Source of Truth)

The operation registry is intended to be generated from code, not hand-maintained. Implementations typically derive the registry from source annotations — JSDoc tags, Go doc comments, Python decorators, Java annotations — using build-time tooling similar to how TSOA generates OpenAPI from TypeScript controllers.

The version-prefixed namespace (`v1:namespace.operation`) naturally supports multi-team ownership: each team governs their namespace, and the registry is assembled at build or boot time.

The generation mechanism is an implementation detail. The spec requires only that `GET /.well-known/ops` returns a conformant registry — how it gets built is up to the developer.

### Registry Entry Shape

```json
{
  "op": "v1:namespace.operation",
  "executionModel": "sync | async | stream",
  "sideEffecting": false,
  "argsSchema": {},
  "resultSchema": {},
  "mediaSchema": [],
  "frameSchema": {},
  "authScopes": [],
  "sync": {
    "maxMs": 500,
    "onTimeout": "fail | retry | escalate"
  },
  "idempotency": {
    "supported": false,
    "required": false,
    "keyHeader": "Idempotency-Key",
    "ttlSeconds": 86400
  },
  "cache": {
    "enabled": false,
    "ttl": 0,
    "scope": "private | public | tenant",
    "vary": [],
    "tags": []
  },
  "telemetry": {
    "spanName": "namespace.operation",
    "attributes": [],
    "sensitive": []
  },
  "stream": {
    "supportedTransports": [],
    "supportedEncodings": [],
    "ttlSeconds": 3600,
    "frameIntegrity": false
  },
  "ttlSeconds": 0,
  "deprecated": false,
  "sunset": "YYYY-MM-DD",
  "replacement": "v2:namespace.operation"
}
```

### Identity and Discovery

- `op` — Required. Fully-qualified operation name with version prefix (`v1:namespace.operation`).
- `executionModel` — Required. One of `sync`, `async`, `stream`. Determines response semantics: `sync` returns a result on the same call, `async` returns 202 with a polling location, `stream` returns 202 with stream metadata.
- `sideEffecting` — Required. `true` if invoking the operation mutates state. Side-effecting operations MUST set `cache.enabled: false` and SHOULD set `idempotency.supported: true`.

The endpoints through which an operation can be invoked (`POST /call` and optionally `POST /ops/{version}/{path}`) are a service-level capability declared in the top-level `endpoints` field of the registry response — see [Self-Description Endpoint](#self-description-endpoint). Per-operation endpoint declarations are not part of the registry entry: when the server supports the path binding, it supports it for every operation in the registry.

### Schemas

- `argsSchema` — Required. JSON Schema for the request `args`.
- `resultSchema` — Required for `sync` and `async`. JSON Schema for the response `result`.
- `mediaSchema` — Optional. Array describing accepted media attachments. See [Media Ingress](#media-ingress) for the entry shape.
- `frameSchema` — Required when `executionModel: "stream"`. JSON Schema for each stream frame.

### Auth

- `authScopes` — Required. Array of scopes the caller must hold. Empty array means no scope required (still subject to authentication).

### Synchronous Execution

The `sync` block is required when `executionModel: "sync"`, optional otherwise.

- `sync.maxMs` — Required. Maximum server-side wall time before the `onTimeout` policy applies.
- `sync.onTimeout` — Required. One of:
  - `"fail"` — Return `state=error` with code `TIMEOUT`. Caller does not retry automatically.
  - `"retry"` — Return `503` with `retryAfterMs`. Caller retries after the indicated delay.
  - `"escalate"` — Transition the in-flight operation to async and return `202` with a polling `location`. Caller polls `GET /ops/{requestId}` until completion.

  See [Synchronous Timeout Behavior](#synchronous-timeout-behavior).

### Idempotency

The `idempotency` block declares whether the operation supports caller-provided idempotency keys and how those keys are accepted.

- `idempotency.supported` — Required when present. `true` if the server deduplicates by an idempotency key.
- `idempotency.required` — Required when present. `true` if the caller MUST supply a key for this operation. Side-effecting operations SHOULD set this to `true`.
- `idempotency.keyHeader` — Optional. The HTTP header name the server reads the key from when invoked over HTTP(S). Defaults to `Idempotency-Key`. The same key is also accepted via `ctx.idempotencyKey` in the envelope.
- `idempotency.ttlSeconds` — Required when `supported: true`. How long the server retains the idempotency record (and its associated response) before a repeat key is treated as a new invocation.

Operations that omit the `idempotency` block MUST be treated as `{ supported: false, required: false }`.

### Cache

The `cache` block declares server-side caching intent and the headers the server emits on path-based responses.

- `cache.enabled` — Required when present. `true` if the operation's response is cacheable.
- `cache.ttl` — Required when `enabled: true`. Cache lifetime in seconds. The server emits `Cache-Control: max-age={ttl}` on path-based responses.
- `cache.scope` — Required when `enabled: true`. One of:
  - `"public"` — Cacheable by shared caches (CDN, proxy). Emitted as `Cache-Control: public`.
  - `"private"` — Cacheable only by the end-client. Emitted as `Cache-Control: private`.
  - `"tenant"` — Cacheable per-tenant. Emitted as `Cache-Control: private` plus a `Vary` header that includes the tenant identity (typically `Authorization` or a tenant header).
- `cache.vary` — Optional. Array of cache key dimensions beyond URL + body hash. Values may name HTTP headers (`"Authorization"`) or argument paths (`"args.locale"`). The server adds matching `Vary` headers and incorporates the named dimensions into the ETag.
- `cache.tags` — Optional. Array of opaque tags for cache invalidation systems (e.g. surrogate-key purging on Cloudflare/Fastly).

Operations that omit the `cache` block MUST be treated as `{ enabled: false }`. Side-effecting operations MUST NOT set `enabled: true`.

### Telemetry

The `telemetry` block declares observability metadata used by servers when emitting traces, logs, and metrics. It also tells handlers which fields must be redacted before being captured into telemetry sinks.

- `telemetry.spanName` — Required when present. The span name to use when this operation runs (e.g. `auth.register`). Servers SHOULD use this for OpenTelemetry span naming.
- `telemetry.attributes` — Optional. Array of argument paths to capture as span attributes. Values are dotted paths into `args` (e.g. `"phone"`, `"order.itemId"`). Excludes anything listed in `sensitive`.
- `telemetry.sensitive` — Optional. Array of argument paths the handler MUST redact before emitting telemetry. Values are dotted paths into `args`. Servers MUST redact these before logging or tracing — the operation handler is the source of truth for which fields are sensitive.

When `telemetry.sensitive` and `telemetry.attributes` overlap, sensitivity wins: the field is redacted, not captured.

### Streaming

The `stream` block is required when `executionModel: "stream"`, omitted otherwise.

- `stream.supportedTransports` — Required. Transports the stream can deliver over (e.g. `["wss", "mqtt", "quic"]`). The caller can express preference in `args`; the server picks the best match.
- `stream.supportedEncodings` — Required. Available frame encodings (e.g. `["protobuf", "json"]`).
- `stream.ttlSeconds` — Required. Default subscription lifetime. The server adds this to the current time to compute `stream.expiresAt`. Server MAY override per-subscription based on load or policy.
- `stream.frameIntegrity` — Optional, defaults to `false`. When `true`, frames include integrity headers (sequence number and checksum). Recommended for safety-critical applications.

### Result TTL

- `ttlSeconds` — Required for `async` operations. The server adds this to the current time to compute `expiresAt` on response envelopes for the operation instance. After this time, `GET /ops/{requestId}` and chunk endpoints return `404`. Optional for `sync` operations whose results are persisted (e.g. for idempotent retries).

### Deprecation

- `deprecated` — Optional, defaults to `false`. When `true`, callers SHOULD migrate to the `replacement` operation.
- `sunset` — ISO 8601 date (`YYYY-MM-DD`), present only when `deprecated: true`. The server MUST continue to serve the operation until this date. After the sunset date, the server MAY remove the operation and return `410 Gone` with an `OP_REMOVED` error.
- `replacement` — The `op` name of the replacement operation (e.g. `v2:orders.getItem`), present only when `deprecated: true`.

### Errors

Operation-level error codes are NOT carried in this registry. They are served separately at [`/.well-known/errors`](#errors-endpoint) so that the operations registry stays small and easy to load into agent context.

### Examples

#### Sync, cacheable, path-eligible

```json
{
  "op": "v1:catalog.getItem",
  "executionModel": "sync",
  "sideEffecting": false,
  "argsSchema": {
    "type": "object",
    "properties": { "itemId": { "type": "string" } },
    "required": ["itemId"]
  },
  "resultSchema": {},
  "authScopes": ["catalog:read"],
  "sync": { "maxMs": 250, "onTimeout": "fail" },
  "idempotency": { "supported": false, "required": false },
  "cache": {
    "enabled": true,
    "ttl": 300,
    "scope": "public",
    "vary": ["args.locale"],
    "tags": ["catalog"]
  },
  "telemetry": {
    "spanName": "catalog.getItem",
    "attributes": ["itemId"],
    "sensitive": []
  }
}
```

#### Sync, side-effecting, idempotent

```json
{
  "op": "v1:auth.register",
  "executionModel": "sync",
  "sideEffecting": true,
  "argsSchema": {},
  "resultSchema": {},
  "authScopes": [],
  "sync": { "maxMs": 2000, "onTimeout": "escalate" },
  "idempotency": {
    "supported": true,
    "required": true,
    "keyHeader": "Idempotency-Key",
    "ttlSeconds": 86400
  },
  "cache": { "enabled": false },
  "telemetry": {
    "spanName": "auth.register",
    "attributes": ["country"],
    "sensitive": ["phone", "password"]
  }
}
```

#### Streaming

```json
{
  "op": "v1:device.subscribePosition",
  "executionModel": "stream",
  "sideEffecting": false,
  "argsSchema": {},
  "frameSchema": {},
  "authScopes": ["device:read"],
  "telemetry": {
    "spanName": "device.subscribePosition",
    "attributes": ["deviceId"],
    "sensitive": []
  },
  "stream": {
    "supportedTransports": ["wss", "mqtt", "quic"],
    "supportedEncodings": ["protobuf", "json"],
    "ttlSeconds": 3600,
    "frameIntegrity": true
  }
}
```

#### Deprecated

```json
{
  "op": "v1:orders.getItem",
  "executionModel": "sync",
  "sideEffecting": false,
  "argsSchema": {},
  "resultSchema": {},
  "authScopes": ["orders:read"],
  "sync": { "maxMs": 500, "onTimeout": "fail" },
  "deprecated": true,
  "sunset": "2026-06-01",
  "replacement": "v2:orders.getItem"
}
```

---

## Self-Description Endpoint

```
GET /.well-known/ops
```

Returns the operation registry as a JSON object:

```json
{
  "callVersion": "2026-02-10",
  "schemaHash": "sha256:...",
  "endpoints": ["rpc", "path"],
  "errorsUrl": "/.well-known/errors",
  "operations": []
}
```

### Top-Level Fields

- `callVersion` — Required. Calendar date (`YYYY-MM-DD`) of the OpenCALL specification version the server implements.
- `schemaHash` — Required. SHA-256 hash of the canonicalized registry, prefixed with `sha256:`. Computed by canonicalizing the entire response object excluding the `schemaHash` field itself, using the same canonicalization rules as the [Path-Based Operation Endpoint cache key](#canonicalization-rules). The hash changes whenever any operation's metadata changes — even an addition. Clients and agents SHOULD compare `schemaHash` to detect changes more reliably than `callVersion`, which only moves on spec-level revisions.
- `endpoints` — Required. Array declaring which invocation forms the server supports for every operation in this registry. Values:
  - `"rpc"` — `POST /call` with the canonical envelope. Always present.
  - `"path"` — `POST /ops/{version}/{path}` per [Path-Based Operation Endpoint](#path-based-operation-endpoint). Optional service-level binding; when present, it applies to every operation in `operations` regardless of execution model or side-effects. Cacheability still derives from each operation's `cache` block.
- `errorsUrl` — Optional. Path or absolute URL where the error catalog is served, per [Errors Endpoint](#errors-endpoint). Defaults to `/.well-known/errors` when omitted.
- `operations` — Required. Array of registry entries describing every available operation.

### Contents

The registry includes:

- list of operations (with version-prefixed names)
- schemas (argument, result, frame, and media)
- execution characteristics and models
- supported transports and encodings
- deprecation status, sunset dates, and replacements
- limits and constraints

It does NOT include error codes — those are served at [`/.well-known/errors`](#errors-endpoint) so that the operations payload stays small enough to load into agent context inexpensively.

This document is the canonical contract for:

- frontend client generation
- agent grounding
- documentation

### HTTP Caching

Servers SHOULD include `Cache-Control` and `ETag` headers on `/.well-known/ops` responses. The `ETag` SHOULD match the `schemaHash` field so that intermediaries cache by the same identifier the spec uses. Clients SHOULD use conditional requests (`If-None-Match`) to avoid re-fetching an unchanged registry.

---

## Errors Endpoint

```
GET /.well-known/errors
```

Returns the catalog of error codes the server can produce. Errors are split out from `/.well-known/ops` to keep the operations registry small — the bulk of the payload that agents and clients load on first contact.

```json
{
  "callVersion": "2026-02-10",
  "schemaHash": "sha256:...",
  "service": [
    {
      "code": "AUTH_REQUIRED",
      "httpStatus": 401,
      "message": "Authentication required.",
      "retryable": false
    },
    {
      "code": "FORBIDDEN",
      "httpStatus": 403,
      "message": "Authentication valid but insufficient.",
      "retryable": false
    },
    {
      "code": "INVALID_REQUEST",
      "httpStatus": 400,
      "message": "Request envelope or arguments failed validation.",
      "retryable": false
    },
    {
      "code": "TIMEOUT",
      "httpStatus": 200,
      "state": "error",
      "message": "Operation exceeded its synchronous time budget.",
      "retryable": false
    }
  ],
  "operations": {
    "v1:auth.register": [
      {
        "code": "PHONE_ALREADY_REGISTERED",
        "httpStatus": 200,
        "state": "error",
        "message": "Phone number is already registered.",
        "retryable": false
      }
    ]
  }
}
```

### Top-Level Fields

- `callVersion` — Required. Same meaning as `/.well-known/ops`.
- `schemaHash` — Required. SHA-256 hash of the canonicalized error catalog (excluding the `schemaHash` field itself), prefixed with `sha256:`. Independent of the registry's `schemaHash`.
- `service` — Required. Array of error entries that apply to every endpoint. Includes protocol-level errors (`400`, `401`, `403`, `404`, `405`, `410`, `429`, `500`, `502`, `503`) and cross-cutting domain errors (e.g. `TIMEOUT`).
- `operations` — Required. Map of operation name to array of operation-specific error entries. Each entry describes a domain error the named operation may emit.

### Error Entry Fields

- `code` — Required. The error code as it appears in `error.code` on the canonical envelope.
- `httpStatus` — Required. The HTTP status code the server returns alongside this error. Domain errors typically use `200` (sync) or `202` (async) per [HTTP Status Code Semantics](#http-status-code-semantics).
- `state` — Optional. The envelope `state` value when this error is emitted. Defaults to `"error"`. Mostly used to disambiguate when the same code may appear in different states.
- `message` — Required. Default human-readable message for the error. Servers MAY override per-instance to include specifics.
- `retryable` — Required. Boolean hint indicating whether retrying the same request without modification is likely to succeed.

### HTTP Caching

Same caching semantics as `/.well-known/ops`. The `ETag` SHOULD match the `schemaHash`. Clients use `If-None-Match` to avoid re-fetching an unchanged catalog.

### Discovery

Clients SHOULD locate the errors endpoint via the `errorsUrl` field on the operations registry response, falling back to `/.well-known/errors` when omitted.

---

## Agent Binding (MCP-like)

- Single tool: `call`
- Input matches invocation request envelope
- Output matches canonical response envelope
- Agent retrieves capabilities via `/.well-known/ops` and error codes via `/.well-known/errors`
- Agent uses `schemaHash` on both endpoints to detect changes without re-downloading the full payload
- Agent progression is pull-based for sync/async operations
- Agent connects to push-based streams when the operation's execution model is `stream`
- Agent uses `sessionId` to correlate related operations and streams

---

## Backend Execution Model

- Each invocation creates an Operation Instance
- Instance is managed by a state machine:
  - ( accepted → pending → complete | streaming ) | error
- State transitions are forward-only: once a state has advanced, it MUST NOT regress to a previous state. Any state except `error` may transition to `error`. `error` and `complete` are terminal. `streaming` may transition to `complete` (stream ended normally) or `error` (stream failed).
- State transitions are persisted
- Results and chunks are materialized in a result store
- Stream subscriptions are tracked as long-lived operation instances
- No requirement for event sourcing

---

## Non-Goals

- REST resource modeling
- Mandatory GraphQL
- Server-side media proxying
- Per-frame envelope wrapping on streams

---

## Summary

OpenCALL defines:

- one envelope
- one invocation model
- one result lifecycle (sync, async, or stream)
- one agent tool
- one controller registry
- one auth model (transport-aware)

while remaining:

- agent-compatible
- UI-friendly
- async-safe
- stream-capable
- media-efficient
- transport-agnostic
- and operationally tractable

---

## Transport Bindings Appendix

The core specification is transport-agnostic. This appendix defines how the envelope maps to specific transports. Each binding follows a consistent structure:

1. Envelope mapping — how the envelope is serialized and transmitted
2. Auth mechanism — where credentials go
3. Stream support — how streaming operations are delivered
4. Error mapping — how transport-level errors map to the canonical error model
5. Example — a complete request/response cycle

New transports can be added without modifying the core spec.

---

### HTTP(S) Binding

The primary and reference binding.

**Envelope mapping:**
`POST /call` with JSON body (`application/json`). When the invocation includes inline media attachments, the request uses `multipart/form-data` with the envelope JSON in a part named `envelope` and binary attachments in named parts. Response is always JSON.

Servers MAY additionally expose every operation at `POST /ops/{version}/{path}` per the [Path-Based Operation Endpoint](#path-based-operation-endpoint). The body is the same envelope with `op` omitted. The path binding is a service-level capability advertised via the top-level `endpoints` array on `/.well-known/ops`; when present, it applies to every operation in the registry.

**Auth mechanism:**
`Authorization` header. The envelope `auth` block is not used.

**Media ingress:**
Inline media uses `multipart/form-data` — browser-native via `<form>` or `fetch` with `FormData`. Pre-uploaded media uses plain JSON with `ref` URIs in the `media` array. See [Media Ingress](#media-ingress).

**Stream support:**
Stream subscriptions return `202` (streams involve a transport change, so auto-follow is not appropriate). The `stream.location` points to an external stream endpoint. The HTTP binding is used only for the handshake; actual stream delivery is over the transport specified in `stream.transport`.

**Error mapping:**
HTTP status codes map directly as defined in [HTTP Status Code Semantics](#http-status-code-semantics).

**Example:**

```
POST /call HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "op": "v1:device.readPosition",
  "args": { "deviceId": "arm-joint-1" },
  "ctx": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "sessionId": "mission-001",
    "timeoutMs": 2500
  }
}

HTTP/1.1 200 OK
Content-Type: application/json

{
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "mission-001",
  "state": "complete",
  "result": { "x": 12.5, "y": 3.2, "z": 7.8 }
}
```

---

### WebSocket Binding

Persistent bidirectional channel for low-latency command/response with devices.

**Envelope mapping:**
Envelope sent as JSON or binary WebSocket frames. Each frame contains one complete envelope. The connection is long-lived; multiple invocations can share a single connection.

**Auth mechanism:**
Authenticated during the WebSocket upgrade handshake via `Authorization` header or query parameter. Envelope `auth` block is optional for re-authentication or token refresh during a session.

**Stream support:**
Stream data can flow over the same WebSocket connection or redirect to a dedicated channel via `stream.location`. For high-throughput streams, a dedicated channel is recommended.

**Error mapping:**
Transport errors (connection drops, protocol errors) are distinct from domain errors. The server SHOULD send a canonical error envelope before closing the connection when possible.

---

### MQTT Binding

Publish/subscribe for IoT and device communication.

**Envelope mapping:**
Envelope published as the message payload to topic `ops/{op}`. Responses published to `ops/{requestId}/response`. The caller subscribes to the response topic before publishing.

**Auth mechanism:**
MQTT `CONNECT` packet credentials for broker authentication. Envelope `auth` block is required for caller identity and authorization.

**Stream support:**
Stream frames published to `streams/{sessionId}/{op}`. The `stream.location` in the subscription response contains the full topic path. QoS mapped to operation characteristics — side-effecting operations use QoS 1+.

**Error mapping:**
Transport errors (broker disconnection, publish failures) are distinct from domain errors in the response envelope.

---

### Kafka Binding

Event-driven workloads and high-throughput stream processing.

**Envelope mapping:**
Envelope as message value. `op` as message key for partitioning. Published to a well-known operations topic.

**Auth mechanism:**
SASL for broker authentication. Envelope `auth` block is required for caller identity and authorization.

**Stream support:**
Stream frames as continuous messages on a dedicated topic specified in `stream.location`. Consumer groups enable fan-out to multiple subscribers.

**Error mapping:**
Transport errors (broker failures, consumer lag) are distinct from domain errors in the response envelope.

---

### WebRTC Binding

Real-time media and sensor streams between agents and devices.

**Envelope mapping:**
The handshake happens over HTTP(S). The `stream` object in the response contains SDP offer/answer and ICE candidate details needed to establish the WebRTC connection.

**Auth mechanism:**
Handled at the signaling layer (HTTP(S)). No envelope `auth` block needed — the stream connection inherits authorization from the signaling handshake.

**Stream support:**
Data channels carry structured sensor data (protobuf, CBOR). Media tracks carry audio/video streams. Multiple tracks and channels can be multiplexed over a single connection.

**Error mapping:**
Signaling errors use the canonical error model over HTTP(S). Transport errors during streaming (ICE failures, DTLS errors) are handled by WebRTC's native error mechanisms.

---

### QUIC Binding

Multiplexed streams over a single connection for high-throughput, multi-stream scenarios.

**Envelope mapping:**
The handshake happens over HTTP/3 (which runs on QUIC). Envelope as JSON or binary on the request stream.

**Auth mechanism:**
TLS 1.3 is built into QUIC, providing transport-level encryption and authentication. Envelope `auth` block is optional for application-level caller identity when needed.

**Stream support:**
Each logical stream maps to a QUIC stream — no head-of-line blocking between concurrent streams. Ideal for scenarios with multiple simultaneous data feeds (multiple camera feeds, sensor arrays, telemetry). Connection migration supports mobile and robotic devices that change networks without dropping streams.

**Error mapping:**
QUIC connection errors and stream resets are distinct from domain errors. The server SHOULD send a canonical error envelope on the relevant stream before resetting it when possible.
