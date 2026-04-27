# Phase 1b — `@opencall/client@0.1.0` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third workspace package `packages/client/` to the now-monorepo `opencall-api/ts-tools`, publishing as `@opencall/client@0.1.0`. The client is intentionally thin per `client.md` — a single `call()` function that wraps an envelope and POSTs it, plus a small handful of helpers for async polling, stream subscription, and chunked retrieval, plus a `bin` codegen tool that reads `/.well-known/ops` and emits typed wrappers.

**Architecture:** New workspace package `packages/client/` depending on `@opencall/types`. As part of this phase, types is bumped to `0.1.1` (additive: adds `StreamDescriptor` and the `stream` field on `ResponseEnvelope`) so the client's `subscribeStream` is fully type-safe with no runtime casts. All wire-level types live in `@opencall/types`; the client adds zero new contract types — it only adds runtime helpers.

**Surface:**

- `call(op, args, ctx?)` — POST `/call`, returns the response envelope.
- `callAndWait(op, args, ctx?)` — same but polls until `state` exits `accepted`/`pending`.
- `retrieveChunked(requestId)` — pulls chunks with checksum chain validation, returns concatenated bytes.
- `subscribeStream(op, args, ctx?)` — performs the subscribe call, returns the WebSocket-or-equivalent stream descriptor for the caller to connect to.
- `bin opencall-codegen` — reads a registry URL or local JSON, emits a `.d.ts` (operation map type + typed `call` wrapper).

**Tech Stack:**

- Bun runtime, TypeScript 5
- `@opencall/types@^0.1.0` (peer + runtime dep — for envelope schemas)
- `zod@^3.25` (peer; transitively via @opencall/types)
- Native `fetch` for HTTP, native `WebSocket` for streams (Node 22+ and Bun supply both)

**Reference:** `docs/superpowers/specs/2026-04-27-multi-language-tooling-design.md` §2.x for client surface; `client.md` for the philosophy + reference implementation; `specification.md` for envelope/state semantics.

---

## Pre-flight

- [ ] **Step P1: Branch + clean worktree**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
git checkout main && git pull
git checkout -b phase-1b-client   # if not already on it
git status
```

Expected: clean tree on `phase-1b-client` branched from latest main.

- [ ] **Step P2: Baseline tests pass**

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun test
```

Expected: 96/96 tests pass; types and server both build clean. If anything is red, STOP and report.

---

### Task 1: Add `packages/client/` workspace skeleton

**Files:**

- Create: `packages/client/package.json`
- Create: `packages/client/tsconfig.json`
- Create: `packages/client/src/index.ts` (empty placeholder; tasks 2-6 fill it in)
- Create: `packages/client/test/.gitkeep`

- [ ] **Step 1.1: Create `packages/client/package.json`**

```json
{
  "name": "@opencall/client",
  "version": "0.1.0",
  "description": "OpenCALL client — the thin call() function plus polling, streaming, chunked retrieval, and a codegen CLI",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "opencall-codegen": "./dist/cli/codegen.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist", "src", "README.md", "CHANGELOG.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@opencall/types": "^0.1.0",
    "zod": "^3.25.0"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "keywords": ["opencall", "api", "client", "fetch", "codegen", "agent"],
  "license": "Apache-2.0",
  "homepage": "https://opencall-api.com/spec/client/",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/opencall-api/ts-tools.git",
    "directory": "packages/client"
  },
  "bugs": {
    "url": "https://github.com/opencall-api/ts-tools/issues"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

Note: `publishConfig` does NOT include `provenance: true`. Provenance is provided by the release workflow's `--provenance` flag at CI time; setting it in publishConfig breaks the manual bootstrap publish (lesson from Phase 1a).

- [ ] **Step 1.2: Create `packages/client/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "test"]
}
```

- [ ] **Step 1.3: Create `packages/client/src/index.ts`** with a placeholder so tsc has something to compile:

```ts
// Filled in by subsequent tasks in this plan.
export {};
```

- [ ] **Step 1.4: Create `packages/client/test/.gitkeep`** (empty file) so the directory is tracked.

- [ ] **Step 1.5: Update root `build`/`typecheck` scripts to include client**

In root `package.json`, scripts currently chain only types and server. Update them to also include client:

```json
"scripts": {
  "build": "bun --filter='@opencall/types' run build && bun --filter='@opencall/server' run build && bun --filter='@opencall/client' run build",
  "test": "bun test",
  "typecheck": "bun --filter='@opencall/types' run typecheck && bun --filter='@opencall/server' run typecheck && bun --filter='@opencall/client' run typecheck"
}
```

(Server doesn't depend on client; client and server are siblings depending on types. Order: types → server → client, or types → client → server. The chain above keeps the existing order and appends client.)

- [ ] **Step 1.6: Verify the workspace recognises the new package**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
bun install
bun pm ls 2>&1 | head -10
bun run build
bun test
```

Expected: `bun pm ls` shows `@opencall/client@workspace:packages/client`. Build passes (client's empty index.ts compiles to a tiny dist/). 96 tests still pass.

- [ ] **Step 1.7: Commit**

```bash
git add packages/client package.json bun.lock
git commit -m "client: add packages/client workspace skeleton"
```

---

### Task 2: TDD core `call()` function

**Files:**

- Modify: `packages/client/src/index.ts`
- Create: `packages/client/src/call.ts`
- Create: `packages/client/test/call.test.ts`

The single function that defines the client's identity. Wraps an envelope, POSTs it to `/call`, returns the parsed response.

**Surface to implement:**

```ts
export interface CallContext {
  requestId?: string
  sessionId?: string
  parentId?: string
  idempotencyKey?: string
  timeoutMs?: number
  locale?: string
  traceparent?: string
}

export interface CallOptions {
  /** Base URL of the OpenCALL service (e.g. "https://api.opencall-api.com"). Defaults to the same origin if running in a browser, otherwise required. */
  endpoint?: string
  /** Bearer token. If supplied, sent as `Authorization: Bearer <token>`. */
  token?: string | (() => string | Promise<string>)
  /** Override the global fetch (useful for tests, or for routing through a proxy/sigv4 helper). */
  fetch?: typeof globalThis.fetch
  /** Optional defensive parsing — validates the response with `ResponseEnvelopeSchema` from `@opencall/types`. Defaults to false. */
  parseResponse?: boolean
}

export async function call(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallOptions,
): Promise<ResponseEnvelope> { ... }
```

Where `ResponseEnvelope` is imported from `@opencall/types`.

- [ ] **Step 2.1: Write failing tests in `packages/client/test/call.test.ts`**

```ts
import { test, expect } from "bun:test";
import { call } from "../src/call";

function mockFetch(response: { status: number; body: unknown }): typeof fetch {
  return async (_input: RequestInfo | URL, _init?: RequestInit) => {
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  };
}

test("call posts to /call with the envelope", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(
      JSON.stringify({
        requestId: "abc",
        state: "complete",
        result: { ok: true },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const res = await call(
    "v1:orders.getItem",
    { orderId: "1" },
    { requestId: "abc" },
    {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    },
  );
  expect(calls.length).toBe(1);
  expect(calls[0]!.url).toBe("https://api.example.com/call");
  expect(calls[0]!.init.method).toBe("POST");
  const body = JSON.parse(String(calls[0]!.init.body));
  expect(body.op).toBe("v1:orders.getItem");
  expect(body.args).toEqual({ orderId: "1" });
  expect(body.ctx.requestId).toBe("abc");
  expect(res.state).toBe("complete");
  expect((res.result as { ok: boolean }).ok).toBe(true);
});

test("call generates a requestId when not provided", async () => {
  const calls: { body: unknown }[] = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    calls.push({ body: JSON.parse(String(init!.body)) });
    return new Response(
      JSON.stringify({ requestId: "auto", state: "complete" }),
      { status: 200 },
    );
  };
  await call("v1:foo.bar", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  });
  const sent = calls[0]!.body as { ctx: { requestId: string } };
  expect(typeof sent.ctx.requestId).toBe("string");
  expect(sent.ctx.requestId.length).toBeGreaterThan(0);
});

test("call sends Authorization header when a static token is supplied", async () => {
  let captured: Headers | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    captured = new Headers(init!.headers);
    return new Response(JSON.stringify({ requestId: "x", state: "complete" }), {
      status: 200,
    });
  };
  await call("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
    token: "abc.def.ghi",
  });
  expect(captured!.get("authorization")).toBe("Bearer abc.def.ghi");
});

test("call resolves a function token (sync or async)", async () => {
  let captured: string | undefined;
  const fakeFetch: typeof fetch = async (_input, init) => {
    captured = new Headers(init!.headers).get("authorization") ?? undefined;
    return new Response(JSON.stringify({ requestId: "x", state: "complete" }), {
      status: 200,
    });
  };
  await call("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
    token: async () => "dyn-token",
  });
  expect(captured).toBe("Bearer dyn-token");
});

test("call without endpoint throws when no global location is available", async () => {
  await expect(
    call("v1:foo", {}, undefined, {
      fetch: mockFetch({ status: 200, body: {} }),
    }),
  ).rejects.toThrow(/endpoint/i);
});

test("parseResponse: true validates the response and rejects malformed payloads", async () => {
  const malformed: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        /* missing requestId, state */
      }),
      { status: 200 },
    );
  await expect(
    call("v1:foo", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: malformed,
      parseResponse: true,
    }),
  ).rejects.toThrow();
});
```

- [ ] **Step 2.2: Run, verify failure**

```bash
bun test --cwd packages/client test/call.test.ts 2>&1 | tail -10
```

Expected: import error or test failures.

- [ ] **Step 2.3: Implement `packages/client/src/call.ts`**

Implementation outline:

- Import `ResponseEnvelope` (type) from `@opencall/types`.
- Optionally import `ResponseEnvelopeSchema` if it exists; if not, do defensive parsing as JSON-shape checks.
- Resolve `endpoint`: use `options?.endpoint`; if absent and `globalThis.location?.origin` is available (browser), use that; otherwise throw with a clear message.
- Resolve `token`: if function, await it; if string, use as-is.
- Generate `requestId` via `crypto.randomUUID()` if `ctx.requestId` is missing.
- Construct envelope `{ op, args, ctx }` with `ctx` being a merged object.
- POST to `${endpoint}/call` with `Content-Type: application/json` and the envelope as body. If token, add `Authorization: Bearer <token>`.
- Read response JSON; if `options.parseResponse === true`, validate via `ResponseEnvelopeSchema.parse()` (or equivalent).
- Return the parsed `ResponseEnvelope`.

Then re-export from `packages/client/src/index.ts`:

```ts
export { call, type CallContext, type CallOptions } from "./call.js";
```

- [ ] **Step 2.4: Verify tests pass**

```bash
bun run --cwd packages/client build
bun test --cwd packages/client
```

Expected: 6/6 tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add packages/client/src/call.ts packages/client/src/index.ts packages/client/test/call.test.ts
git commit -m "client: implement core call() over fetch"
```

---

### Task 3: TDD `callAndWait()` polling helper

**Files:**

- Create: `packages/client/src/wait.ts`
- Create: `packages/client/test/wait.test.ts`
- Modify: `packages/client/src/index.ts` (re-export)

For async operations, the response state is `accepted` or `pending` and includes a `location.uri` to poll plus a `retryAfterMs`. `callAndWait` initiates the call, then polls until the state is no longer pending.

**Surface:**

```ts
export async function callAndWait(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallOptions & { maxWaitMs?: number; minPollMs?: number },
): Promise<ResponseEnvelope> { ... }
```

If `maxWaitMs` is reached without resolution, throw a timeout error with the last seen state.

- [ ] **Step 3.1: Write failing tests**

Test cases:

1. Returns immediately when first response is `complete`.
2. Polls when first response is `accepted`, returns once the polled response is `complete`.
3. Honours `retryAfterMs` from the response between polls (verify by mocking timers — or by mocking fetch to return different states and counting calls).
4. Throws on `maxWaitMs` exceeded.
5. Returns `error` state without throwing (an error envelope is a valid terminal state, not a thrown exception).

Specific test code to include — keep tests focused and small:

```ts
import { test, expect } from "bun:test";
import { callAndWait } from "../src/wait";

test("callAndWait returns immediately on a complete first response", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ requestId: "x", state: "complete", result: 1 }),
      { status: 200 },
    );
  const res = await callAndWait("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  });
  expect(res.state).toBe("complete");
});

test("callAndWait polls when state is accepted, terminates on complete", async () => {
  let n = 0;
  const fakeFetch: typeof fetch = async (input) => {
    n++;
    const url = String(input);
    if (url.endsWith("/call")) {
      return new Response(
        JSON.stringify({
          requestId: "x",
          state: "accepted",
          location: { uri: "https://api.example.com/ops/x" },
          retryAfterMs: 1,
        }),
        { status: 202 },
      );
    }
    return new Response(
      JSON.stringify({ requestId: "x", state: "complete", result: 42 }),
      { status: 200 },
    );
  };
  const res = await callAndWait("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
    minPollMs: 1,
  });
  expect(res.state).toBe("complete");
  expect(Number(res.result)).toBe(42);
  expect(n).toBeGreaterThanOrEqual(2);
});

test("callAndWait throws on maxWaitMs exceeded", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        requestId: "x",
        state: "accepted",
        location: { uri: "https://api.example.com/ops/x" },
        retryAfterMs: 1,
      }),
      { status: 202 },
    );
  await expect(
    callAndWait("v1:foo", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
      maxWaitMs: 50,
      minPollMs: 1,
    }),
  ).rejects.toThrow(/maxWaitMs|timed out/i);
});

test("callAndWait returns terminal error state without throwing", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        requestId: "x",
        state: "error",
        error: { code: "FOO", message: "nope" },
      }),
      { status: 200 },
    );
  const res = await callAndWait("v1:foo", {}, undefined, {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  });
  expect(res.state).toBe("error");
  expect(res.error?.code).toBe("FOO");
});
```

- [ ] **Step 3.2: Verify failure**

```bash
bun test --cwd packages/client test/wait.test.ts 2>&1 | tail -10
```

- [ ] **Step 3.3: Implement `packages/client/src/wait.ts`**

Implementation:

- Call the underlying `call()` first.
- If state is `complete`, `error`, or `streaming`, return immediately.
- If state is `accepted` or `pending`, loop:
  - Sleep `Math.max(retryAfterMs ?? 1000, minPollMs ?? 0)` ms.
  - Fetch the `location.uri` (GET, with auth header).
  - Parse the response.
  - If state has terminated, return.
  - Track elapsed time; if it exceeds `maxWaitMs ?? 5*60*1000`, throw.

Re-export from `packages/client/src/index.ts`:

```ts
export { callAndWait } from "./wait.js";
```

- [ ] **Step 3.4: Verify tests pass**

```bash
bun run --cwd packages/client build
bun test --cwd packages/client
```

Expected: 4/4 wait tests + 6/6 call tests = 10/10 client tests pass; full suite still green.

- [ ] **Step 3.5: Commit**

```bash
git add packages/client/src/wait.ts packages/client/src/index.ts packages/client/test/wait.test.ts
git commit -m "client: add callAndWait polling helper"
```

---

### Task 4: TDD chunked retrieval helper

**Files:**

- Create: `packages/client/src/chunked.ts`
- Create: `packages/client/test/chunked.test.ts`
- Modify: `packages/client/src/index.ts` (re-export)

For large results, the spec says the server streams data as chunks the client pulls on its own schedule via `GET /ops/{requestId}/chunks?cursor=...`. Each chunk carries a `checksum` (sha256 of the chunk's data) and a `checksumPrevious` (the previous chunk's checksum, or null for the first chunk). The client MUST verify both the chain and each chunk's hash. See `client.md` "Chunked Retrieval" for the reference impl.

**Surface:**

```ts
export interface ChunkResponse {
  state: "pending" | "complete" | "error"
  chunk: { checksum: string; checksumPrevious: string | null }
  data: string  // base64
  cursor?: string
  error?: { code: string; message: string; cause?: unknown }
}

export async function retrieveChunked(
  requestId: string,
  options: CallOptions,
): Promise<Uint8Array> { ... }
```

`retrieveChunked` pulls chunks until `state === "complete"`, validates each chunk's hash and the chain, and returns the concatenated bytes. Throws on chain break, hash mismatch, or `state === "error"`.

- [ ] **Step 4.1: Write failing tests**

Test cases (use a fixture of 3 small chunks with computed sha256 chain):

1. Single-chunk complete response returns the decoded bytes.
2. Two-chunk sequence returns concatenated bytes; checksumPrevious chain validated.
3. Hash mismatch on any chunk throws.
4. Chain break (chunk 2's `checksumPrevious` doesn't match chunk 1's `checksum`) throws.
5. `state: "error"` throws with the error code in the message.

Provide exact test code:

```ts
import { test, expect } from "bun:test";
import { retrieveChunked } from "../src/chunked";

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

test("single-chunk complete retrieval returns the decoded bytes", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const checksum = `sha256:${await sha256Hex(bytes)}`;
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        state: "complete",
        chunk: { checksum, checksumPrevious: null },
        data: b64(bytes),
      }),
    );
  const out = await retrieveChunked("req-1", {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  });
  expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
});

test("two chunks concatenate when chain is valid", async () => {
  const c1 = new Uint8Array([1, 2, 3]);
  const c2 = new Uint8Array([4, 5, 6]);
  const h1 = `sha256:${await sha256Hex(c1)}`;
  const h2 = `sha256:${await sha256Hex(c2)}`;
  let n = 0;
  const fakeFetch: typeof fetch = async () => {
    n++;
    if (n === 1) {
      return new Response(
        JSON.stringify({
          state: "pending",
          chunk: { checksum: h1, checksumPrevious: null },
          data: b64(c1),
          cursor: "1",
        }),
      );
    }
    return new Response(
      JSON.stringify({
        state: "complete",
        chunk: { checksum: h2, checksumPrevious: h1 },
        data: b64(c2),
      }),
    );
  };
  const out = await retrieveChunked("req-1", {
    endpoint: "https://api.example.com",
    fetch: fakeFetch,
  });
  expect(Array.from(out)).toEqual([1, 2, 3, 4, 5, 6]);
});

test("chain break throws", async () => {
  const c1 = new Uint8Array([1]);
  const c2 = new Uint8Array([2]);
  const h1 = `sha256:${await sha256Hex(c1)}`;
  const h2 = `sha256:${await sha256Hex(c2)}`;
  let n = 0;
  const fakeFetch: typeof fetch = async () => {
    n++;
    if (n === 1)
      return new Response(
        JSON.stringify({
          state: "pending",
          chunk: { checksum: h1, checksumPrevious: null },
          data: b64(c1),
          cursor: "1",
        }),
      );
    return new Response(
      JSON.stringify({
        state: "complete",
        chunk: { checksum: h2, checksumPrevious: "sha256:WRONG" },
        data: b64(c2),
      }),
    );
  };
  await expect(
    retrieveChunked("req-1", {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/chain/i);
});

test("hash mismatch throws", async () => {
  const c1 = new Uint8Array([1, 2, 3]);
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        state: "complete",
        chunk: { checksum: "sha256:WRONG", checksumPrevious: null },
        data: b64(c1),
      }),
    );
  await expect(
    retrieveChunked("req-1", {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/checksum|mismatch/i);
});

test("error state throws with the error code", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        state: "error",
        chunk: { checksum: "sha256:0", checksumPrevious: null },
        data: "",
        error: { code: "INTERNAL_ERROR", message: "boom" },
      }),
    );
  await expect(
    retrieveChunked("req-1", {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/INTERNAL_ERROR|boom/);
});
```

- [ ] **Step 4.2: Verify failure**

```bash
bun test --cwd packages/client test/chunked.test.ts 2>&1 | tail -10
```

- [ ] **Step 4.3: Implement `packages/client/src/chunked.ts`**

Implementation pseudocode:

```
async function retrieveChunked(requestId, options):
  chunks = []
  cursor = undefined
  previousChecksum = null

  loop:
    url = `${endpoint}/ops/${requestId}/chunks${cursor ? `?cursor=${cursor}` : ""}`
    res = JSON.parse(await fetch(url, { headers: authHeader(options) }))

    if res.state === "error":
      throw new Error(`${res.error.code}: ${res.error.message}`)

    if res.chunk.checksumPrevious !== previousChecksum:
      throw new Error("Chunk chain broken")

    bytes = base64Decode(res.data)
    actual = `sha256:${await sha256Hex(bytes)}`
    if actual !== res.chunk.checksum:
      throw new Error("Chunk checksum mismatch")

    chunks.push(bytes)
    previousChecksum = res.chunk.checksum

    if res.state === "complete": break
    if !res.cursor: throw new Error("Server returned non-terminal state without a cursor")
    cursor = res.cursor

  return concatenate(chunks)
```

Re-export from index.ts:

```ts
export { retrieveChunked, type ChunkResponse } from "./chunked.js";
```

- [ ] **Step 4.4: Verify tests pass**

```bash
bun run --cwd packages/client build
bun test --cwd packages/client
```

Expected: all 5 chunked tests pass; full client suite green.

- [ ] **Step 4.5: Commit**

```bash
git add packages/client/src/chunked.ts packages/client/src/index.ts packages/client/test/chunked.test.ts
git commit -m "client: add retrieveChunked with checksum chain validation"
```

---

### Task 5: TDD stream subscription helper

**Files:**

- Create: `packages/client/src/stream.ts`
- Create: `packages/client/test/stream.test.ts`
- Modify: `packages/client/src/index.ts` (re-export)

Stream subscription returns a `state: "streaming"` response carrying a `stream` object with `transport`, `encoding`, `schema`, `location`, `sessionId`, and possibly short-lived `auth` credentials. Per `client.md`, the _connection_ itself is the caller's responsibility (wss/MQTT/Kafka — different transports). The helper's job is just to perform the subscribe call and return the stream descriptor (typed).

**Surface:**

```ts
export interface StreamDescriptor {
  transport: string
  encoding: string
  schema: string
  location: string
  sessionId: string
  expiresAt?: number
  auth?: { credentialType: string; credential: string; expiresAt?: number }
}

export async function subscribeStream(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallOptions,
): Promise<StreamDescriptor> { ... }
```

Throws if the response state isn't `streaming`, with a message including the actual state.

- [ ] **Step 5.1: Tests**

```ts
import { test, expect } from "bun:test";
import { subscribeStream } from "../src/stream";

test("subscribeStream returns the stream descriptor on a streaming response", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        requestId: "ggg",
        state: "streaming",
        stream: {
          transport: "wss",
          encoding: "protobuf",
          schema: "device.PositionFrame",
          location: "wss://streams.example.com/s/ggg",
          sessionId: "mission-001",
          expiresAt: 1739282400,
        },
      }),
    );
  const desc = await subscribeStream(
    "v1:device.subscribePosition",
    { deviceId: "arm-1" },
    undefined,
    {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    },
  );
  expect(desc.transport).toBe("wss");
  expect(desc.location).toBe("wss://streams.example.com/s/ggg");
  expect(desc.sessionId).toBe("mission-001");
});

test("subscribeStream throws when state is not streaming", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        requestId: "x",
        state: "complete",
        result: { unexpected: true },
      }),
    );
  await expect(
    subscribeStream("v1:device.subscribePosition", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/streaming/i);
});

test("subscribeStream throws when stream object is missing", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        requestId: "x",
        state: "streaming",
      }),
    );
  await expect(
    subscribeStream("v1:device.subscribePosition", {}, undefined, {
      endpoint: "https://api.example.com",
      fetch: fakeFetch,
    }),
  ).rejects.toThrow(/stream/);
});
```

- [ ] **Step 5.2: Verify failure**

```bash
bun test --cwd packages/client test/stream.test.ts 2>&1 | tail -10
```

- [ ] **Step 5.3: Bump `@opencall/types` to add `StreamDescriptor` and the `stream` field**

The existing `ResponseEnvelope` in `@opencall/types@0.1.0` doesn't model the `stream` object. We're going to type-safely return it from the client, so we need it in the canonical contract. This is an additive change — bump types to `0.1.1` (patch).

Edit `packages/types/src/envelope.ts`. Add a new exported interface and add the `stream` field to `ResponseEnvelope`:

```ts
export interface StreamDescriptor {
  transport: string;
  encoding: string;
  schema: string;
  location: string;
  sessionId: string;
  expiresAt?: number;
  auth?: { credentialType: string; credential: string; expiresAt?: number };
}

export interface ResponseEnvelope {
  // ... existing fields ...
  stream?: StreamDescriptor;
}
```

Update `packages/types/src/index.ts` to re-export the new type:

```ts
export {
  RequestEnvelopeSchema,
  type RequestEnvelope,
  type ResponseState,
  type ResponseEnvelope,
  type StreamDescriptor,
} from "./envelope.js";
```

Bump `packages/types/package.json` `version` from `0.1.0` to `0.1.1`.

Add an entry to `packages/types/CHANGELOG.md`:

```markdown
## 0.1.1 — 2026-04-27

### Added
- `StreamDescriptor` interface and `ResponseEnvelope.stream?: StreamDescriptor` field. Models the streaming subscription response shape that the spec already documents on the wire.
```

Add a small test in `packages/server/test/envelope.test.ts` (or wherever the envelope tests live):

```ts
import type { ResponseEnvelope, StreamDescriptor } from "@opencall/types";

test("ResponseEnvelope accepts an optional stream descriptor", () => {
  const env: ResponseEnvelope = {
    requestId: "x",
    state: "streaming",
    stream: {
      transport: "wss",
      encoding: "protobuf",
      schema: "device.PositionFrame",
      location: "wss://streams.example.com/s/x",
      sessionId: "session-1",
    },
  };
  expect(env.stream?.transport).toBe("wss");
});

test("StreamDescriptor accepts optional auth + expiresAt", () => {
  const desc: StreamDescriptor = {
    transport: "wss",
    encoding: "protobuf",
    schema: "device.PositionFrame",
    location: "wss://streams.example.com/s/x",
    sessionId: "session-1",
    expiresAt: 1739282400,
    auth: { credentialType: "bearer", credential: "short-lived", expiresAt: 1739282400 },
  };
  expect(desc.auth?.credentialType).toBe("bearer");
});
```

Verify and commit the types bump as a separate commit:

```bash
bun --filter='@opencall/types' run build
bun test
git add packages/types/src/envelope.ts packages/types/src/index.ts packages/types/package.json packages/types/CHANGELOG.md packages/server/test/envelope.test.ts
git commit -m "types: 0.1.1 — add StreamDescriptor and ResponseEnvelope.stream"
```

- [ ] **Step 5.4: Implement `packages/client/src/stream.ts`** — fully type-safe, no cast

```ts
import type { ResponseEnvelope, StreamDescriptor } from "@opencall/types";
import { call } from "./call.js";
import type { CallContext, CallOptions } from "./call.js";

export async function subscribeStream(
  op: string,
  args: Record<string, unknown>,
  ctx?: CallContext,
  options?: CallOptions,
): Promise<StreamDescriptor> {
  const res: ResponseEnvelope = await call(op, args, ctx, options);
  if (res.state !== "streaming") {
    throw new Error(
      `subscribeStream: expected state="streaming" but got "${res.state}"${
        res.error ? ` (error ${res.error.code}: ${res.error.message})` : ""
      }`,
    );
  }
  if (!res.stream) {
    throw new Error(
      "subscribeStream: response had state=streaming but no stream descriptor",
    );
  }
  return res.stream;
}
```

`StreamDescriptor` now comes from `@opencall/types` — the client doesn't redefine it. This means consumers of both `@opencall/client` and `@opencall/types` see the same `StreamDescriptor` identity.

Re-export from `packages/client/src/index.ts`. Re-export the type for ergonomics so consumers don't have to install `@opencall/types` separately just to type the return value:

```ts
export { subscribeStream } from "./stream.js";
export type { StreamDescriptor } from "@opencall/types";
```

Bump `packages/client/package.json` `dependencies."@opencall/types"` from `^0.1.0` to `^0.1.1` (so the lockfile records the new version once published).

- [ ] **Step 5.5: Verify tests pass + commit (client side)**

```bash
bun run build
bun test
git add packages/client/src/stream.ts packages/client/src/index.ts packages/client/test/stream.test.ts packages/client/package.json bun.lock
git commit -m "client: add subscribeStream helper using StreamDescriptor from @opencall/types@^0.1.1"
```

---

### Task 6: TDD codegen CLI

**Files:**

- Create: `packages/client/src/codegen.ts`
- Create: `packages/client/src/cli/codegen.ts`
- Create: `packages/client/test/codegen.test.ts`
- Modify: `packages/client/src/index.ts` (re-export of the lib API; the CLI is a separate entry point)

The codegen reads either a registry URL (e.g. `https://api.example.com/.well-known/ops`) or a local JSON file conforming to `RegistryResponse`. It emits a single `.d.ts` containing:

1. An `Operations` map type — keys are op names, values are `{ args; result }` types.
2. A typed `call` declaration that constrains `args` per op and types the result accordingly.
3. JSDoc `@deprecated` annotations for ops marked `deprecated: true`, including the sunset date in the message.

The library entry point (`codegen.ts`) takes a `RegistryResponse` and returns a string of `.d.ts` content — pure function, easy to test. The CLI entry point (`cli/codegen.ts`) reads from URL/file, resolves the registry, calls the library, writes to a destination path.

**Library surface:**

```ts
export interface CodegenOptions {
  /** Whether to include the typed `call` overload. Defaults to true. */
  emitCall?: boolean
}

export function generateClientTypes(
  registry: RegistryResponse,
  options?: CodegenOptions,
): string { ... }
```

**CLI surface:**

```bash
opencall-codegen --from <url-or-file> --out <path>
opencall-codegen --from https://api.example.com/.well-known/ops --out src/generated/opencall.d.ts
```

- [ ] **Step 6.1: Tests for the library function**

```ts
import { test, expect } from "bun:test";
import { generateClientTypes } from "../src/codegen";
import type { RegistryResponse } from "@opencall/types";

const fixture: RegistryResponse = {
  callVersion: "2026-02-10",
  operations: [
    {
      op: "v1:orders.getItem",
      argsSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
      resultSchema: {
        type: "object",
        properties: { name: { type: "string" }, price: { type: "number" } },
      },
      sideEffecting: false,
      idempotencyRequired: false,
      executionModel: "sync",
      maxSyncMs: 1000,
      ttlSeconds: 0,
      authScopes: [],
      cachingPolicy: "none",
      deprecated: true,
      sunset: "2026-06-01",
      replacement: "v2:orders.getItem",
    },
    {
      op: "v2:orders.getItem",
      argsSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
      resultSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          price: { type: "number" },
          currency: { type: "string" },
        },
      },
      sideEffecting: false,
      idempotencyRequired: false,
      executionModel: "sync",
      maxSyncMs: 1000,
      ttlSeconds: 0,
      authScopes: [],
      cachingPolicy: "none",
    },
  ],
};

test("generateClientTypes emits an Operations map keyed by op name", () => {
  const out = generateClientTypes(fixture);
  expect(out).toContain('"v1:orders.getItem"');
  expect(out).toContain('"v2:orders.getItem"');
  expect(out).toContain("type Operations");
});

test("generated types include args and result subtypes per op", () => {
  const out = generateClientTypes(fixture);
  expect(out).toContain("orderId: string");
  expect(out).toContain("price: number");
});

test("deprecated ops carry @deprecated JSDoc with sunset", () => {
  const out = generateClientTypes(fixture);
  expect(out).toMatch(/@deprecated.*v1:orders\.getItem|2026-06-01/);
});

test("generates a typed call function declaration", () => {
  const out = generateClientTypes(fixture);
  expect(out).toContain("declare function call");
  expect(out).toContain("Op extends keyof Operations");
});
```

- [ ] **Step 6.2: Implement `packages/client/src/codegen.ts`**

A pragmatic JSON-Schema → TypeScript renderer covering: object with required-driven optionality, primitive types (`string`, `number`, `integer`, `boolean`), `array` with items, `enum`, and a fallback to `unknown` for anything else. Document the limitations in a comment. Output should look roughly like the example in `client.md` ("IDE Autocomplete for Free" section).

For each op: emit a property entry of the form
`"<op>": { args: <argsType>; result: <resultType> }` inside a `type Operations = { ... }`.

Then a `declare function call` overload constraining `args` to `Operations[Op]["args"]` and returning `Promise<CallResponse<Operations[Op]["result"]>>`.

For deprecated ops, prepend a JSDoc block:

```
/**
 * @deprecated Sunset: <sunset>. Use <replacement>.
 */
```

- [ ] **Step 6.3: Tests for the CLI**

Add to `packages/client/test/codegen.test.ts` (or create `test/cli.test.ts`):

```ts
import { test, expect } from "bun:test";
import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("opencall-codegen reads a local JSON registry and writes a .d.ts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opencall-codegen-"));
  const inFile = join(dir, "ops.json");
  const outFile = join(dir, "out.d.ts");
  await writeFile(
    inFile,
    JSON.stringify({
      callVersion: "2026-02-10",
      operations: [
        {
          op: "v1:foo",
          argsSchema: { type: "object" },
          resultSchema: { type: "object" },
          sideEffecting: false,
          idempotencyRequired: false,
          executionModel: "sync",
          maxSyncMs: 0,
          ttlSeconds: 0,
          authScopes: [],
          cachingPolicy: "none",
        },
      ],
    }),
  );
  const r = spawnSync(
    "bun",
    ["run", "src/cli/codegen.ts", "--from", inFile, "--out", outFile],
    {
      cwd: process.cwd().endsWith("/packages/client")
        ? process.cwd()
        : "packages/client",
      encoding: "utf8",
    },
  );
  expect(r.status).toBe(0);
  const out = await readFile(outFile, "utf8");
  expect(out).toContain('"v1:foo"');
});
```

- [ ] **Step 6.4: Implement `packages/client/src/cli/codegen.ts`**

A small Bun script that:

1. Parses argv (`--from`, `--out`).
2. If `--from` starts with `http://` or `https://`, fetches with `fetch()`.
3. Otherwise treats it as a file path and reads it.
4. Parses JSON, validates basic shape (has `operations` array).
5. Calls `generateClientTypes(registry)`.
6. Writes to `--out`.
7. Exits 0 on success, prints a message and exits 1 on failure.

- [ ] **Step 6.5: Verify tests pass + commit**

```bash
bun run --cwd packages/client build
bun test --cwd packages/client
git add packages/client/src/codegen.ts packages/client/src/cli packages/client/src/index.ts packages/client/test/codegen.test.ts
git commit -m "client: add generateClientTypes lib + opencall-codegen CLI"
```

---

### Task 7: README, CHANGELOG, LICENSE

**Files:**

- Create: `packages/client/README.md`
- Create: `packages/client/CHANGELOG.md`
- Create: `packages/client/LICENSE` (copy from repo root)
- Modify: root `README.md` to mark `@opencall/client` as shipped (was "forthcoming" in Phase 1a)

- [ ] **Step 7.1: Create `packages/client/README.md`** with REAL triple-backtick fences (the prompt below escapes them so you can read; the file uses real ones):

```markdown
# @opencall/client

> **Canonical docs:** [https://opencall-api.com/spec/client/](https://opencall-api.com/spec/client/). Raw markdown is served alongside; GitHub may block non-Copilot bots.

The thin OpenCALL client. One `call()` function over `fetch`, plus a small handful of helpers for async polling, stream subscription, chunked retrieval, and code generation. Built on [`@opencall/types`](https://www.npmjs.com/package/@opencall/types) — the canonical Zod schemas and types are imported from there, not redefined.

The thinness is the point. There is no class hierarchy, no verb mapping, no path templating. The operation name is the intent; the envelope is the wire format.

## Install

\`\`\`bash
npm install @opencall/client @opencall/types

# or

bun add @opencall/client @opencall/types
\`\`\`

## Surface

- `call(op, args, ctx?, options?)` — POST `/call`, returns the response envelope.
- `callAndWait(op, args, ctx?, options?)` — same but polls async responses to terminal state.
- `retrieveChunked(requestId, options)` — pulls chunks with checksum chain validation, returns concatenated bytes.
- `subscribeStream(op, args, ctx?, options?)` — returns the stream descriptor (transport, location, auth) for the caller to connect to.
- `generateClientTypes(registry, options?)` — pure function that emits TypeScript declarations from a `RegistryResponse`.
- `bin opencall-codegen` — CLI that reads a registry URL or local JSON and writes a `.d.ts`.

## Quick example

\`\`\`ts
import { call } from "@opencall/client"

const res = await call(
"v1:orders.getItem",
{ orderId: "456", itemId: "789" },
undefined,
{ endpoint: "https://api.example.com", token: () => getToken() },
)
if (res.state === "complete") {
console.log(res.result)
}
\`\`\`

## Codegen

Generate typed wrappers from a live registry:

\`\`\`bash
npx opencall-codegen --from https://api.example.com/.well-known/ops --out src/generated/opencall.d.ts
\`\`\`

The generated `.d.ts` augments the `call` declaration with operation-specific arg and result types. No runtime code; pure TypeScript.

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. The `@opencall/types` peer dependency declares the same.

## License

Apache-2.0
```

- [ ] **Step 7.2: Create `packages/client/CHANGELOG.md`**:

```markdown
# Changelog

## 0.1.0 — 2026-04-27

Initial release. The thin OpenCALL client + codegen.

### Added

- `call()` — single-function `POST /call` with envelope construction, ctx merging, optional Bearer token (static or function), optional response validation via `@opencall/types`'s `ResponseEnvelopeSchema`.
- `callAndWait()` — polling helper for async (`accepted`/`pending`) responses, honours `retryAfterMs`, configurable `maxWaitMs`.
- `retrieveChunked()` — pulls server-driven chunked results, validates each chunk's sha256 hash and the chain of `checksumPrevious` links.
- `subscribeStream()` — performs the subscribe call and returns the typed stream descriptor (`transport`, `encoding`, `schema`, `location`, `sessionId`, optional `auth`); connection itself is the caller's responsibility.
- `generateClientTypes()` — library function emitting TypeScript declarations from a `RegistryResponse`.
- `opencall-codegen` CLI — reads registry URL or local JSON, writes a `.d.ts`.
```

- [ ] **Step 7.3: Copy LICENSE**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
cp LICENSE packages/client/LICENSE
```

- [ ] **Step 7.4: Update root `README.md`**

Find the line for `@opencall/client (forthcoming)` and change to:

```markdown
| [`@opencall/client`](packages/client/) | Thin OpenCALL client + `opencall-codegen` CLI. |
```

- [ ] **Step 7.5: Verify and commit**

```bash
ls packages/client/{README.md,CHANGELOG.md,LICENSE}
diff LICENSE packages/client/LICENSE && echo match
bun test
git add packages/client/README.md packages/client/CHANGELOG.md packages/client/LICENSE README.md
git commit -m "docs(client): README, CHANGELOG, LICENSE; mark client as shipped in monorepo README"
```

---

### Task 8: Manual first publish

**Files:** none (publishes to npm).

Bootstrap publish from your laptop. Trusted publishing for `@opencall/client` is configured AFTER first publish (chicken-and-egg, same as Phase 1a). Phase 1a learned that `publishConfig.provenance: true` blocks local publish — Task 1's package.json already omits it.

This task publishes **two artifacts in order**: `@opencall/types@0.1.1` first (the StreamDescriptor bump from Task 5), then `@opencall/client@0.1.0`. Client must publish second so its `dependencies."@opencall/types": "^0.1.1"` resolves.

- [ ] **Step 8.1: Pre-publish sanity**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
bun install --frozen-lockfile
bun run build
bun run typecheck
bun test
```

Expected: all green.

- [ ] **Step 8.2: Inspect what would publish (both packages)**

```bash
cd packages/types && npm pack --dry-run 2>&1 | tail -25 && cd ../..
cd packages/client && npm pack --dry-run 2>&1 | tail -40 && cd ../..
```

For `@opencall/types`: file list includes `dist/`, `src/`, `README.md`, `CHANGELOG.md`, `LICENSE`, `package.json`. Version `0.1.1`.

For `@opencall/client`: same shape. NO `test/`, no `node_modules/`, no `tsconfig.json`. Sanity-check `dependencies` reads `"@opencall/types": "^0.1.1"` (plain semver, NOT `workspace:`).

- [ ] **Step 8.3: Verify the client tarball declares clean semver against types@0.1.1**

```bash
cd packages/client
npm pack 2>&1 | tail -3
tar -xzf opencall-client-0.1.0.tgz package/package.json -O | python3 -c "import sys, json; pj = json.load(sys.stdin); print('dependencies:', pj.get('dependencies'))"
rm opencall-client-0.1.0.tgz
cd ../..
```

Expected: `dependencies: {'@opencall/types': '^0.1.1', 'zod': '^3.25.0'}`.

- [ ] **Step 8.4: Publish `@opencall/types@0.1.1` first**

```bash
cd packages/types
npm publish --access public
npm view @opencall/types version
cd ../..
```

Expected: success, `npm view` returns `0.1.1`. (`0.1.0` from Phase 1a stays available too — that's just an additional version.)

- [ ] **Step 8.5: Publish `@opencall/client@0.1.0`**

```bash
cd packages/client
npm publish --access public
npm view @opencall/client version
cd ../..
```

Expected: success, `npm view` returns `0.1.0` and the dependency on `@opencall/types: ^0.1.1` resolves cleanly.

- [ ] **Step 8.6: End-to-end install test**

```bash
TEST_DIR=$(mktemp -d -t opencall-client-test-XXXX)
cd "$TEST_DIR"
npm init -y > /dev/null
npm pkg set type=module > /dev/null
npm install @opencall/client
node --input-type=module -e "
import { call, callAndWait, retrieveChunked, subscribeStream, generateClientTypes } from '@opencall/client';
console.log('imports:', { call: typeof call, callAndWait: typeof callAndWait, retrieveChunked: typeof retrieveChunked, subscribeStream: typeof subscribeStream, generateClientTypes: typeof generateClientTypes });
"
cd / && rm -rf "$TEST_DIR"
```

Expected: all five entries are `function`. Verify the install pulled `@opencall/types@0.1.1` (run `npm ls` inside the test dir before deleting it).

- [ ] **Step 8.7: Configure trusted publisher for `@opencall/client`** (manual)

Open https://www.npmjs.com/package/@opencall/client/access → **Trusted Publishers → Add**:

- Provider: GitHub Actions
- Org: `opencall-api`
- Repository: `ts-tools`
- Workflow filename: `release.yml`
- Environment: (leave blank)

`@opencall/types`'s trusted publisher is already configured from Phase 1a — nothing to do there.

Future bumps via tag push will publish with provenance.

- [ ] **Step 8.8: Update the release.yml workflow to know about client**

Edit `.github/workflows/release.yml`. The "Determine package" step's case statement currently matches `types-v*` and `server-v*`. Add `client-v*`:

```yaml
case "$tag" in
types-v*) echo "name=types" >> "$GITHUB_OUTPUT" ;;
server-v*) echo "name=server" >> "$GITHUB_OUTPUT" ;;
client-v*) echo "name=client" >> "$GITHUB_OUTPUT" ;;
*) echo "Unrecognised tag $tag"; exit 1 ;;
esac
```

Also add `"client-v*.*.*"` to the `on.push.tags` list and `client` to the `workflow_dispatch.inputs.package.options` list.

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add client tag pattern + dispatch option"
```

---

### Task 9: Tag the release and open PR

- [ ] **Step 9.1: Push branch**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
git push -u origin phase-1b-client
```

If SSH push hangs (intermittent on this network), switch to HTTPS:

```bash
git remote set-url --push origin https://github.com/opencall-api/ts-tools.git
git push
git remote set-url --push origin git@github.com:opencall-api/ts-tools.git
```

- [ ] **Step 9.2: Tag both releases**

```bash
git tag types-v0.1.1
git tag client-v0.1.0
git push --tags
```

The release workflow will run for each tag; both will fail-as-expected since the versions were already published manually in Task 8. Future bumps publish automatically with provenance.

- [ ] **Step 9.3: Open PR**

```bash
gh pr create --repo opencall-api/ts-tools --base main --head phase-1b-client \
  --title "Phase 1b: ship @opencall/client@0.1.0 + @opencall/types@0.1.1" \
  --body "Implements Phase 1b of the multi-language tooling strategy. Adds packages/client to the ts-tools monorepo (call(), callAndWait(), retrieveChunked(), subscribeStream(), generateClientTypes(), and the opencall-codegen CLI). Bumps @opencall/types to 0.1.1 to add StreamDescriptor + ResponseEnvelope.stream so subscribeStream is fully type-safe with no casts. Both packages published manually as the bootstrap; trusted publishing covers future automated releases."
```

---

## Done When

- [ ] `packages/client/` exists in the monorepo with package.json, tsconfig.json, src/, test/, README.md, CHANGELOG.md, LICENSE.
- [ ] `bun run build`, `bun run typecheck`, and `bun test` are all green from a cold checkout.
- [ ] Client tests cover call (6), callAndWait (4), retrieveChunked (5), subscribeStream (3), codegen library (4), codegen CLI (1) — at least 23 new tests total.
- [ ] `npm view @opencall/types version` returns `0.1.1`.
- [ ] `npm view @opencall/client version` returns `0.1.0` and its `dependencies` declare `@opencall/types: ^0.1.1`.
- [ ] `npm install @opencall/client` in a scratch project resolves cleanly with `@opencall/types@^0.1.1` as a transitive dep, and ESM imports of all named exports return `function`.
- [ ] Trusted publisher configured for `@opencall/client` on npmjs.com (`@opencall/types` already had its publisher configured in Phase 1a).
- [ ] Tags `types-v0.1.1` and `client-v0.1.0` exist in `opencall-api/ts-tools`.
- [ ] `subscribeStream` returns `StreamDescriptor` from `@opencall/types` with no runtime cast.
- [ ] `release.yml` recognises `client-v*` tags and the `client` workflow_dispatch option.
- [ ] PR open against `opencall-api/ts-tools:main`.

## Out of Scope (deferred)

- **MQTT/Kafka transport adapters.** `subscribeStream` returns the descriptor; the caller connects via whatever transport the descriptor names. We don't ship adapters in v0.1.0.
- **Browser-multipart media upload helpers.** The `media: [...]` envelope shape works with native `FormData`; we don't add helpers around it in v0.1.0.
- **JSON-Schema → TS coverage parity.** The codegen handles the common shapes (object with required, primitives, array, enum, fallback to `unknown`). Edge cases like `oneOf`/`anyOf`/`allOf`, `additionalProperties` schemas, conditional schemas, and refs are deferred to a future bump.
- **Promotion to `@opencall/client@1.0.0`.** Happens when the API is declared stable.
- **Migrating `tests/api/typescript/`** in the spec repo to use `@opencall/client` for its self-tests. Separate effort.
