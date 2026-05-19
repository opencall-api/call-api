# OpenCALL Explorer

A standalone Bun + React explorer for OpenCALL services.

It reads:

- `GET /.well-known/ops`
- `GET /.well-known/errors`

and renders:

- service overview
- operation reference
- error catalog
- a "try it" console for `POST /call`

The explorer is designed to work in two deployment modes:

1. Same-origin: host it on the same domain as the target OpenCALL service.
   The default target becomes the explorer's own origin.
2. Fixed target: host it anywhere and set `TARGET_ORIGIN=https://api.example.com`.

Because the Bun server proxies discovery and `try it` requests, the browser UI
does not need the target service to enable CORS for the explorer origin.

## Run

```bash
npm install
npm run dev
```

Or with Bun:

```bash
bun install
bun run dev
```

## Environment

- `PORT` or `EXPLORER_PORT`: server port, default `9090`
- `TARGET_ORIGIN`: optional fixed target origin, e.g. `https://api.example.com`

## Routes

- `/` - React explorer UI
- `/api/config` - UI bootstrap config
- `/api/registry?target=...` - proxied `/.well-known/ops`
- `/api/errors?target=...&errorsUrl=...` - proxied error catalog
- `/api/proxy` - generic proxied request used by "try it" and follow-up polling
