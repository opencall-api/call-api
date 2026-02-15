# OpenCALL Demo Library

A working demo of the [OpenCALL specification](../README.md) — a fictional community library where patrons can browse a catalog, reserve items, return overdue books, and generate lending reports.

The demo exists to show how a single `POST /call` endpoint serves both human-driven web apps and AI agents equally well, including synchronous operations, async polling, chunked retrieval, scoped tokens, and media redirects.

## What it demonstrates

- **Operation dispatch** — every action (`v1:catalog.list`, `v1:item.reserve`, `v1:patron.get`, etc.) goes through one `POST /call` endpoint with a JSON envelope.
- **Async lifecycle** — report generation returns `202 Accepted`, the client polls `GET /ops/:id` until completion, then retrieves output via chunked `GET /ops/:id/chunks`.
- **Scoped auth** — tokens carry fine-grained scopes (`catalog:read`, `item:reserve`, `item:return`, `report:generate`). The auth page lets you selectively disable scopes to see how the API rejects under-scoped requests.
- **Agent discovery** — `GET /.well-known/ops` returns a machine-readable operation registry. AI agents read this to understand available operations without documentation.
- **Media redirects** — `v1:item.getMedia` returns a `303 See Other` with a signed URL to cover images stored in GCS.
- **Envelope viewer** — the web app includes a live inspector showing raw request/response envelopes for every API call, so you can see exactly what's on the wire.

## Architecture

Four services, each a standalone Bun server:

| Service    | Directory | Purpose                                                                    | Local port |
| ---------- | --------- | -------------------------------------------------------------------------- | ---------- |
| **API**    | `api/`    | OpenCALL API server — operation dispatch, auth, SQLite database            | 3000       |
| **App**    | `app/`    | Human-facing web app — server-rendered HTML pages, proxies auth to the API | 8000       |
| **WWW**    | `www/`    | Brochure/landing page — static site explaining the specification           | 8080       |
| **Agents** | `agents/` | Agent instructions — serves Markdown files that AI agents read for context | 8888       |

```
demo/
  api/          API server (OpenCALL specification implementation)
    src/
      auth/       Token issuance, validation, and auth route handlers
      call/       Operation dispatcher, envelope types, error constructors
      db/         SQLite schema, seed data, reset, connection
      ops/        Registry, polling, chunks, rate limiting
      operations/ 12 operation handlers (catalog, item, patron, report)
      services/   Analytics, catalog, lending, lifecycle, media, reports
      server.ts   Entry point
    tests/        9 test files (auth, call, chunks, cors, errors,
                  integration, media, polling, registry)

  app/          Web application
    src/
      client/     TypeScript modules (bundled to public/app.js via bun build)
        pages/    Page modules (account, auth-page, catalog, dashboard,
                  item-detail, reports)
      db/         SQLite connection and schema for sessions
      server.ts   Entry point — serves pages, proxies auth
      auth.ts     Auth flow (login, logout, scope changes)
      session.ts  Session store (SQLite) + cookie handling
      pages.ts    HTML page templates
      proxy.ts    Legacy proxy utilities
    public/       Static assets (app.js is a build artifact)
    tests/        2 test files (integration, session)

  www/          Brochure site (Bun server locally, Firebase Hosting in prod)
    src/
      server.ts   Local dev server with template replacement
    index.html    Template with {{APP_URL}} / {{API_URL}} placeholders
    style.css
    build.sh      Builds dist/ by replacing template placeholders
    dist/         Built output (gitignored), deployed to Firebase Hosting

  agents/       Agent instructions (Bun server locally, Firebase Hosting in prod)
    src/
      server.ts   Local dev server with template replacement
    index.md      Markdown template with {{API_URL}} placeholders
    build.sh      Builds dist/ by replacing template placeholders
    dist/         Built output (gitignored), deployed to Firebase Hosting

  scripts/
    run-local.sh  Start all 4 services locally
    deploy.sh     Full production deployment (Cloud Run + Firebase)
    setup.sh      Initial GCP project setup
    setup-scheduler.sh  Cloud Scheduler setup for periodic DB reset
    launch.sh     Alternative launcher
```

## Running locally

Prerequisites: [Bun](https://bun.sh) v1.1+

```bash
# Install dependencies for all services
cd demo/api && bun install && cd ..
cd app && bun install && cd ..

# Seed the database (first time only)
cd api && bun run seed && cd ..

# Start everything
bash scripts/run-local.sh
```

This starts all 4 services and runs health checks. Once running:

- Open http://localhost:8000/auth to sign in
- Browse the catalog, reserve items, check your account, generate reports
- Watch the envelope viewer in the sidebar to see raw API traffic

Alternatively, use Docker Compose:

```bash
docker compose up
```

## Building client assets

The web app's JavaScript is authored as TypeScript modules in `app/src/client/` and bundled into a single `app/public/app.js`:

```bash
cd app && bun run build
```

The brochure site needs its template placeholders replaced before deployment:

```bash
APP_URL=https://demo.opencall-api.com API_URL=https://api.opencall-api.com bash www/build.sh
```

## Testing

```bash
# API server tests (99 tests across 9 files)
cd api && bun test

# App server tests (34 tests across 2 files)
cd app && bun test
```

## Deploying

The full deploy script handles Cloud Run (API + App) and Firebase Hosting (WWW + Agents), including building static assets:

```bash
bash scripts/deploy.sh
```

It reads production URLs from environment or defaults to the `opencall-api.com` custom domains.

## Adding features

To add a new operation to the API:

1. Create a handler in `api/src/operations/` — export a function matching the operation signature.
2. Register it in the operation registry so it appears in `GET /.well-known/ops`.
3. Add any required scopes to the auth system in `api/src/auth/`.
4. Add a UI page or section in `app/src/client/pages/` — import from `api.ts` to call your operation.
5. Re-run `cd app && bun run build` to bundle the updated client code.
6. Update the agent instructions in `agents/` if agents should be able to discover the new operation.

The pattern for each page module is: import `callApi` from `../api`, call it with your operation name, render the result as HTML strings, and attach any `onclick` handlers to `window`.
