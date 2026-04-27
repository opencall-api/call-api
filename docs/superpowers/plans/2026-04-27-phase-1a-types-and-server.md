# Phase 1a — `@opencall/types@0.1.0` + `@opencall/server@0.2.0` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `opencall-api/ts-tools` into a Bun-workspace monorepo, extract envelope schemas/error classes/types from the existing flat layout into a new `@opencall/types` package, apply the five outstanding items from `requested_changes.md` to either types or server as appropriate, set up OIDC trusted publishing on npm, and ship `@opencall/types@0.1.0` and `@opencall/server@0.2.0` together as the first published `@opencall` artifacts.

**Architecture:** Two workspace packages in one submodule repo (`opencall-api/ts-tools`):

- `packages/types/` → `@opencall/types` — Zod schemas + `z.infer`'d types for request/response envelope, registry, errors. Contains `DomainError`/`BackendUnavailableError` classes (contract-level error shapes). Both server and client depend on this.
- `packages/server/` → `@opencall/server` — registry builder, JSDoc parser, dispatcher helpers, validate helpers, codegen, CLI. `import`s schemas and types from `@opencall/types`.

The published artifacts are independent in version space (types@0.1.0, server@0.2.0) but ship together in the same release wave. Future server bumps may bump types or not depending on whether the contract changes.

**Tech Stack:**

- Bun (runtime + test + build + workspaces)
- TypeScript ^5
- Zod (already at v4 per existing imports `from "zod/v4"`)
- GitHub Actions for release CI; OIDC trusted publishing on npm
- The repo lives at `git@github.com:opencall-api/ts-tools.git` (separate from the spec repo)

**Reference inputs:**
- Strategy doc: `docs/superpowers/specs/2026-04-27-multi-language-tooling-design.md` (in the spec repo)
- Outstanding tooling fixes: `requested_changes.md` (in the spec repo root, untracked at the moment of writing). Items 2 and 7 are already done in the submodule; items 1, 3, 4, 5, 6 remain.

---

## Pre-flight

Before starting, set up the working environment.

- [ ] **Step P1: Confirm gh CLI auth and that `opencall-api/ts-tools` is reachable**

```bash
gh auth status 2>&1 | head -3
gh repo view opencall-api/ts-tools --json defaultBranchRef
```

Expected: gh authenticated with org access; the repo command returns JSON with `"name": "main"` (or the actual default branch).

- [ ] **Step P2: Clone `opencall-api/ts-tools` into a sibling worktree directory of the spec repo**

The Phase 1a work happens in a different repo from the spec repo's worktree. Clone to a sibling directory:

```bash
cd /mnt/dev/call-api/.worktrees
git clone git@github.com:opencall-api/ts-tools.git phase-1a-ts-tools
cd phase-1a-ts-tools
git status
```

Expected: clean checkout on `main`, latest commit is the work the user did locally before the transfer (commit `5fbd4c1` "Add buildRegistryFromModules() for environments without filesystem access" or newer if pushed since).

- [ ] **Step P3: Create the feature branch**

```bash
git checkout -b phase-1a-types-and-server
git status
```

Expected: on branch `phase-1a-types-and-server`, working tree clean.

- [ ] **Step P4: Verify baseline tests pass**

```bash
bun install
bun test
```

Expected: tests pass cleanly. Capture the test count for the post-flight comparison. If tests fail, STOP and report the failure to the user — we do not start migrations on a red baseline.

---

### Task 1: Create the workspace skeleton

**Files:**
- Create: `package.json` at repo root (rewrite the existing root `package.json` as a workspace root)
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `tsconfig.base.json` at repo root (shared compiler options)
- Move (later in Task 2): `src/*.ts` files

This task only adds the new workspace files; existing `src/` stays where it is until Task 2.

- [ ] **Step 1.1: Inspect the existing root `package.json` so we can preserve fields that still apply**

```bash
cat package.json
```

Note the existing values for `keywords`, `license`, `repository`, `description`. We will distribute these between the workspace root, `packages/types/package.json`, and `packages/server/package.json`.

- [ ] **Step 1.2: Rewrite the root `package.json` as a workspace root**

Replace the existing file content entirely with:

```json
{
  "name": "@opencall/ts-tools-monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "bun --filter '*' build",
    "test": "bun test",
    "typecheck": "bun --filter '*' typecheck"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "^5"
  },
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/opencall-api/ts-tools.git"
  }
}
```

The root package is `private: true` — never published. It exists only to coordinate the workspace.

- [ ] **Step 1.3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": false,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 1.4: Create `packages/types/package.json`**

```json
{
  "name": "@opencall/types",
  "version": "0.1.0",
  "description": "OpenCALL canonical Zod schemas and types for the request/response envelope, registry, and error contract",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "src",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "zod": "^3.25.0"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "keywords": [
    "opencall",
    "api",
    "zod",
    "schema",
    "types",
    "envelope"
  ],
  "license": "Apache-2.0",
  "homepage": "https://opencall-api.com/spec",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/opencall-api/ts-tools.git",
    "directory": "packages/types"
  },
  "bugs": {
    "url": "https://github.com/opencall-api/ts-tools/issues"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

- [ ] **Step 1.5: Create `packages/types/tsconfig.json`**

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

- [ ] **Step 1.6: Create `packages/server/package.json`**

```json
{
  "name": "@opencall/server",
  "version": "0.2.0",
  "description": "OpenCALL server tooling — registry builder, JSDoc operation discovery, dispatcher helpers, runtime payload validation",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "opencall-generate-ops": "./dist/cli/generate-ops.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "src",
    "README.md",
    "CHANGELOG.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@opencall/types": "workspace:^0.1.0",
    "zod": "^3.25.0"
  },
  "peerDependencies": {
    "typescript": "^5"
  },
  "keywords": [
    "opencall",
    "api",
    "zod",
    "validation",
    "operations",
    "registry",
    "dispatcher"
  ],
  "license": "Apache-2.0",
  "homepage": "https://opencall-api.com/spec",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/opencall-api/ts-tools.git",
    "directory": "packages/server"
  },
  "bugs": {
    "url": "https://github.com/opencall-api/ts-tools/issues"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  }
}
```

- [ ] **Step 1.7: Create `packages/server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["dist", "node_modules", "test"],
  "references": [
    { "path": "../types" }
  ]
}
```

- [ ] **Step 1.8: Verify the workspace recognizes both packages**

```bash
bun install
bun pm ls 2>&1 | head -20
```

Expected: install resolves both workspace packages without complaint. The output of `bun pm ls` shows `@opencall/types` and `@opencall/server` as workspace members. (Note: the symlink for `@opencall/types` in `node_modules/` resolves to `packages/types/`, which has no `dist/` yet — that's fine; the actual import resolution happens after Task 2 + 3.)

- [ ] **Step 1.9: Commit**

```bash
git add package.json tsconfig.base.json packages/
git commit -m "Set up Bun workspace with packages/types and packages/server"
```

---

### Task 2: Move existing source files into the right packages

**Allocation:**

`@opencall/types` (canonical contract) gets:
- `src/envelope.ts` → `packages/types/src/envelope.ts`
- `src/errors.ts` → `packages/types/src/errors.ts` (DomainError class + domainError + protocolError constructors are all part of the contract surface)
- `src/types.ts` → `packages/types/src/types.ts` (OperationModule, RegistryEntry, RegistryResponse, OperationResult)
- New: `packages/types/src/index.ts` (barrel re-exporting everything)

`@opencall/server` (execution logic) gets:
- `src/registry.ts` → `packages/server/src/registry.ts`
- `src/jsdoc.ts` → `packages/server/src/jsdoc.ts`
- `src/validate.ts` → `packages/server/src/validate.ts`
- `src/codegen.ts` → `packages/server/src/codegen.ts`
- `src/cli/` → `packages/server/src/cli/`
- `src/index.ts` → `packages/server/src/index.ts` (rewritten to re-export server-side things AND re-export from `@opencall/types`)

`test/` directory gets allocated by which file each test exercises — but for simplicity we move all tests into `packages/server/test/` initially (the existing tests primarily exercise validation/dispatch/registry behavior), and split out a separate `packages/types/test/` only if we add net-new types-only tests in later tasks.

- [ ] **Step 2.1: Move types files**

```bash
git mv src/envelope.ts packages/types/src/envelope.ts
git mv src/errors.ts packages/types/src/errors.ts
git mv src/types.ts packages/types/src/types.ts
git status
```

Expected: three rename entries `src/{envelope,errors,types}.ts → packages/types/src/{envelope,errors,types}.ts`.

- [ ] **Step 2.2: Move server files**

```bash
git mv src/registry.ts packages/server/src/registry.ts
git mv src/jsdoc.ts packages/server/src/jsdoc.ts
git mv src/validate.ts packages/server/src/validate.ts
git mv src/codegen.ts packages/server/src/codegen.ts
git mv src/cli packages/server/src/cli
git mv src/index.ts packages/server/src/index.ts
git status
```

Expected: five rename entries plus the recursive cli rename.

- [ ] **Step 2.3: Move tests**

```bash
mkdir -p packages/server/test
git mv test/* packages/server/test/
ls test 2>&1 | head -3
```

Expected: `test/` directory empty (or no longer present). All test files now under `packages/server/test/`.

If the `test/` directory is now empty:

```bash
rmdir test
```

- [ ] **Step 2.4: Move tsconfig and bun.lock if needed**

The repo had a root `tsconfig.json` from the pre-workspace layout. Since we now have `tsconfig.base.json` plus per-package tsconfigs, the old root `tsconfig.json` is obsolete. Remove it:

```bash
git rm tsconfig.json
```

`bun.lock` lives at the workspace root and is regenerated by Task 3.

- [ ] **Step 2.5: Create `packages/types/src/index.ts` barrel**

```ts
export {
  RequestEnvelopeSchema,
  type RequestEnvelope,
  type ResponseState,
  type ResponseEnvelope,
} from "./envelope.js"

export {
  DomainError,
  domainError,
  protocolError,
} from "./errors.js"

export type {
  OperationResult,
  OperationModule,
  RegistryEntry,
  RegistryResponse,
} from "./types.js"
```

- [ ] **Step 2.6: Verify the move is committable but do NOT commit yet**

```bash
git status
```

Expected output: a long list of renames `src/* → packages/{types,server}/src/*` and the test moves. No untracked source files. The new package.json/tsconfig files from Task 1 are already committed; only the renames are pending.

If the layout looks wrong, STOP and report rather than committing. Otherwise continue to Task 3 — Task 2's commit happens at the end of Task 3 because Task 3's import-rewrite must be in the same commit as the moves to keep `main` green at every commit.

---

### Task 3: Update imports across the moved files

After Task 2, server files still `import` from relative paths like `./envelope.js` that no longer resolve (the moved files are in a different package). Server-side files must import from `@opencall/types` instead.

**Files affected:**

- `packages/server/src/registry.ts` — imports `RegistryEntry`, `RegistryResponse`, `OperationModule`, `ModuleEntry`, `ModuleMeta` etc.
- `packages/server/src/validate.ts` — imports `RequestEnvelopeSchema`, `ResponseEnvelope`, `DomainError`, `domainError`, `protocolError`, `OperationModule`, `OperationResult`
- `packages/server/src/codegen.ts` — likely imports `OperationModule`, registry types
- `packages/server/src/jsdoc.ts` — likely imports nothing from the moved files (it's a parser); verify
- `packages/server/src/cli/*.ts` — verify imports
- `packages/server/src/index.ts` — used to barrel-export everything from the flat `src/`; rewrite to barrel only server exports + `export type { ... } from "@opencall/types"` re-exports for consumers who want types via the server package

- [ ] **Step 3.1: Run the failing build to enumerate every broken import**

```bash
cd packages/server
bun install   # ensures @opencall/types workspace symlink
bun run typecheck 2>&1 | head -40
```

Expected: TypeScript errors for every relative import like `./envelope.js` or `./errors.js` or `./types.js` that no longer resolves. Capture the list.

- [ ] **Step 3.2: For each server source file, replace relative imports of moved modules with `@opencall/types`**

For `packages/server/src/validate.ts`, change:

- `import type { z } from "zod/v4";` (kept)
- `import { RequestEnvelopeSchema, type ResponseEnvelope } from "./envelope.js";` → `import { RequestEnvelopeSchema, type ResponseEnvelope } from "@opencall/types";`
- `import { protocolError, DomainError, domainError } from "./errors.js";` → `import { protocolError, DomainError, domainError } from "@opencall/types";`
- `import type { OperationModule, OperationResult } from "./types.js";` → `import type { OperationModule, OperationResult } from "@opencall/types";`

For `packages/server/src/registry.ts`, change every `from "./types.js"` and `from "./envelope.js"` and `from "./errors.js"` to `from "@opencall/types"`. Preserve relative imports of files that DID move with registry (like `./jsdoc.js` if registry imports the JSDoc parser).

For `packages/server/src/codegen.ts`, similar treatment.

For `packages/server/src/jsdoc.ts`, audit: if it had imports from `./types.js` or `./envelope.js`, retarget; otherwise leave alone.

For `packages/server/src/cli/*.ts`, audit and retarget.

For `packages/server/src/index.ts`, rewrite as:

```ts
// Re-export the contract surface for convenience (consumers of the server
// package usually want envelope types in scope without a separate install
// of @opencall/types).
export {
  RequestEnvelopeSchema,
  type RequestEnvelope,
  type ResponseState,
  type ResponseEnvelope,
  DomainError,
  domainError,
  protocolError,
  type OperationResult,
  type OperationModule,
  type RegistryEntry,
  type RegistryResponse,
} from "@opencall/types"

// Server-only surface.
export { parseJSDoc } from "./jsdoc.js"

export {
  buildRegistry,
  buildRegistryFromModules,
  type BuildRegistryOptions,
  type BuildRegistryResult,
  type RuntimeAdapters,
  type ModuleEntry,
  type ModuleMeta,
} from "./registry.js"

export {
  generateOpsModule,
  type GenerateOpsOptions,
} from "./codegen.js"

export {
  validateEnvelope,
  validateArgs,
  checkSunset,
  formatResponse,
  safeHandlerCall,
  type DispatchResult,
} from "./validate.js"
```

Note that the existing `src/index.ts` may have a slightly different shape; preserve the existing exports plus the re-exports from `@opencall/types`.

- [ ] **Step 3.3: Update test imports**

Tests in `packages/server/test/` likely import from relative paths like `../src/envelope` or from the package itself. Update them to import from `@opencall/types` or `@opencall/server` as appropriate.

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
grep -rn "from \"\\.\\./src/" packages/server/test/ 2>/dev/null | head -20
grep -rn "from \"\\.\\./\\.\\./src/" packages/server/test/ 2>/dev/null | head -20
```

For each hit, update the import path. Use `@opencall/types` for envelope/errors/types, relative `../src/...` for things that stay in `packages/server/src/`.

- [ ] **Step 3.4: Build and typecheck both packages**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
bun --filter '@opencall/types' run build
bun --filter '@opencall/server' run typecheck
```

Expected: both succeed. Types builds first because server depends on types.

If errors remain, fix and re-run until both pass.

- [ ] **Step 3.5: Run the full test suite**

```bash
bun test
```

Expected: all baseline tests pass. Test count matches Step P4. If a test file has been left out of the move, fix it. If a test legitimately fails because of a behavior change introduced by the restructure (it shouldn't — Tasks 1-3 are pure restructure), STOP and report.

- [ ] **Step 3.6: Commit Tasks 2 + 3 together**

```bash
git status
git add -A
git commit -m "Restructure: extract @opencall/types from flat src/, retarget server imports"
```

The commit contains: all the renames from Task 2, the new `packages/types/src/index.ts` barrel, the rewritten `packages/server/src/index.ts`, and import updates across server source and test files. This is one logical change ("split into two packages") even though it spans ~15 file moves and ~10 import updates.

---

### Task 4: Add `meta` field to `ResponseEnvelope` (requested_changes #1)

**Files:**
- Modify: `packages/types/src/envelope.ts`
- Add or modify: a test (locate the existing envelope tests; if none, create `packages/types/test/envelope.test.ts`)

The `meta` field is optional metadata that any layer can attach to a response (commonly used to inject service health/degradation status without requiring operation handlers to know about it). Per `requested_changes.md`, it is `Record<string, unknown>`.

- [ ] **Step 4.1: Locate any existing envelope tests**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
grep -rln "ResponseEnvelope" packages/server/test/ packages/types/test/ 2>/dev/null
```

- [ ] **Step 4.2: Write a failing test**

Add to `packages/server/test/envelope.test.ts` (or create `packages/types/test/envelope.test.ts` if no envelope test file exists). Pick whichever location matches the rest of the test suite's organization; if uncertain, put it in `packages/server/test/` since that's where current tests live.

```ts
import { test, expect } from "bun:test"
import type { ResponseEnvelope } from "@opencall/types"

test("ResponseEnvelope accepts an optional meta record", () => {
  const env: ResponseEnvelope = {
    requestId: "00000000-0000-0000-0000-000000000000",
    state: "complete",
    result: { ok: true },
    meta: { serviceStatus: "degraded", region: "ap-southeast-2" },
  }
  expect(env.meta?.serviceStatus).toBe("degraded")
})
```

- [ ] **Step 4.3: Run the test and verify it fails**

```bash
bun test packages/server/test/envelope.test.ts 2>&1 | tail -10
```

Expected: TypeScript compile error stating `meta` is not a known property of `ResponseEnvelope`.

- [ ] **Step 4.4: Add the field to `ResponseEnvelope` in `packages/types/src/envelope.ts`**

Find the existing `ResponseEnvelope` interface and add `meta?: Record<string, unknown>` near `retryAfterMs` and `expiresAt`:

```ts
export interface ResponseEnvelope {
  requestId: string
  sessionId?: string
  state: ResponseState
  result?: unknown
  error?: {
    code: string
    message: string
    cause?: unknown
  }
  location?: {
    uri: string
    auth?: {
      credentialType: string
      credential: string
      expiresAt?: number
    }
  }
  retryAfterMs?: number
  expiresAt?: number
  meta?: Record<string, unknown>
}
```

- [ ] **Step 4.5: Rebuild types and re-run the test**

```bash
bun --filter '@opencall/types' run build
bun test packages/server/test/envelope.test.ts 2>&1 | tail -10
```

Expected: test passes.

- [ ] **Step 4.6: Run the full test suite to confirm nothing regressed**

```bash
bun test
```

Expected: all tests pass; the new test is included in the count.

- [ ] **Step 4.7: Commit**

```bash
git add packages/types/src/envelope.ts packages/server/test/envelope.test.ts
git commit -m "types: add ResponseEnvelope.meta for service-level metadata (req-changes #1)"
```

---

### Task 5: Add `BackendUnavailableError` class (requested_changes #3)

**Files:**
- Modify: `packages/types/src/errors.ts`
- Modify: `packages/types/src/index.ts` (re-export)
- Add: a test in `packages/server/test/errors.test.ts` (or wherever error tests live)

The class has `service: string`, `retriable: boolean` (always true), and a `cause` argument. It's part of the contract surface (server throws it; the dispatcher in Task 7 catches it; consumers can `instanceof`-check it).

- [ ] **Step 5.1: Locate existing error tests**

```bash
grep -rln "DomainError\|domainError" packages/server/test/ 2>/dev/null
```

- [ ] **Step 5.2: Write a failing test**

Append to the existing errors test file (or create `packages/server/test/errors.test.ts`):

```ts
import { test, expect } from "bun:test"
import { BackendUnavailableError } from "@opencall/types"

test("BackendUnavailableError carries service and retriable", () => {
  const err = new BackendUnavailableError("postgres", "connection refused")
  expect(err).toBeInstanceOf(Error)
  expect(err).toBeInstanceOf(BackendUnavailableError)
  expect(err.name).toBe("BackendUnavailableError")
  expect(err.service).toBe("postgres")
  expect(err.retriable).toBe(true)
  expect(err.message).toBe("connection refused")
})

test("BackendUnavailableError preserves cause", () => {
  const cause = new Error("ECONNREFUSED 127.0.0.1:5432")
  const err = new BackendUnavailableError("postgres", "down", cause)
  expect(err.cause).toBe(cause)
})
```

- [ ] **Step 5.3: Run the test and verify it fails**

```bash
bun test packages/server/test/errors.test.ts 2>&1 | tail -10
```

Expected: import error for `BackendUnavailableError` from `@opencall/types`.

- [ ] **Step 5.4: Add the class to `packages/types/src/errors.ts`**

Append to the file:

```ts
/** Throwable when a backend dependency is unreachable. The dispatcher converts this into HTTP 503 with BACKEND_UNAVAILABLE. */
export class BackendUnavailableError extends Error {
  public readonly service: string
  public readonly retriable: boolean

  constructor(service: string, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined)
    this.name = "BackendUnavailableError"
    this.service = service
    this.retriable = true
  }
}
```

- [ ] **Step 5.5: Re-export from `packages/types/src/index.ts`**

Update the errors re-export:

```ts
export {
  DomainError,
  BackendUnavailableError,
  domainError,
  protocolError,
} from "./errors.js"
```

Update `packages/server/src/index.ts` similarly so consumers of `@opencall/server` also see `BackendUnavailableError`.

- [ ] **Step 5.6: Rebuild and run tests**

```bash
bun --filter '@opencall/types' run build
bun test packages/server/test/errors.test.ts 2>&1 | tail -10
bun test
```

Expected: error tests pass; full suite still green.

- [ ] **Step 5.7: Commit**

```bash
git add packages/types/src/errors.ts packages/types/src/index.ts packages/server/src/index.ts packages/server/test/errors.test.ts
git commit -m "types: add BackendUnavailableError class (req-changes #3)"
```

---

### Task 6: Add `isDbConnectionError` utility (requested_changes #4)

**Files:**
- Add: `packages/server/src/db-errors.ts` (new file — runtime detection logic, server-side only)
- Modify: `packages/server/src/index.ts` (re-export)
- Add: tests in `packages/server/test/db-errors.test.ts`

Detects database connection failures (postgres.js error patterns, Neon/Hyperdrive idle terminations, PostgreSQL admin shutdown codes) so the dispatcher can convert them to BACKEND_UNAVAILABLE responses instead of generic 500s.

This logic is server-side only — clients don't detect db errors. It belongs in `@opencall/server`, not `@opencall/types`.

- [ ] **Step 6.1: Write the failing test**

Create `packages/server/test/db-errors.test.ts`:

```ts
import { test, expect } from "bun:test"
import { isDbConnectionError } from "@opencall/server"

test("recognizes ECONNREFUSED", () => {
  expect(isDbConnectionError(new Error("connect ECONNREFUSED 127.0.0.1:5432"))).toBe(true)
})

test("recognizes connection terminated", () => {
  expect(isDbConnectionError(new Error("Connection terminated unexpectedly"))).toBe(true)
})

test("recognizes connection ended", () => {
  expect(isDbConnectionError(new Error("Connection ended"))).toBe(true)
})

test("recognizes connect timeout", () => {
  expect(isDbConnectionError(new Error("Timeout while trying to connect"))).toBe(true)
})

test("recognizes too many connections", () => {
  expect(isDbConnectionError(new Error("sorry, too many connections"))).toBe(true)
})

test("recognizes PostgreSQL admin shutdown codes", () => {
  for (const code of ["57P01", "57P02", "57P03"]) {
    const err = new Error("server closing")
    Object.assign(err, { code })
    expect(isDbConnectionError(err)).toBe(true)
  }
})

test("rejects unrelated errors", () => {
  expect(isDbConnectionError(new Error("syntax error at or near"))).toBe(false)
  expect(isDbConnectionError(new Error("permission denied"))).toBe(false)
  expect(isDbConnectionError("not an error")).toBe(false)
  expect(isDbConnectionError(null)).toBe(false)
  expect(isDbConnectionError(undefined)).toBe(false)
})
```

- [ ] **Step 6.2: Run the test, verify it fails**

```bash
bun test packages/server/test/db-errors.test.ts 2>&1 | tail -10
```

Expected: import error for `isDbConnectionError`.

- [ ] **Step 6.3: Implement in `packages/server/src/db-errors.ts`**

```ts
/**
 * Heuristic detection of database connection failures.
 *
 * Recognises common message patterns from the `postgres` driver, the
 * Neon and Hyperdrive runtime errors that surface when a serverless
 * connection times out or is closed, and PostgreSQL admin-shutdown
 * SQLSTATE codes. Returns true for errors that should be surfaced as
 * BACKEND_UNAVAILABLE rather than INTERNAL_ERROR.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false

  const msg = err.message.toLowerCase()
  if (msg.includes("connection refused") || msg.includes("econnrefused")) return true
  if (msg.includes("connection terminated") || msg.includes("connection ended")) return true
  if (msg.includes("timeout") && msg.includes("connect")) return true
  if (msg.includes("too many connections")) return true

  const code = (err as { code?: unknown }).code
  if (typeof code === "string") {
    // PostgreSQL admin shutdown / cannot-connect-now class codes
    if (code === "57P01" || code === "57P02" || code === "57P03") return true
  }

  return false
}
```

- [ ] **Step 6.4: Re-export from `packages/server/src/index.ts`**

Add:

```ts
export { isDbConnectionError } from "./db-errors.js"
```

- [ ] **Step 6.5: Rebuild and run tests**

```bash
bun --filter '@opencall/server' run build
bun test packages/server/test/db-errors.test.ts 2>&1 | tail -10
bun test
```

Expected: 7/7 db-errors tests pass; full suite green.

- [ ] **Step 6.6: Commit**

```bash
git add packages/server/src/db-errors.ts packages/server/src/index.ts packages/server/test/db-errors.test.ts
git commit -m "server: add isDbConnectionError utility (req-changes #4)"
```

---

### Task 7: Update `safeHandlerCall` to handle `BackendUnavailableError` and DB connection errors (requested_changes #5)

**Files:**
- Modify: `packages/server/src/validate.ts`
- Modify: existing tests for `safeHandlerCall` (locate them first); add new tests for BackendUnavailableError + isDbConnectionError paths

`safeHandlerCall` currently catches `DomainError` (HTTP 200, state=error) and any other Error (HTTP 500, INTERNAL_ERROR). Add two new paths between those: BackendUnavailableError → HTTP 503 with BACKEND_UNAVAILABLE error code, and isDbConnectionError → same shape but with `service: "postgres"`.

- [ ] **Step 7.1: Locate existing safeHandlerCall tests**

```bash
grep -rln "safeHandlerCall" packages/server/test/ 2>/dev/null
```

- [ ] **Step 7.2: Write failing tests**

Append to the existing safeHandlerCall test file (or `packages/server/test/dispatcher.test.ts` if a different name applies):

```ts
import { test, expect } from "bun:test"
import { BackendUnavailableError } from "@opencall/types"
import { safeHandlerCall } from "@opencall/server"

test("safeHandlerCall converts BackendUnavailableError into HTTP 503", async () => {
  const handler = async () => {
    throw new BackendUnavailableError("oauth-server", "down for maintenance")
  }
  const res = await safeHandlerCall(handler, [], "00000000-0000-0000-0000-000000000000")
  expect(res.status).toBe(503)
  expect(res.body.state).toBe("error")
  expect(res.body.error?.code).toBe("BACKEND_UNAVAILABLE")
  expect(res.body.error?.message).toBe("down for maintenance")
  expect((res.body.error?.cause as { service: string }).service).toBe("oauth-server")
  expect(res.body.retryAfterMs).toBe(60_000)
})

test("safeHandlerCall converts a postgres connection error into HTTP 503", async () => {
  const handler = async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432")
  }
  const res = await safeHandlerCall(handler, [], "00000000-0000-0000-0000-000000000000")
  expect(res.status).toBe(503)
  expect(res.body.error?.code).toBe("BACKEND_UNAVAILABLE")
  expect((res.body.error?.cause as { service: string }).service).toBe("postgres")
  expect(res.body.retryAfterMs).toBe(60_000)
})
```

- [ ] **Step 7.3: Run tests, verify they fail**

Expected: HTTP 500 returned where 503 is expected.

- [ ] **Step 7.4: Update `safeHandlerCall` in `packages/server/src/validate.ts`**

Find the existing `safeHandlerCall` function. Insert the two new catch branches between the `DomainError` branch and the generic-Error branch:

```ts
import { BackendUnavailableError, DomainError, domainError } from "@opencall/types"
import { isDbConnectionError } from "./db-errors.js"

// ... inside safeHandlerCall, after the DomainError branch:

if (err instanceof BackendUnavailableError) {
  return {
    status: 503,
    body: {
      requestId,
      ...(sessionId !== undefined && { sessionId }),
      state: "error",
      error: {
        code: "BACKEND_UNAVAILABLE",
        message: err.message,
        cause: { service: err.service, retriable: err.retriable },
      },
      retryAfterMs: 60_000,
    },
  }
}

if (isDbConnectionError(err)) {
  return {
    status: 503,
    body: {
      requestId,
      ...(sessionId !== undefined && { sessionId }),
      state: "error",
      error: {
        code: "BACKEND_UNAVAILABLE",
        message: "Database temporarily unavailable",
        cause: { service: "postgres", retriable: true },
      },
      retryAfterMs: 60_000,
    },
  }
}
```

Preserve the existing imports of `DomainError` and `domainError` (now from `@opencall/types`), and the existing generic-Error branch.

- [ ] **Step 7.5: Rebuild server, run new tests**

```bash
bun --filter '@opencall/server' run build
bun test packages/server/test/  # the tests for both backends
```

Expected: 2/2 new tests pass; existing tests still pass.

- [ ] **Step 7.6: Commit**

```bash
git add packages/server/src/validate.ts packages/server/test/
git commit -m "server: safeHandlerCall returns 503 on BackendUnavailableError and DB connection errors (req-changes #5)"
```

---

### Task 8: Add `requiresAuth` field to `OperationModule` (requested_changes #6)

**Files:**
- Modify: `packages/types/src/types.ts`
- Add: a test in `packages/server/test/types.test.ts` (or appropriate location)

A declarative flag on operation modules so the dispatcher can enforce auth before calling the handler. Type-level change; no runtime behavior added in this task.

- [ ] **Step 8.1: Write a type test**

Append to or create `packages/server/test/types.test.ts`:

```ts
import { test, expect } from "bun:test"
import { z } from "zod/v4"
import type { OperationModule } from "@opencall/types"

test("OperationModule allows requiresAuth: true", () => {
  const op: OperationModule = {
    args: z.object({}),
    result: z.object({}),
    requiresAuth: true,
    handler: async () => ({ state: "complete", result: {} }),
  }
  expect(op.requiresAuth).toBe(true)
})

test("OperationModule allows requiresAuth omitted (undefined)", () => {
  const op: OperationModule = {
    args: z.object({}),
    result: z.object({}),
    handler: async () => ({ state: "complete", result: {} }),
  }
  expect(op.requiresAuth).toBeUndefined()
})
```

- [ ] **Step 8.2: Run tests, verify failure**

Expected: TypeScript error stating `requiresAuth` is not a property of `OperationModule`.

- [ ] **Step 8.3: Add the field to `OperationModule` in `packages/types/src/types.ts`**

```ts
export interface OperationModule {
  args: z.ZodType
  result: z.ZodType
  handler: (args: unknown, ...rest: unknown[]) => Promise<OperationResult>
  /** If true, operation requires authentication; the dispatcher enforces this before calling handler. */
  requiresAuth?: boolean
  sunset?: string
  replacement?: string
}
```

- [ ] **Step 8.4: Rebuild and re-test**

```bash
bun --filter '@opencall/types' run build
bun test packages/server/test/types.test.ts
bun test
```

Expected: 2/2 new tests pass; full suite green.

- [ ] **Step 8.5: Commit**

```bash
git add packages/types/src/types.ts packages/server/test/types.test.ts
git commit -m "types: add OperationModule.requiresAuth (req-changes #6)"
```

---

### Task 9: README and CHANGELOG for each package

**Files:**
- Create: `packages/types/README.md`
- Create: `packages/types/CHANGELOG.md`
- Create: `packages/server/README.md`
- Create: `packages/server/CHANGELOG.md`
- Create: `packages/types/LICENSE` (copy from repo root)
- Create: `packages/server/LICENSE` (copy from repo root)
- Modify: repo root `README.md` (overview pointing at the two packages and the canonical site)

Each package README is what npm renders on its package page. It must stand alone — readers may land there with no knowledge of the rest of the monorepo or spec repo. Both READMEs lead with a banner pointing at the canonical docs.

- [ ] **Step 9.1: Create `packages/types/README.md`**

```markdown
# @opencall/types

> **Canonical docs:** [https://opencall-api.com/spec](https://opencall-api.com/spec). The OpenCALL specification, raw markdown for agents, and SDK guides live at the canonical site. GitHub may block non-Copilot bots.

The canonical Zod schemas and TypeScript types for the OpenCALL request/response envelope, operation registry, and error contract.

`@opencall/types` is the source of truth for the wire-level OpenCALL contract in TypeScript. Both [`@opencall/server`](https://www.npmjs.com/package/@opencall/server) and `@opencall/client` (forthcoming) depend on it.

## Install

\`\`\`bash
npm install @opencall/types
# or
bun add @opencall/types
\`\`\`

## Surface

- `RequestEnvelopeSchema` — Zod schema for the body of `POST /call`.
- `RequestEnvelope` — TypeScript type, `z.infer<typeof RequestEnvelopeSchema>`.
- `ResponseEnvelope`, `ResponseState` — canonical response envelope shape.
- `OperationModule`, `OperationResult` — the contract that operation handlers implement.
- `RegistryEntry`, `RegistryResponse` — the shape served at `/.well-known/ops`.
- `DomainError`, `BackendUnavailableError` — throwable error classes.
- `domainError`, `protocolError` — response-shape constructors.

## Quick example

\`\`\`ts
import { RequestEnvelopeSchema, type RequestEnvelope } from "@opencall/types"

const parse = RequestEnvelopeSchema.safeParse(rawBody)
if (!parse.success) {
  // ... return 400
}
const envelope: RequestEnvelope = parse.data
\`\`\`

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. See the canonical site for spec history and migration notes.

## License

Apache-2.0
```

- [ ] **Step 9.2: Create `packages/types/CHANGELOG.md`**

```markdown
# Changelog

## 0.1.0 — 2026-04-27

Initial release. Extracted from the previously-private `@opencall/ts-tools` codebase.

- `RequestEnvelopeSchema` (Zod) and `RequestEnvelope` (`z.infer`) with `op`, `args`, `ctx` (including `requestId`, `sessionId`, `parentId`, `idempotencyKey`, `timeoutMs`, `locale`, `traceparent`), `auth`, and `media`.
- `ResponseEnvelope` with `state`, `result`, `error`, `location`, `retryAfterMs`, `expiresAt`, and `meta`.
- `OperationModule` (with `requiresAuth`), `OperationResult`, `RegistryEntry`, `RegistryResponse`.
- `DomainError`, `BackendUnavailableError` classes; `domainError`, `protocolError` constructors.
```

- [ ] **Step 9.3: Create `packages/server/README.md`**

```markdown
# @opencall/server

> **Canonical docs:** [https://opencall-api.com/spec](https://opencall-api.com/spec). The OpenCALL specification, raw markdown for agents, and SDK guides live at the canonical site. GitHub may block non-Copilot bots.

Server-side tooling for implementing OpenCALL APIs in TypeScript. Provides the operation registry builder, JSDoc-driven operation discovery, dispatcher helpers, runtime payload validation, and a code generator.

Built on [`@opencall/types`](https://www.npmjs.com/package/@opencall/types) — the canonical Zod schemas and types are imported from there, not redefined.

## Install

\`\`\`bash
npm install @opencall/server @opencall/types
# or
bun add @opencall/server @opencall/types
\`\`\`

## Surface

- `buildRegistry`, `buildRegistryFromModules` — produces the `/.well-known/ops` response from operation definitions. Use the file-scan version on Node; use `buildRegistryFromModules` on Cloudflare Workers and other edge runtimes that lack `node:fs`.
- `parseJSDoc` — extracts operation metadata from JSDoc comments on handler exports.
- `validateEnvelope`, `validateArgs`, `safeHandlerCall`, `formatResponse`, `checkSunset` — dispatcher building blocks.
- `generateOpsModule` — codegen that emits a TypeScript registry module from a directory of operation files.
- `isDbConnectionError` — heuristic detection of DB connection failures, used to surface BACKEND_UNAVAILABLE.
- All `@opencall/types` exports are re-exported for convenience (no need to `import { RequestEnvelope } from "@opencall/types"` separately).

## Quick example

\`\`\`ts
import { buildRegistry, validateEnvelope, safeHandlerCall, RegistryResponse } from "@opencall/server"

const { registry } = await buildRegistry({ operationsDir: "./src/operations" })

// Inside your HTTP handler:
const validation = validateEnvelope(rawBody)
if (!validation.ok) {
  // return validation.error
}
const operation = registry.byOp(validation.envelope.op)
const result = await safeHandlerCall(operation.handler, [validation.envelope.args], requestId)
\`\`\`

## OpenCALL spec compatibility

This package targets OpenCALL spec `callVersion: 2026-02-10`. The `@opencall/types` peer dependency declares the same.

## License

Apache-2.0
```

- [ ] **Step 9.4: Create `packages/server/CHANGELOG.md`**

```markdown
# Changelog

## 0.2.0 — 2026-04-27

First public release on npm. Extracted from the previously-private `@opencall/ts-tools` codebase, retargeted onto `@opencall/types` for canonical schemas.

### Added
- `BackendUnavailableError` is re-exported from `@opencall/types`.
- `isDbConnectionError(err)` heuristic for postgres connection failures.
- `safeHandlerCall` now returns HTTP 503 with `BACKEND_UNAVAILABLE` for `BackendUnavailableError` throws and for errors recognised by `isDbConnectionError`.
- `OperationModule.requiresAuth` field is honored.
- All `@opencall/types` exports are re-exported (consumers can import envelope types from this package directly).

### Changed
- Imports from `./envelope`, `./errors`, `./types` are now `from "@opencall/types"`.
- Package renamed from the unpublished `@opencall/ts-tools` to `@opencall/server`.

## 0.1.0 — 2026-02-20 (private; never published)

Original local release as `@opencall/ts-tools`.
```

- [ ] **Step 9.5: Copy LICENSE files**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
cp LICENSE packages/types/LICENSE
cp LICENSE packages/server/LICENSE
```

- [ ] **Step 9.6: Update repo root `README.md`**

The existing root README is the README for the never-published flat package. Rewrite it as a brief monorepo overview:

```markdown
# OpenCALL TypeScript tooling

Monorepo for the official `@opencall` TypeScript packages. Canonical docs at [https://opencall-api.com/spec](https://opencall-api.com/spec).

## Packages

| Package | Description |
| --- | --- |
| [`@opencall/types`](packages/types/) | Canonical Zod schemas and types — the source of truth for the OpenCALL envelope, registry, and error contract. |
| [`@opencall/server`](packages/server/) | Server-side tooling: registry builder, JSDoc parser, dispatcher helpers, validators, codegen. |
| `@opencall/client` (forthcoming) | The thin OpenCALL client + codegen CLI. Phase 1b. |

## Development

This repo is a Bun workspace.

\`\`\`bash
bun install
bun test
bun --filter '*' run build
\`\`\`

## License

Apache-2.0
```

- [ ] **Step 9.7: Commit**

```bash
git add packages/types/README.md packages/types/CHANGELOG.md packages/types/LICENSE
git add packages/server/README.md packages/server/CHANGELOG.md packages/server/LICENSE
git add README.md
git commit -m "docs: per-package READMEs, CHANGELOGs, and monorepo root overview"
```

---

### Task 10: GitHub Actions release workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/ci.yml` (PR validation: install + typecheck + test)

The release workflow triggers on tag pushes matching `types-v*.*.*` and `server-v*.*.*`. It uses npm OIDC trusted publishing — no NPM_TOKEN secret. Each tag publishes exactly one package.

- [ ] **Step 10.1: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags:
      - "types-v*.*.*"
      - "server-v*.*.*"
  workflow_dispatch:
    inputs:
      package:
        description: "Workspace package to publish (types or server)"
        required: true
        type: choice
        options:
          - types
          - server

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Setup Node (for npm provenance)
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          registry-url: "https://registry.npmjs.org"

      - name: Determine package
        id: pkg
        run: |
          set -euo pipefail
          if [ -n "${{ inputs.package }}" ]; then
            echo "name=${{ inputs.package }}" >> "$GITHUB_OUTPUT"
          else
            tag="${GITHUB_REF##refs/tags/}"
            case "$tag" in
              types-v*) echo "name=types" >> "$GITHUB_OUTPUT" ;;
              server-v*) echo "name=server" >> "$GITHUB_OUTPUT" ;;
              *) echo "Unrecognised tag $tag"; exit 1 ;;
            esac
          fi

      - name: Install
        run: bun install --frozen-lockfile

      - name: Test
        run: bun test

      - name: Build all workspaces
        run: bun --filter '*' run build

      - name: Publish
        working-directory: packages/${{ steps.pkg.outputs.name }}
        run: npm publish --provenance --access public
```

- [ ] **Step 10.2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install --frozen-lockfile
      - run: bun --filter '*' run typecheck
      - run: bun test
      - run: bun --filter '*' run build
```

- [ ] **Step 10.3: Validate YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); yaml.safe_load(open('.github/workflows/ci.yml'))" && echo "yaml ok"
```

- [ ] **Step 10.4: Commit**

```bash
git add .github/workflows/release.yml .github/workflows/ci.yml
git commit -m "ci: add release workflow with OIDC provenance + PR validation workflow"
```

---

### Task 11: Configure npm trusted publishers (manual)

**Files:** none (manual npmjs.com action).

For each of the two packages, npm needs to know the GitHub Actions workflow it trusts. This is configured per package in the npm dashboard.

- [ ] **Step 11.1: Push the branch so the workflow file exists upstream**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
git push -u origin phase-1a-types-and-server
```

The npm trusted publisher form requires the workflow file path to exist; pushing makes it visible.

- [ ] **Step 11.2: Configure trusted publishing for `@opencall/types`**

Manual step. Navigate to https://www.npmjs.com/settings/opencall/packages and click *Add package* (or, after first publish, the package's settings page). Configure trusted publisher:

- Provider: GitHub Actions
- Organization or user: `opencall-api`
- Repository: `ts-tools`
- Workflow filename: `release.yml`
- Environment: leave blank

Note: npm requires the package to exist before trusted publishing can be configured. There's a chicken-and-egg here: the FIRST publish needs to be done with a classic `NPM_TOKEN` (manual `npm login` from a laptop), and trusted publishing is configured AFTER that first publish to cover subsequent releases. Step 13 walks through this carefully.

- [ ] **Step 11.3: Configure trusted publishing for `@opencall/server`**

Same form, package name `@opencall/server`.

- [ ] **Step 11.4: No commit for this task**

---

### Task 12: First publish — manual (one-time bootstrap)

**Files:** none (publishes to npm).

Because trusted publishing requires the package to already exist, the first publish for each package is done manually with `npm login`. Subsequent releases use the workflow.

- [ ] **Step 12.1: Sanity check the build**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
bun install --frozen-lockfile
bun --filter '*' run typecheck
bun test
bun --filter '*' run build
```

Expected: typecheck, tests, and builds all green.

- [ ] **Step 12.2: Inspect what each package would publish**

```bash
cd packages/types && npm pack --dry-run 2>&1 | head -40 && cd ../..
cd packages/server && npm pack --dry-run 2>&1 | head -40 && cd ../..
```

Review each tarball's file list. Expected contents per package:
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `src/**/*.ts`
- `dist/**/*.{js,d.ts,d.ts.map}`

Should NOT contain: `test/`, `node_modules/`, `tsconfig.json`, source maps (per tsconfig), `.tsbuildinfo`. If any of those appear, fix the `files` array in the package's `package.json` and try again.

- [ ] **Step 12.3: npm login**

```bash
npm login
npm whoami
```

Expected: authenticated as the user (must be a member of the `@opencall` org with publish rights).

- [ ] **Step 12.4: Publish `@opencall/types@0.1.0` first**

```bash
cd packages/types
npm publish --access public
```

Note: trusted publishing isn't configured yet, so this first publish does NOT include provenance attestation. That's expected for the bootstrap. Subsequent releases via the workflow will have provenance.

Verify:
```bash
npm view @opencall/types
```
Expected: shows the published 0.1.0 version with the right metadata.

- [ ] **Step 12.5: Publish `@opencall/server@0.2.0` second**

```bash
cd ../server
npm publish --access public
```

Note: server's `dependencies."@opencall/types"` is `"workspace:^0.1.0"`. Bun rewrites `workspace:` protocol references to actual version numbers at publish time, so the published `@opencall/server@0.2.0` will declare `"@opencall/types": "^0.1.0"` (a normal semver range that resolves on `npm install`).

Verify:
```bash
npm view @opencall/server
```

- [ ] **Step 12.6: End-to-end install test**

In a fresh scratch directory:
```bash
mkdir /tmp/opencall-install-test && cd /tmp/opencall-install-test
npm init -y
npm install @opencall/server
node -e "console.log(Object.keys(require('@opencall/server')))"
```

Expected: a list of exports including `RequestEnvelopeSchema`, `DomainError`, `buildRegistry`, `safeHandlerCall`, etc. If imports fail or the runtime can't resolve `@opencall/types`, debug before proceeding.

- [ ] **Step 12.7: Configure trusted publishing on both packages (manual)**

Follow Task 11 steps now that the packages exist. Add the trusted publisher record on npmjs.com for each package.

- [ ] **Step 12.8: No commit for this task**

The first publish doesn't change any tracked files. The next task tags the release in git.

---

### Task 13: Tag the release and verify CI

**Files:** none (git tags only).

- [ ] **Step 13.1: Tag both packages**

```bash
cd /mnt/dev/call-api/.worktrees/phase-1a-ts-tools
git tag types-v0.1.0
git tag server-v0.2.0
git push --tags
```

- [ ] **Step 13.2: Confirm tag pushes did not trigger the release workflow re-publishing**

The release workflow runs on tag push; for the FIRST publish we already published manually, so the workflow run will succeed (idempotent — `npm publish` of an already-published version errors but the manual publish already completed). Inspect the runs:

```bash
gh run list --repo opencall-api/ts-tools --limit 5
```

If a release workflow run failed because the version is already published, that's expected. The next release (v0.1.1, v0.2.1, etc.) will use the workflow as the publish path, and trusted publishing now in place will provide provenance.

- [ ] **Step 13.3: Open a PR for the branch (so review and merge happen via PR)**

```bash
gh pr create --repo opencall-api/ts-tools --base main --head phase-1a-types-and-server \
  --title "Phase 1a: extract @opencall/types, ship server@0.2.0" \
  --body "Implements Phase 1a of the multi-language tooling strategy. Splits the flat tooling/typescript layout into a Bun workspace with @opencall/types (canonical Zod schemas + types) and @opencall/server (registry, dispatcher, validators). Resolves the 5 outstanding requested_changes.md items (meta on ResponseEnvelope, BackendUnavailableError, isDbConnectionError, safeHandlerCall HTTP 503 paths, OperationModule.requiresAuth). Items 2 (auth/timeoutMs) and 7 (buildRegistryFromModules) were already in the codebase. Both packages published manually as the bootstrap; subsequent releases via OIDC trusted publishing in the release workflow."
```

- [ ] **Step 13.4: No commit for this task**

---

## Done When

- [ ] `bun test` passes from the workspace root with the new tests added (envelope.meta, BackendUnavailableError, isDbConnectionError, safeHandlerCall 503 paths, OperationModule.requiresAuth) plus the existing baseline.
- [ ] `bun --filter '*' run build` produces `packages/types/dist/` and `packages/server/dist/` cleanly.
- [ ] `npm view @opencall/types` shows `0.1.0` published.
- [ ] `npm view @opencall/server` shows `0.2.0` published with a transitive dependency on `@opencall/types@^0.1.0`.
- [ ] `npm install @opencall/server` in a scratch project resolves both packages and `require('@opencall/server')` returns the expected exports.
- [ ] Trusted publisher configured for both packages on npmjs.com.
- [ ] Tags `types-v0.1.0` and `server-v0.2.0` exist in `opencall-api/ts-tools` and are visible on the GitHub Releases page (or via `gh release list` once a release entry is created).
- [ ] Phase 1a PR open against `opencall-api/ts-tools:main`.

## Out of Scope (deferred to follow-up plans)

- `@opencall/client@0.1.0` — Phase 1b. Net-new package; depends on `@opencall/types` from this phase.
- Promotion of `@opencall/server` to `1.0.0` — happens when the package API stabilises; not in this phase.
- Branch protection on `opencall-api/ts-tools:main` — folded together with the spec repo's branch protection (deferred Phase 0 Task 14) for a future cleanup.
- Releasing `@opencall/types` and `@opencall/server` together via a coordinated tooling (e.g., changesets, release-please). For now, manual tag pushes per package are fine; revisit when there are more than two packages or contributor cadence picks up.
- Migrating `tests/api/typescript/` (the reference TS server in the spec repo) onto `@opencall/server` — happens after Phase 1a ships, plausibly part of Phase 1b (since the reference server can also exercise the client).
