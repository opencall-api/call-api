# OpenCALL Multi-Language Tooling & Publishing Strategy

**Date:** 2026-04-27
**Status:** Draft — awaiting user review
**Scope:** Public release of the OpenCALL spec repo, publication of `@opencall` packages to npm, and a phased plan for first-class server/client SDKs in Python, Go, and Java.

---

## 1. Goals & Non-Goals

### Goals

1. [ ] Make the OpenCALL spec repo a true public reference, not a private sandbox.
2. [x] Claim and operate the `@opencall` org on npm, with provenance-attested releases.
3. [ ] Ship `@opencall/server` (server toolkit) and `@opencall/client` (client + codegen) as the canonical TypeScript packages.
4. [ ] Extend the same server/client split to Python, Go, and Java with idiomatic packaging in each registry.
5. [ ] Anchor every SDK against the existing language-agnostic test suite plus a new SDK-level conformance suite.

### Non-Goals

- Rust, C#, Ruby, Kotlin, Swift, PHP, Elixir, or any other language not explicitly named. Add only when an integrator asks.
- A unified meta-CLI across languages. Each ecosystem keeps its own conventions.
- Synchronized version numbers across languages or against the spec calendar version. Each tool package follows its own SemVer; spec compatibility is declared via metadata.
- Replacing `tests/api/{lang}/` reference servers wholesale. They get refactored to use the SDKs once those exist; they don't become the SDKs themselves.

---

## 2. Architectural Decisions

### 2.1 Two packages per language: server and client

| Concern             | Server package                                                                                                      | Client package                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Audience            | Teams implementing OpenCALL APIs                                                                                    | Teams calling OpenCALL APIs (apps, agents, integrations)                                        |
| Surface             | Envelope types, error classes, registry builder, dispatcher helpers, language-native annotation parsing, validation | One `call()` function, codegen reading `/.well-known/ops`, response/state handling, type output |
| Runtime dependency? | Yes — runs in the API process                                                                                       | Optional at runtime (codegen output is freestanding); useful as a dev dependency                |

The client is intentionally trivial — a single function that wraps an envelope and POSTs it (see [client.md](../../../client.md)). The package's value is the codegen + typed wrappers, not runtime weight.

### 2.2 Repo layout: per-language repos as submodules

```
call-api/                            ← public spec repo (github.com/dbryar/call-api → github.com/opencall-api/call-api)
  specification.md
  client.md
  comparisons.md
  tests/                             ← language-agnostic conformance suite + reference servers
  tooling/
    typescript/  → submodule  →  github.com/opencall-api/opencall-ts
    python/      → submodule  →  github.com/opencall-api/opencall-py
    go/          → submodule  →  github.com/opencall-api/opencall-go
    java/        → submodule  →  github.com/opencall-api/opencall-java
  demo/
```

Each tooling repo contains both the server and client packages for that language (single repo, two artifacts). Rationale:

- One CI config per language; each ecosystem has its own quirks (Maven signing, Go modules, wheel building).
- Submodule pinning encodes "spec X tested against tooling Y" in git.
- Independent issue trackers per language for community contribution.
- Go modules use repo path as import path; per-language repos avoid awkward sub-paths in unrelated languages.

### 2.3 Registry & naming per ecosystem

| Language   | Registry         | Server package                               | Client package                               | Notes                                                                                                            |
| ---------- | ---------------- | -------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| TypeScript | npm              | `@opencall/server`                           | `@opencall/client`                           | Org `@opencall` claimed, 2FA enforced for all members                                                            |
| Python     | PyPI             | `opencall-server`                            | `opencall-client`                            | PyPI is flat; first-come-first-served. Names to be reserved on first publish.                                    |
| Go         | proxy.golang.org | `github.com/opencall-api/opencall-go/server` | `github.com/opencall-api/opencall-go/client` | Single Go module with sub-packages — one `go get`, two imports.                                                  |
| Java       | Maven Central    | `com.opencall-api:opencall-server`           | `com.opencall-api:opencall-client`           | Group ID derived from `opencall-api.com`; verified via Cloudflare DNS TXT record on the Sonatype Central Portal. |

The never-published `@opencall/ts-tools` name is retired in favor of the server/client split. The codebase that lives at `tooling/typescript/` becomes the `@opencall/server` package; client + codegen is new code.

### 2.4 Versioning policy

**Independent SemVer per package. Spec compatibility is declared in metadata, not encoded in the package's own version number.**

Three different version concepts are in play and must not be conflated:

| Versioned thing      | Scheme                                  | Owned by              | Example                                  |
| -------------------- | --------------------------------------- | --------------------- | ---------------------------------------- |
| Individual operation | `vN:` prefix on the op name             | API implementer       | `v1:orders.getItem`, `v56:orders.getItem` |
| OpenCALL spec        | Calendar date (`callVersion`)           | Spec maintainers      | `2026-02-10`                             |
| Tool package         | SemVer (`major.minor.patch`)            | Tool maintainers      | `@opencall/server@0.2.0`                 |

**Operation versions are independent of everything else.** An op can be at `v56:` while running against spec `callVersion: 2026-02-10` with tool version `0.2.0`. The tool only round-trips whatever prefix appears in the envelope; it does not interpret operation versions semantically.

**Tool packages follow their own SemVer based on their own API surface:**

- MINOR/PATCH are independent across packages and across languages. A bug fix in `@opencall/server` does not force a release of `@opencall/client` or any other-language package.
- A package can stay in `0.x.x` while its API is pre-stable. `0.x.x` minor bumps may break the package's own API.
- The `0 → 1` jump signals tool API stability; it does not encode a spec version.

**Spec compatibility is metadata.** Each package declares the OpenCALL spec `callVersion` it was built and tested against in its package metadata (`opencallSpec` field in `package.json`, equivalent in `pyproject.toml`, `go.mod` doc, `pom.xml`). The README repeats this for human readers.

**Tool major bumps happen for one of two independent reasons:**

1. The tool's own API has a breaking change (the usual SemVer reason).
2. The spec introduces a breaking change to the envelope, registry, or transport contract that the tool can't absorb additively — forcing the tool to break its consumers in turn. Rare, since spec evolution is additive-first per `specification.md`.

**Concrete example for TS today:** the next publish is `@opencall/server@0.2.0` (incorporates `requested_changes.md`). When the package API stabilizes, the next release is `1.0.0`. The `opencallSpec` field declares the spec `callVersion` supported at that moment.

### 2.5 Surface contract — what makes a package "OpenCALL-conformant"

A server package MUST expose:

1. Request and response envelope types/schemas matching the spec.
2. Operation registry types matching the `/.well-known/ops` shape.
3. A registry builder (file-scan or module-import) that produces a registry response from operation definitions.
4. A dispatcher entry point that validates an envelope, routes to a handler, and returns a properly shaped response (including async / streaming / chunked variants).
5. Standard error classes: domain error (HTTP 200 with `state=error`), backend-unavailable error (HTTP 503), protocol error (HTTP 4xx).
6. A `safeHandlerCall` (or language equivalent) that converts thrown exceptions into spec-conformant responses.

A client package MUST expose:

1. The single `call()` function (see `client.md`) with envelope construction, request ID generation, polling support for async responses, and stream/media handling primitives.
2. A codegen tool that reads `/.well-known/ops` and emits typed wrappers in the host language's idiom.
3. Optional generated convenience wrappers (`orders.getItem(args)`) — usage stays optional; raw `call()` always works.

### 2.6 Conformance & testing

- **Spec-level conformance** stays in `tests/` (language-agnostic via HTTP). All reference servers in `tests/api/{lang}/` continue to pass.
- **SDK-level conformance** is added: a parallel suite in each tooling repo that tests envelope encoding, validator behavior, registry-build output, and codegen output. These tests are language-native (Bun for TS, pytest for Python, `go test`, JUnit).
- **Cross-validation:** once a language's SDK exists, the corresponding `tests/api/{lang}/` reference server is rewritten to use that SDK. The `tests/` suite then validates that an SDK-built server still passes the spec contract end-to-end. Two birds: SDK gets dogfooded, reference server becomes shorter and clearer.

### 2.7 Canonical hosting and agent-readable distribution

**Premise:** most code consuming OpenCALL going forward will be written by AI agents. Agents need to read the spec and SDK docs at the time of authoring, not wait for the next training cut. GitHub blocks non-Copilot user-agents by default, which makes raw GitHub READMEs and `specification.md` URLs unreliable as the canonical reference for agent traffic. Therefore the canonical surface is a separate, agent-friendly site.

**Canonical site:** `https://opencall-api.com`, hosted on **Cloudflare Pages**, with bot access explicitly enabled (already configured). The brochure landing page lives at `/`; the full spec and tooling docs live at `/spec/...`.

**What's published there:**

| Path                              | Content                                                                                       | Source                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| `/`                               | Brochure landing page (current `demo/www/index.html` content)                                 | `site/` (moved from `demo/www/`)        |
| `/spec/`                          | Rendered HTML of `specification.md` with TOC, anchors, code highlighting                      | `specification.md` (repo root)          |
| `/spec/client/`                   | Rendered `client.md`                                                                          | `client.md`                             |
| `/spec/comparisons/`              | Rendered `comparisons.md`                                                                     | `comparisons.md`                        |
| `/spec/index.md`, `/client.md`, … | **Raw markdown** copies served with `Content-Type: text/markdown`                             | Same source files                       |
| `/spec/sdk/{lang}/`               | Rendered SDK READMEs from each tooling repo (pulled at build time via submodule)              | `tooling/{lang}/README.md` per package  |
| `/.well-known/opencall-spec`      | A small JSON manifest pointing agents at the markdown URLs and current `callVersion`          | Generated at build time                 |

Agents that prefer raw markdown follow the `.md` URLs; humans land on the rendered HTML. The pattern is already used by `agents.opencall-api.com` (Firebase target `agents` rewriting `/` → `/index.md` with `Content-Type: text/markdown`); we generalize it onto the Cloudflare apex.

**What every README and package points to:**

- **GitHub READMEs** (spec repo and every tooling repo) contain a banner at the top: *"Canonical docs live at https://opencall-api.com/spec — GitHub may block your bot."* Followed by a brief overview and links into specific spec sections at the canonical URL.
- **Package metadata `homepage`** field in every published artifact (`package.json` for npm, `[project.urls]` in `pyproject.toml`, `<url>` in `pom.xml`, doc comment in `go.mod`) points to the canonical URL — `https://opencall-api.com/spec` for spec docs, `https://opencall-api.com/spec/sdk/{lang}` for the SDK docs page, never to GitHub.
- **Generated codegen output** that includes a header comment includes a link back to the canonical spec URL plus the `callVersion` it was generated against.

**Repo location of the site:**

The current `demo/www/` is the canonical website despite living under `demo/`. Move it to `site/` at repo root (Phase 0). `demo/` keeps the actual demo (app, API, agents, scripts) — the brochure was misplaced there. The Firebase `target: www` deployment is retired in favor of Cloudflare Pages from `site/dist/`.

**CI/deploy:**

GitHub Actions workflow on push to `main`: build the site (template substitution, markdown → HTML, submodule README aggregation) and deploy to Cloudflare Pages via the Cloudflare API token (stored as a repo secret). No long-lived deploy keys; the token is scoped to one Pages project.

---

## 3. Phasing

### Phase 0 — Make the spec repo publishable (this week)

- Create the GitHub org `opencall-api` (the `opencall` org name is taken on GitHub by an unrelated telephony project; `opencall-api` matches the domain `opencall-api.com` and the Maven group `com.opencall-api`). The npm scope stays `@opencall`.
- **Transfer existing repos** rather than re-creating:
  - `dbryar/call-api` → `opencall-api/call-api` (GitHub Settings → Transfer ownership). GitHub serves a permanent redirect from the old path, so existing clones, submodule pins, README links, and external references continue to resolve.
  - `dbryar/call-tools-typescript` → `opencall-api/opencall-ts` (transfer, then rename in Settings — or rename first then transfer; either works). The redirect covers the rename too.
  - After transfer, update local remotes (`git remote set-url`) and the submodule URL in `.gitmodules` so future clones pick up the canonical path. The redirects keep working as a safety net.
- Branch protection on `main`; require PR + CI for any external contribution.
- README pass: lead with a "canonical docs at https://opencall-api.com/spec — GitHub may block your bot" banner; then install instructions, contribution guide, link to npm `@opencall`.
- LICENSE pass: confirm Apache-2.0 covers the spec, examples, and tooling consistently.
- Add `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- Audit `.gitignore` and submodule URLs (`.gitmodules` currently points at `dbryar/call-tools-typescript`; update to `opencall-api/opencall-ts` post-transfer).
- **Move the canonical website into the spec repo and onto Cloudflare Pages:**
  - Relocate `demo/www/` → `site/` at repo root. The current Firebase `target: www` brochure becomes the apex landing of `opencall-api.com`.
  - Add a markdown-to-HTML build step (e.g. a small Bun/Node script using `marked` + a minimal layout, or a static-site generator already aligned with the rest of the project) that renders `specification.md`, `client.md`, `comparisons.md` and the tooling submodule READMEs into `site/dist/spec/...`.
  - Copy the source markdown files to `site/dist/spec/*.md` so agents can fetch raw markdown. Configure the Cloudflare Pages build to serve `.md` with `Content-Type: text/markdown; charset=utf-8` (Pages `_headers` file).
  - Generate `site/dist/.well-known/opencall-spec` (JSON manifest of canonical doc URLs + current `callVersion`).
  - Create a Cloudflare Pages project bound to the GitHub repo `opencall-api/call-api`. Confirm bot access policy is permissive (Cloudflare bot management off for this zone — already in place).
  - DNS: `opencall-api.com` apex → Cloudflare Pages project; `www.opencall-api.com` 301 → apex (consolidates the existing Firebase www target into the apex; see open question below).
  - GitHub Actions workflow `.github/workflows/deploy-site.yml` triggered on push to `main`: build site, deploy to Cloudflare Pages via scoped API token in repo secrets.
  - Retire the Firebase `target: www` deploy only. The `agents`, `app`, and other Firebase targets in `demo/firebase.json` stay on Firebase for now; their migration is a separate, later effort outside this strategy doc.

### Phase 1 — Ship `@opencall/server` v0.2.0 + `@opencall/client` v0.1.0

The TS submodule needs both:

**Server (`@opencall/server`):** the existing `tooling/typescript/` codebase, renamed in `package.json`, with the seven `requested_changes.md` items resolved (envelope `meta`/`auth`/`timeoutMs`, `BackendUnavailableError`, `isDbConnectionError`, `safeHandlerCall` HTTP 503 handling, `requiresAuth` on `OperationModule`, `buildRegistryFromModules` for edge runtimes).

**Client (`@opencall/client`):** new package containing:

- `call()` function (per `client.md`).
- Polling helper for async responses.
- Stream subscription helper.
- Chunked retrieval helper with checksum chain validation.
- A `bin` codegen entry point (`opencall-codegen`) that reads a registry URL or JSON file and emits a `.d.ts` plus optional typed wrappers.

**Release plumbing (one-time per repo):**

1. `opencall-api/opencall-ts` exists (via Phase 0 transfer + rename of `dbryar/call-tools-typescript`); `.gitmodules` in the spec repo updated to the canonical URL.
2. Branch protection on `main`.
3. `.github/workflows/release.yml` triggers on `v*.*.*` tag push, runs build + tests, then `npm publish --provenance --access public` via OIDC.
4. npm trusted publisher configured: GitHub org `opencall-api`, repo `opencall-ts`, workflow `release.yml`, npm scope `@opencall`.
5. README polished for the npm package page (it renders standalone, separate from the spec repo README).
6. CHANGELOG seeded; first manual publish to validate the pipeline; subsequent publishes via tag push only.

### Phase 2 — Python (`opencall-server`, `opencall-client`)

- New repo `github.com/opencall-api/opencall-py` created in the org and linked as `tooling/python/` submodule.
- Server package mirrors the TS surface: envelope schemas (Pydantic), error classes, dispatcher helpers, registry builder, decorator-based operation annotation (`@operation(...)`).
- Client package: `call()` function over `httpx`, codegen tool emitting typed Python wrappers (TypedDict / Pydantic models) from `/.well-known/ops`.
- PyPI trusted publisher configured (PyPI supports OIDC trusted publishing same as npm).
- Rewrite `tests/api/python/` to use `opencall-server` once stable.

### Phase 3 — Go (`opencall-go/server`, `opencall-go/client`)

- New repo `github.com/opencall-api/opencall-go` created in the org as a single Go module.
- Server package: envelope types as struct-tagged Go structs, registry builder reading struct tags + doc comments, idiomatic `http.Handler` mount.
- Client package: `call()` over `net/http`, codegen tool emitting typed Go wrappers.
- Go modules don't need an explicit registry beyond the proxy; tagging the repo publishes the module.
- Rewrite `tests/api/go/` to use the SDK.

### Phase 4 — Java (`com.opencall-api:opencall-server`, `com.opencall-api:opencall-client`)

- New repo `github.com/opencall-api/opencall-java` created in the org.
- Server package: envelope types as records / Jackson-annotated POJOs, annotation-based operation registration (`@Operation`), Javalin/Spring adapters as separate optional modules.
- Client package: `call()` via the JDK 11+ `HttpClient`, codegen tool emitting typed Java records.
- Maven Central onboarding via the Sonatype Central Portal (the post-OSSRH path): verify `opencall-api.com` ownership with a DNS TXT record (Cloudflare CLI), generate a GPG key for artifact signing, and publish via the `central-publishing-maven-plugin` using a Central Portal user token stored as a GitHub Actions secret.
- Rewrite `tests/api/java/` to use the SDK.

### Phase 5 — SDK conformance suite

- A new directory `tests/sdk/` containing language-agnostic test specifications for SDK behavior (round-trip envelope encoding, validator edge cases, codegen golden files).
- Each tooling repo's CI runs the relevant subset against its package.
- Treated as additive — does not block earlier phases.

---

## 4. Risks & Mitigations

| Risk                                                                                                    | Mitigation                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub org `opencall` is taken (unrelated telephony project) — resolved by using `opencall-api` instead | The GitHub org is `opencall-api` throughout. Domain `opencall-api.com` and Maven group `com.opencall-api` already align. The npm scope `@opencall` is unaffected. |
| PyPI `opencall-server` / `opencall-client` may be squatted                                              | Check at the start of Phase 2; have `opencall-tools-server` ready as a fallback.                                                                                  |
| Maven Central onboarding latency (Central Portal namespace verification can take days)                  | Kick off Central Portal namespace verification (`com.opencall-api`) at the end of Phase 1, in parallel with Phase 2 Python work. Don't block Java SDK code on it. |
| Go module path coupling — moving the repo later breaks downstream imports                               | Pick the final repo path before tagging v1.0.0. Pre-1.0 path changes are tolerated.                                                                               |
| Codegen drift across languages (TS codegen emits one shape, Python codegen emits something different)   | Centralize the codegen contract in `tests/sdk/` golden files. Each language's codegen must produce output that round-trips against the same registry.             |
| Documentation fan-out: 4 SDK READMEs to maintain                                                        | Each SDK README is short and links to `https://opencall-api.com/spec` for protocol details. Cross-language patterns documented once in the spec repo, rendered to the canonical site at build time. |
| `requested_changes.md` items reveal deeper spec gaps as they're implemented                             | Treat each as a code change PR with tests. If a real spec gap surfaces, file a spec issue and resolve it in the spec repo before continuing the change.           |
| Firebase `agents`, `app`, and other targets in `demo/firebase.json` may share infrastructure assumptions with the retired `www` target | Phase 0 only retires `target: www` and migrates that one to Cloudflare. The remaining Firebase targets stay on Firebase for now and migrate in a separate, later effort outside this strategy doc. |

---

## 5. Open Items (resolved during brainstorming)

- ✅ Org `@opencall` on npm — claimed, 2FA enforced.
- ✅ Language priority — Python → Go → Java.
- ✅ Repo layout — per-language submodules.
- ✅ Maven group ID — `com.opencall-api`.
- ✅ Versioning — independent SemVer per package; spec compatibility declared via `opencallSpec` metadata; operation `vN:` prefixes are unrelated to tool versions.
- ✅ Server + client split — yes, two packages per language.
- ✅ Conformance — extend `tests/` with SDK-level suite; rewrite reference servers to use SDKs.
- ✅ CI/release — GitHub Actions OIDC trusted publishing on registries that support it (npm and PyPI today). Maven Central uses the Central Portal user token via the `central-publishing-maven-plugin`. Go modules need no registry credential beyond a tagged repo.
- ✅ Canonical docs hosting — `https://opencall-api.com` on Cloudflare Pages, bots permitted, raw markdown served alongside rendered HTML; site source moves into the spec repo at `site/`. All package metadata and READMEs point to the canonical URL, not GitHub.

## 6. Success Criteria

1. `npm install @opencall/server` and `npm install @opencall/client` resolve to public, provenance-attested packages built from the `opencall-api` GitHub org.
2. A new TypeScript developer can write an OpenCALL server using `@opencall/server` and a client using `@opencall/client`, with no code from the spec repo copy-pasted in.
3. The same is true for Python, Go, and Java developers, each within their own ecosystem's idioms.
4. Every published artifact under `@opencall` (npm), `opencall-*` (PyPI), `github.com/opencall-api/*` (Go), and `com.opencall-api:*` (Maven) is reachable from a single page in the spec repo's README.
5. The language-agnostic test suite at `tests/` continues to pass against every language's reference server, including after the reference servers are rewritten on top of the SDKs.
6. `https://opencall-api.com/spec` is the canonical, agent-readable home for the spec and SDK docs: rendered HTML for humans, raw `.md` URLs for agents, and an authoritative `.well-known/opencall-spec` manifest. An agent fetching any URL on the apex receives a 200 (no bot block) and the content matches the source files in the spec repo at the corresponding commit.
7. Every README and every published-package `homepage` field links to the canonical URL — never a GitHub blob URL — so agents that hit a package metadata page land somewhere they can actually read.

---

## 7. Out of Scope (for this strategy doc)

- Implementation-level task breakdowns. Each phase becomes its own implementation plan via the writing-plans skill.
- Spec changes. Any spec gap surfaced during implementation is filed as a separate spec issue.
- Demo-site changes. The `demo/` project is independent and continues on its own track.
- Pricing / commercial / hosted offerings. This doc is open-source tooling only.
