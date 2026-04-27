# Contributing to OpenCALL

Thanks for your interest. OpenCALL is an open specification with reference implementations and tooling. Contributions to any of these are welcome.

## Where to file what

- **Spec questions, ambiguities, or proposals** — open an issue on `opencall-api/call-api`.
- **Bugs in a language tooling package** — open an issue on the matching `opencall-api/opencall-{lang}` repo.
- **Security issues** — see `SECURITY.md`. Do not file these as public issues.

## Spec changes

Spec changes are additive-first. A breaking change requires a new operation version (`v2:`, `v3:`) and a deprecation lifecycle for the old version. Read `specification.md` for the rules before proposing changes.

## Pull requests

1. Open an issue first for anything beyond a typo fix or trivial wording change.
2. Branch from `main`. Keep PRs focused — one logical change per PR.
3. The CI must pass. Tests live in `tests/` (language-agnostic) and in each tooling repo's own suite.
4. Sign your commits with a verified email if possible. Pre-commit and CI hooks are not bypassed (`--no-verify` is a non-starter).

## Local development

Tests run against any OpenCALL-compliant server via HTTP:

```bash
cd tests && bun install && bun test
```

To exercise all four reference implementations:

```bash
docker compose -f tests/docker/docker-compose.yml up --build -d
API_URL=http://localhost:3001 bun test --cwd tests
```

See `tests/README.md` for details on adding a new language implementation.
