# Phase 0 — Canonical Hosting & Org Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the OpenCALL spec repo to its canonical home in a new GitHub org, relocate the brochure site into the repo, render the spec docs as an agent-readable site at `https://opencall-api.com`, and deploy it on Cloudflare Pages so SDK READMEs and package metadata can point at a stable, bot-friendly URL.

**Architecture:** The spec repo `dbryar/call-api` is transferred (not re-created) to a new GitHub org `opencall-api`, preserving redirects. The submodule repo `dbryar/call-tools-typescript` is transferred and renamed to `opencall-api/ts-tools` in the same operation. The brochure source moves from `demo/www/` to `site/` at the repo root. A small Bun-based build script renders the existing markdown docs (`specification.md`, `client.md`, `comparisons.md`) into HTML at `/spec/...`, copies the raw markdown into `/spec/*.md` for agents, and writes a `.well-known/opencall-spec` JSON manifest. Cloudflare Pages, fed from `site/dist/`, serves the apex with bots permitted.

**Tech Stack:**

- Bun (existing project runtime)
- TypeScript
- `marked` for markdown → HTML
- Cloudflare Pages (hosting)
- GitHub Actions (deploy automation)

**Reference:** `docs/superpowers/specs/2026-04-27-multi-language-tooling-design.md`, sections 2.7 and Phase 0.

---

## Pre-flight

Before starting, confirm the current state:

- [ ] **Step P1: Verify clean working tree on main**

```bash
git status
```

Expected: branch `main`, working tree may have unrelated untracked dirs (`demo/.agent.work/`, `demo/.firebase/`, `requested_changes.md`) but no staged/unstaged tracked changes.

- [ ] **Step P2: Confirm tooling submodule remote**

```bash
git config --file .gitmodules --get submodule.tooling/typescript.url
```

Expected output: `git@github.com:dbryar/call-tools-typescript.git`

- [ ] **Step P3: Confirm primary remote**

```bash
git remote get-url origin
```

Expected output: `https://github.com/dbryar/call-api.git` (or the SSH form).

---

### Task 1: Create the `opencall-api` GitHub org and transfer existing repos

**Files:** none (manual GitHub UI steps).

This task is performed by the human user in the GitHub web UI. The agent prompts the user, waits for confirmation, then verifies via `gh` CLI before continuing.

- [ ] **Step 1.1: User creates GitHub org `opencall-api`**

Manual step. Open `https://github.com/account/organizations/new`, choose the **Free** plan, set the org name to `opencall-api`. Use the same billing email as the npm org for consistency. Add the user's existing GitHub account as an owner.

- [ ] **Step 1.2: User transfers `dbryar/call-api` to `opencall-api`**

Manual step. Open `https://github.com/dbryar/call-api/settings`, scroll to the *Danger Zone*, click **Transfer ownership**, set the new owner to `opencall-api`, and confirm by typing the repo name. After transfer, the canonical URL becomes `https://github.com/opencall-api/call-api`. GitHub serves a permanent redirect from the old path.

- [ ] **Step 1.3: User transfers and renames `dbryar/call-tools-typescript` → `opencall-api/ts-tools`**

Manual step. Two operations. Pick either order:

- **Option A (rename then transfer):** Settings → rename to `ts-tools` → Settings → Transfer ownership → `opencall-api`.
- **Option B (transfer then rename):** Settings → Transfer ownership → `opencall-api` → Settings → rename to `ts-tools`.

Either way, the redirect chain remains intact.

- [ ] **Step 1.4: Verify the new URLs resolve**

Run (replace `gh` with the GitHub CLI authenticated as the user):

```bash
gh repo view opencall-api/call-api --json name,owner,defaultBranchRef
gh repo view opencall-api/ts-tools --json name,owner,defaultBranchRef
```

Expected: both commands return JSON with `"owner": {"login": "opencall-api"}` and `"name"` matching `call-api` and `ts-tools` respectively.

- [ ] **Step 1.5: Verify GitHub redirects are in place**

```bash
curl -sI https://github.com/dbryar/call-api | head -5
curl -sI https://github.com/dbryar/call-tools-typescript | head -5
```

Expected: each response includes `HTTP/2 301` (or 302) and a `location:` header pointing at the new path under `opencall-api/`.

- [ ] **Step 1.6: No commit for this task**

This task changes nothing in the working tree. Continue to Task 2.

---

### Task 2: Update local git remotes and submodule URL

**Files:**
- Modify: `.gitmodules`

- [ ] **Step 2.1: Update the parent repo's `origin` to the canonical URL**

```bash
git remote set-url origin git@github.com:opencall-api/call-api.git
git remote -v
```

Expected: both `origin` fetch and push lines show `git@github.com:opencall-api/call-api.git`.

- [ ] **Step 2.2: Update the submodule URL in `.gitmodules`**

Edit `.gitmodules` so it reads:

```
[submodule "tooling/typescript"]
	path = tooling/typescript
	url = git@github.com:opencall-api/ts-tools.git
```

- [ ] **Step 2.3: Sync the submodule remote**

```bash
git submodule sync tooling/typescript
git -C tooling/typescript remote -v
```

Expected: the submodule's `origin` now points at `git@github.com:opencall-api/ts-tools.git`.

- [ ] **Step 2.4: Verify both remotes still fetch successfully**

```bash
git fetch origin
git -C tooling/typescript fetch origin
```

Expected: both fetches succeed with no errors. (If the submodule has uncommitted local changes from prior work, leave them; we are not pushing here.)

- [ ] **Step 2.5: Commit the `.gitmodules` change**

```bash
git add .gitmodules
git commit -m "Point submodule and origin at opencall-api org"
```

---

### Task 3: Add community files

**Files:**
- Create: `CODE_OF_CONDUCT.md`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`

These three files are the GitHub community-standards minimum and let GitHub render the green "Community Profile" badge.

- [ ] **Step 3.1: Create `CODE_OF_CONDUCT.md`**

Use the Contributor Covenant 2.1 verbatim. Save the following content to `CODE_OF_CONDUCT.md`:

```markdown
# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone, regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community.

## Our Standards

Examples of behavior that contributes to a positive environment include demonstrating empathy and kindness, being respectful of differing opinions, giving and gracefully accepting constructive feedback, and focusing on what is best for the community.

Unacceptable behavior includes the use of sexualized language or imagery, trolling, insulting or derogatory comments, public or private harassment, publishing others' private information without permission, and any conduct that would reasonably be considered inappropriate in a professional setting.

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behavior may be reported to the project maintainers at the contact address in `SECURITY.md`. All complaints will be reviewed and investigated promptly and fairly.

This Code of Conduct is adapted from the Contributor Covenant, version 2.1, available at https://www.contributor-covenant.org/version/2/1/code_of_conduct.html.
```

- [ ] **Step 3.2: Create `CONTRIBUTING.md`**

Save the following content to `CONTRIBUTING.md`:

```markdown
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

\`\`\`bash
cd tests && bun install && bun test
\`\`\`

To exercise all four reference implementations:

\`\`\`bash
docker compose -f tests/docker/docker-compose.yml up --build -d
API_URL=http://localhost:3001 bun test --cwd tests
\`\`\`

See `tests/README.md` for details on adding a new language implementation.
```

- [ ] **Step 3.3: Create `SECURITY.md`**

Save the following content to `SECURITY.md`:

```markdown
# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in the OpenCALL specification, reference implementations, or any `@opencall` package, please report it privately.

**Contact:** Use GitHub's private security advisory feature at https://github.com/opencall-api/call-api/security/advisories/new, or email the maintainer listed on the npm package page.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce, or a proof-of-concept.
- The affected package(s), version(s), and spec section if applicable.

## Supported Versions

Security fixes are issued for the latest minor version of every published `@opencall` package, and for the latest patch of the previous minor where feasible. Older versions are not patched; upgrade to a current release.

## Disclosure Timeline

We aim to acknowledge reports within 72 hours and provide a remediation plan within 7 days. Coordinated disclosure timelines are agreed with the reporter on a case-by-case basis.
```

- [ ] **Step 3.4: Verify all three files render as Markdown**

```bash
ls -la CODE_OF_CONDUCT.md CONTRIBUTING.md SECURITY.md
head -3 CODE_OF_CONDUCT.md CONTRIBUTING.md SECURITY.md
```

Expected: all three files exist and start with their respective `#` titles.

- [ ] **Step 3.5: Verify root `LICENSE` is Apache-2.0**

```bash
head -2 LICENSE
grep -c "Apache License" LICENSE
```

Expected: line 1 (or 2) reads `Apache License`, and the count is at least 1. The spec doc requires the project's license to be Apache-2.0 across spec, examples, and tooling. The existing `LICENSE` at the repo root is Apache-2.0; this step is a sanity check, not a change.

If the LICENSE is **not** Apache-2.0, stop and surface it to the user before continuing — the strategy doc assumes Apache-2.0 throughout.

- [ ] **Step 3.6: Verify `tooling/typescript/LICENSE` matches**

```bash
head -2 tooling/typescript/LICENSE
diff -q LICENSE tooling/typescript/LICENSE && echo "match"
```

Expected: both LICENSE files are Apache-2.0 (the `head` output identifies them) and `diff` reports no differences (or only the copyright-holder line, which is acceptable). If they materially differ, surface to the user.

- [ ] **Step 3.7: Commit**

```bash
git add CODE_OF_CONDUCT.md CONTRIBUTING.md SECURITY.md
git commit -m "Add community files: code of conduct, contributing, security"
```

---

### Task 4: Add canonical-docs banner to `README.md`

**Files:**
- Modify: `README.md`

The banner is a one-paragraph note at the very top of the README, before the existing content, telling agents and humans where the canonical docs live.

- [ ] **Step 4.1: Read the current README**

```bash
head -5 README.md
```

Expected: the file starts with `# Goodbye REST. Hello OpenCALL.`

- [ ] **Step 4.2: Insert the banner above the existing title**

Use the `Edit` tool to replace the first line:

- old: `# Goodbye REST. Hello OpenCALL.`
- new:

```markdown
> **Canonical docs:** [https://opencall-api.com/spec](https://opencall-api.com/spec). GitHub blocks most non-Copilot bots; the canonical site serves the same docs as rendered HTML and as raw markdown for agents.

# Goodbye REST. Hello OpenCALL.
```

- [ ] **Step 4.3: Verify the change**

```bash
head -5 README.md
```

Expected: line 1 is the blockquote banner, line 2 is blank, line 3 is the title.

- [ ] **Step 4.4: Commit**

```bash
git add README.md
git commit -m "Add canonical-docs banner pointing to opencall-api.com/spec"
```

---

### Task 5: Move `demo/www/` to `site/` at the repo root

**Files:**
- Move: `demo/www/build.sh` → `site/build.sh`
- Move: `demo/www/index.html` → `site/index.html`
- Move: `demo/www/style.css` → `site/style.css`
- Move: `demo/www/package.json` → `site/package.json`
- Move: `demo/www/Dockerfile` → `site/Dockerfile`
- Move: `demo/www/assets/` → `site/assets/`
- Move: `demo/www/src/server.ts` → `site/src/server.ts`
- Modify: `site/package.json` (rename, update paths)
- Modify: `site/build.sh` (paths reference `site/` dir)
- Modify: `site/src/server.ts` (path to index.html unchanged — relative imports still resolve)
- Modify: `demo/scripts/run-local.sh` (if it references `demo/www/`)

The brochure is the canonical website, not demo content. It belongs at the repo root.

- [ ] **Step 5.1: Move the directory with `git mv`**

```bash
git mv demo/www site
git status
```

Expected: a list of renames `demo/www/<file>` → `site/<file>`.

- [ ] **Step 5.2: Drop the local build artifact and the local Docker image build**

```bash
rm -rf site/dist
```

The `dist/` directory is regenerated by `site/build.sh`; we don't track it. The `Dockerfile` is fine to leave for now (used for the demo run-local script if applicable).

- [ ] **Step 5.3: Update `site/package.json` name**

Use the `Edit` tool. Change:

- old: `"name": "@opencall-demo/www",`
- new: `"name": "@opencall/site",`

- [ ] **Step 5.4: Search for any path references to `demo/www` outside the moved files**

```bash
grep -rn "demo/www" --include='*.sh' --include='*.ts' --include='*.json' --include='*.md' --include='*.yml' . 2>/dev/null | grep -v node_modules | grep -v dist
```

If `demo/scripts/run-local.sh` or `demo/firebase.json` references `demo/www`, update those references in subsequent steps. (We'll handle `firebase.json` in Task 16; handle `run-local.sh` here.)

- [ ] **Step 5.5: Update `demo/scripts/run-local.sh` if it references `demo/www`**

If the grep above showed a hit in `demo/scripts/run-local.sh`, edit it to use the new path `site` instead. Use the `Edit` tool with the exact `cd demo/www` (or similar) line, replacing with `cd site` (relative to repo root) or the appropriate absolute reference.

If there is no hit, skip this step.

- [ ] **Step 5.6: Verify the moved tree compiles/runs locally**

```bash
cd site && bun install && cd ..
APP_URL=https://demo.opencall-api.com API_URL=https://api.opencall-api.com bash site/build.sh
ls site/dist/
```

Expected: `site/dist/` contains `index.html`, `style.css`, and the `assets/` directory with the `{{APP_URL}}`/`{{API_URL}}` placeholders substituted.

- [ ] **Step 5.7: Commit**

```bash
git add site demo/scripts/run-local.sh
git commit -m "Move brochure site from demo/www to site/ at repo root"
```

---

### Task 6: Add build dependencies and scripts to `site/package.json`

**Files:**
- Modify: `site/package.json`

We add `marked` for markdown→HTML rendering, plus `build`, `render`, `manifest`, and `test` scripts.

- [ ] **Step 6.1: Edit `site/package.json` to add scripts and devDependencies**

Replace the existing file content with:

```json
{
  "name": "@opencall/site",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun --hot src/server.ts",
    "start": "bun src/server.ts",
    "render": "bun scripts/render-spec.ts",
    "manifest": "bun scripts/build-manifest.ts",
    "build": "bash build.sh && bun run render && bun run manifest",
    "test": "bun test"
  },
  "devDependencies": {
    "marked": "^14.1.0",
    "@types/bun": "latest"
  }
}
```

- [ ] **Step 6.2: Install the new dependencies**

```bash
cd site && bun install && cd ..
```

Expected: `bun install` runs without error and adds `marked` to `site/node_modules/`.

- [ ] **Step 6.3: Add `dist/` and `node_modules/` to `.gitignore` (if not already)**

Check the existing `site/` ignore patterns:

```bash
grep -E "dist|node_modules" site/.gitignore 2>/dev/null
cat .gitignore | grep -E "site|dist|node_modules"
```

If `site/dist/` and `site/node_modules/` are not ignored by either `site/.gitignore` (carried over from `demo/www/.gitignore`) or the root `.gitignore`, create `site/.gitignore` with:

```
dist/
node_modules/
```

- [ ] **Step 6.4: Commit**

```bash
git add site/package.json site/bun.lock site/.gitignore
git commit -m "site: add render/manifest/build scripts and marked dependency"
```

(`site/bun.lock` may or may not exist; include it only if `git status` shows it as new or modified.)

---

### Task 7: Write the markdown rendering script (TDD)

**Files:**
- Create: `site/scripts/render-spec.ts`
- Create: `site/scripts/render-spec.test.ts`
- Create: `site/scripts/layout.ts`

The render script reads the three top-level markdown files (`specification.md`, `client.md`, `comparisons.md`) from the repo root, converts them to HTML using `marked`, wraps them in a small layout, and writes both rendered HTML and a copy of the raw markdown into `site/dist/spec/`.

- [ ] **Step 7.1: Write the failing test**

Create `site/scripts/render-spec.test.ts` with:

```ts
import { test, expect } from "bun:test"
import { renderMarkdown } from "./render-spec"

test("renders a heading as an h1", () => {
  const html = renderMarkdown("# Hello World\n")
  expect(html).toContain("<h1")
  expect(html).toContain("Hello World")
})

test("renders fenced code blocks with a language class", () => {
  const html = renderMarkdown("```ts\nconst x = 1;\n```\n")
  expect(html).toContain("<pre>")
  expect(html).toContain("<code")
  expect(html).toContain("language-ts")
})

test("renders inline links", () => {
  const html = renderMarkdown("See [the spec](specification.md).")
  expect(html).toContain('href="specification.md"')
})
```

- [ ] **Step 7.2: Run the test and verify it fails**

```bash
cd site && bun test scripts/render-spec.test.ts
```

Expected: FAIL with "Cannot find module './render-spec'" or equivalent.

- [ ] **Step 7.3: Write `site/scripts/layout.ts`**

```ts
export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body class="spec-doc">
  <header class="spec-header">
    <a href="/" class="logo">Open<strong>CALL</strong></a>
    <nav>
      <a href="/spec/">Spec</a>
      <a href="/spec/client/">Client Guide</a>
      <a href="/spec/comparisons/">Comparisons</a>
    </nav>
  </header>
  <main class="spec-main">
${body}
  </main>
  <footer class="spec-footer">
    <p>Apache-2.0 — <a href="https://github.com/opencall-api/call-api">opencall-api/call-api</a></p>
  </footer>
</body>
</html>
`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
```

- [ ] **Step 7.4: Write `site/scripts/render-spec.ts`**

```ts
import { marked } from "marked"
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { layout } from "./layout"

interface SpecEntry {
  source: string
  htmlOut: string
  rawOut: string
  title: string
}

const REPO_ROOT = resolve(import.meta.dir, "..", "..")
const DIST = resolve(REPO_ROOT, "site", "dist")

const ENTRIES: SpecEntry[] = [
  {
    source: resolve(REPO_ROOT, "specification.md"),
    htmlOut: resolve(DIST, "spec", "index.html"),
    rawOut: resolve(DIST, "spec", "index.md"),
    title: "OpenCALL Specification",
  },
  {
    source: resolve(REPO_ROOT, "client.md"),
    htmlOut: resolve(DIST, "spec", "client", "index.html"),
    rawOut: resolve(DIST, "spec", "client.md"),
    title: "OpenCALL Client Guide",
  },
  {
    source: resolve(REPO_ROOT, "comparisons.md"),
    htmlOut: resolve(DIST, "spec", "comparisons", "index.html"),
    rawOut: resolve(DIST, "spec", "comparisons.md"),
    title: "OpenCALL Comparisons",
  },
]

export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false }) as string
}

async function renderEntry(entry: SpecEntry): Promise<void> {
  const md = await readFile(entry.source, "utf8")
  const body = renderMarkdown(md)
  const html = layout(entry.title, body)
  await mkdir(dirname(entry.htmlOut), { recursive: true })
  await writeFile(entry.htmlOut, html, "utf8")
  await mkdir(dirname(entry.rawOut), { recursive: true })
  await copyFile(entry.source, entry.rawOut)
  console.log(`rendered ${entry.source} → ${entry.htmlOut} (+raw)`)
}

async function main(): Promise<void> {
  for (const entry of ENTRIES) {
    await renderEntry(entry)
  }
}

if (import.meta.main) {
  await main()
}
```

- [ ] **Step 7.5: Run the test and verify it passes**

```bash
cd site && bun test scripts/render-spec.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 7.6: Run the script end-to-end against the real repo**

```bash
cd site && bun run render && cd ..
ls site/dist/spec/ site/dist/spec/client/ site/dist/spec/comparisons/
```

Expected: `index.html` and `index.md` (or `client.md`, `comparisons.md`) in the relevant directories.

- [ ] **Step 7.7: Commit**

```bash
git add site/scripts/
git commit -m "site: render specification/client/comparisons markdown to dist/spec"
```

---

### Task 8: Write the `.well-known` manifest builder (TDD)

**Files:**
- Create: `site/scripts/build-manifest.ts`
- Create: `site/scripts/build-manifest.test.ts`

The manifest is a small JSON document at `/.well-known/opencall-spec` that points agents at the canonical doc URLs and declares the spec `callVersion` the rendered docs were built from.

- [ ] **Step 8.1: Write the failing test**

Create `site/scripts/build-manifest.test.ts`:

```ts
import { test, expect } from "bun:test"
import { buildManifest } from "./build-manifest"

test("manifest declares site base and callVersion", () => {
  const m = buildManifest({ siteBase: "https://opencall-api.com", callVersion: "2026-02-10" })
  expect(m.siteBase).toBe("https://opencall-api.com")
  expect(m.callVersion).toBe("2026-02-10")
})

test("manifest lists spec html and markdown URLs", () => {
  const m = buildManifest({ siteBase: "https://opencall-api.com", callVersion: "2026-02-10" })
  expect(m.spec.html).toBe("https://opencall-api.com/spec/")
  expect(m.spec.markdown).toBe("https://opencall-api.com/spec/index.md")
})

test("manifest lists guides with both formats", () => {
  const m = buildManifest({ siteBase: "https://opencall-api.com", callVersion: "2026-02-10" })
  const names = m.guides.map((g) => g.name).sort()
  expect(names).toEqual(["client", "comparisons"])
  for (const guide of m.guides) {
    expect(guide.html.startsWith("https://opencall-api.com/spec/")).toBe(true)
    expect(guide.markdown.endsWith(".md")).toBe(true)
  }
})
```

- [ ] **Step 8.2: Run the test and verify it fails**

```bash
cd site && bun test scripts/build-manifest.test.ts
```

Expected: FAIL with module-not-found error.

- [ ] **Step 8.3: Write `site/scripts/build-manifest.ts`**

```ts
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"

interface ManifestInput {
  siteBase: string
  callVersion: string
}

interface Manifest {
  siteBase: string
  callVersion: string
  spec: { html: string; markdown: string }
  guides: Array<{ name: string; html: string; markdown: string }>
  packages: Array<{ name: string; registry: string; url: string }>
}

export function buildManifest(input: ManifestInput): Manifest {
  const { siteBase, callVersion } = input
  return {
    siteBase,
    callVersion,
    spec: {
      html: `${siteBase}/spec/`,
      markdown: `${siteBase}/spec/index.md`,
    },
    guides: [
      {
        name: "client",
        html: `${siteBase}/spec/client/`,
        markdown: `${siteBase}/spec/client.md`,
      },
      {
        name: "comparisons",
        html: `${siteBase}/spec/comparisons/`,
        markdown: `${siteBase}/spec/comparisons.md`,
      },
    ],
    packages: [
      { name: "@opencall/server", registry: "npm", url: "https://www.npmjs.com/package/@opencall/server" },
      { name: "@opencall/client", registry: "npm", url: "https://www.npmjs.com/package/@opencall/client" },
    ],
  }
}

async function main(): Promise<void> {
  const siteBase = process.env.SITE_BASE ?? "https://opencall-api.com"
  const callVersion = process.env.CALL_VERSION ?? "2026-02-10"
  const manifest = buildManifest({ siteBase, callVersion })

  const repoRoot = resolve(import.meta.dir, "..", "..")
  const out = resolve(repoRoot, "site", "dist", ".well-known", "opencall-spec")
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(manifest, null, 2) + "\n", "utf8")
  console.log(`wrote ${out}`)
}

if (import.meta.main) {
  await main()
}
```

- [ ] **Step 8.4: Run the test and verify it passes**

```bash
cd site && bun test scripts/build-manifest.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 8.5: Run the script end-to-end and inspect the output**

```bash
cd site && bun run manifest && cd ..
cat site/dist/.well-known/opencall-spec
```

Expected: a JSON document with `siteBase`, `callVersion`, `spec`, `guides`, and `packages` fields.

- [ ] **Step 8.6: Commit**

```bash
git add site/scripts/build-manifest.ts site/scripts/build-manifest.test.ts
git commit -m "site: build .well-known/opencall-spec manifest"
```

---

### Task 9: Add Cloudflare Pages headers and redirect config

**Files:**
- Create: `site/_headers`
- Create: `site/_redirects`
- Modify: `site/build.sh` (so the files end up in `dist/`)

Cloudflare Pages reads `_headers` and `_redirects` from the deploy artifact root (`site/dist/`). They are plain text files with a documented format.

- [ ] **Step 9.1: Create `site/_headers`**

```
/spec/*.md
  Content-Type: text/markdown; charset=utf-8
  Cache-Control: public, max-age=3600

/.well-known/opencall-spec
  Content-Type: application/json; charset=utf-8
  Cache-Control: public, max-age=300

/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

- [ ] **Step 9.2: Create `site/_redirects`**

```
https://www.opencall-api.com/* https://opencall-api.com/:splat 301!
/spec /spec/ 301
```

The first line forces `www.` to apex. The second normalizes the bare `/spec` URL to the directory-style `/spec/`.

- [ ] **Step 9.3: Update `site/build.sh` to copy `_headers` and `_redirects` into `dist/`**

Open `site/build.sh` and find the `# Copy static assets` block. After the existing `cp` lines, add:

```bash
# Cloudflare Pages config
cp "${SCRIPT_DIR}/_headers" "${DIST}/_headers"
cp "${SCRIPT_DIR}/_redirects" "${DIST}/_redirects"
```

- [ ] **Step 9.4: Verify files copy to `dist/`**

```bash
APP_URL=https://demo.opencall-api.com API_URL=https://api.opencall-api.com bash site/build.sh
ls site/dist/_headers site/dist/_redirects
```

Expected: both files exist in `site/dist/`.

- [ ] **Step 9.5: Commit**

```bash
git add site/_headers site/_redirects site/build.sh
git commit -m "site: add Cloudflare Pages _headers and _redirects"
```

---

### Task 10: Verify the full site build locally

**Files:** none (verification only)

Sanity-check that `bun run build` from `site/` produces the expected `dist/` structure end-to-end.

- [ ] **Step 10.1: Clean any prior dist**

```bash
rm -rf site/dist
```

- [ ] **Step 10.2: Run the full build**

```bash
cd site
APP_URL=https://demo.opencall-api.com API_URL=https://api.opencall-api.com bun run build
cd ..
```

Expected: the build runs `build.sh` then `bun run render` then `bun run manifest` with no errors.

- [ ] **Step 10.3: Verify the dist tree**

```bash
find site/dist -type f | sort
```

Expected output (order may vary):

```
site/dist/.well-known/opencall-spec
site/dist/_headers
site/dist/_redirects
site/dist/assets/...
site/dist/index.html
site/dist/spec/client.md
site/dist/spec/client/index.html
site/dist/spec/comparisons.md
site/dist/spec/comparisons/index.html
site/dist/spec/index.html
site/dist/spec/index.md
site/dist/style.css
```

- [ ] **Step 10.4: Spot-check rendered HTML and raw markdown**

```bash
head -10 site/dist/spec/index.html
head -3 site/dist/spec/index.md
```

Expected: `index.html` starts with `<!doctype html>`. `index.md` starts with `# OpenCALL — Open Command And Lifecycle Layer`.

- [ ] **Step 10.5: Verify the manifest JSON is well-formed**

```bash
cat site/dist/.well-known/opencall-spec | bun -e 'console.log(JSON.parse(await Bun.stdin.text()))'
```

Expected: the manifest prints as a parsed object with no error.

- [ ] **Step 10.6: No commit for this task**

This is verification only.

---

### Task 11: Add the GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy-site.yml`

The workflow runs on push to `main` (and on workflow_dispatch). It builds the site and deploys to Cloudflare Pages using the `cloudflare/wrangler-action` with a scoped API token stored in repo secrets.

- [ ] **Step 11.1: Create `.github/workflows/deploy-site.yml`**

```yaml
name: Deploy site to Cloudflare Pages

on:
  push:
    branches: [main]
    paths:
      - "site/**"
      - "specification.md"
      - "client.md"
      - "comparisons.md"
      - ".github/workflows/deploy-site.yml"
  workflow_dispatch:

permissions:
  contents: read
  deployments: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout repo (with submodules)
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install site dependencies
        run: bun install --cwd site

      - name: Run site tests
        run: bun test --cwd site

      - name: Build site
        env:
          APP_URL: https://demo.opencall-api.com
          API_URL: https://api.opencall-api.com
        run: bun run --cwd site build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy site/dist --project-name=opencall-api-site --branch=main
```

- [ ] **Step 11.2: Validate the YAML syntax**

```bash
bun -e "console.log(Bun.YAML?.parse ?? 'no-bun-yaml')" 2>/dev/null || echo "skip yaml check"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-site.yml'))" && echo "yaml ok"
```

Expected: `yaml ok` (or, if Python yaml is unavailable, manually scan for indentation issues).

- [ ] **Step 11.3: Commit**

```bash
git add .github/workflows/deploy-site.yml
git commit -m "ci: deploy site to Cloudflare Pages on push to main"
```

---

### Task 12: Create the Cloudflare Pages project and configure DNS + secrets

**Files:** none (manual user actions in Cloudflare and GitHub UIs).

The workflow assumes a Pages project named `opencall-api-site` and two repo secrets: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Set these up before pushing.

- [ ] **Step 12.1: Create the Cloudflare API token (manual)**

In the Cloudflare dashboard, *My Profile → API Tokens → Create Token → Custom Token*. Permissions:

- `Account` → `Cloudflare Pages` → `Edit`
- `Zone` → `Zone` → `Read` (scoped to `opencall-api.com`)
- `Zone` → `DNS` → `Edit` (only if you want CI to manage DNS; otherwise skip)

Account resources: include the user's account. Zone resources: include `opencall-api.com`. Save the token value — it is shown once.

- [ ] **Step 12.2: Add repo secrets in GitHub**

Manual step. In `https://github.com/opencall-api/call-api/settings/secrets/actions`, add:

- `CLOUDFLARE_API_TOKEN` — the token from Step 12.1.
- `CLOUDFLARE_ACCOUNT_ID` — found in the Cloudflare dashboard URL or under *Workers & Pages → Overview*.

- [ ] **Step 12.3: Create the Cloudflare Pages project (manual)**

In the Cloudflare dashboard, *Workers & Pages → Create → Pages → Direct Upload*. Name the project exactly `opencall-api-site` (must match the workflow). Skip the initial upload — the GitHub Actions deploy will populate it.

(Direct Upload mode is preferred over Git integration here because the workflow does the build with the right env and tests; we don't want Cloudflare's auto-build re-running.)

- [ ] **Step 12.4: Bind the apex and `www` hostnames to the project**

In the Pages project, *Custom domains → Set up a custom domain*:

- Add `opencall-api.com`. Cloudflare will configure the DNS automatically since the zone is in this account.
- Add `www.opencall-api.com`. The `_redirects` file handles the actual redirect; the hostname binding is so Cloudflare accepts requests on it.

- [ ] **Step 12.5: Confirm bot management is permissive**

In *Security → Bots* for the `opencall-api.com` zone, confirm Bot Fight Mode is **off** (the user has already disabled it). If it's on, turn it off — agents must be able to fetch the canonical docs.

- [ ] **Step 12.6: No commit for this task**

All changes are external. Continue to Task 13.

---

### Task 13: First deploy and verification

**Files:** none (push triggers CI; verification only).

- [ ] **Step 13.1: Push the accumulated commits to `opencall-api/call-api`**

```bash
git push origin main
```

Expected: the push succeeds against the canonical remote URL (set in Task 2).

- [ ] **Step 13.2: Watch the deploy workflow**

```bash
gh run watch --repo opencall-api/call-api
```

Expected: the `Deploy site to Cloudflare Pages` workflow completes with status `success`.

- [ ] **Step 13.3: Verify the apex serves the brochure**

```bash
curl -sI https://opencall-api.com/ | head -5
curl -sS https://opencall-api.com/ | head -20
```

Expected: HTTP 200, content-type `text/html`, body starts with `<!DOCTYPE html>`.

- [ ] **Step 13.4: Verify the spec renders at `/spec/`**

```bash
curl -sI https://opencall-api.com/spec/ | head -5
curl -sS https://opencall-api.com/spec/ | grep -E "OpenCALL|<h1" | head -3
```

Expected: HTTP 200, the page contains the spec title.

- [ ] **Step 13.5: Verify raw markdown is served with the right content-type**

```bash
curl -sI https://opencall-api.com/spec/index.md | grep -i "content-type"
curl -sI https://opencall-api.com/spec/client.md | grep -i "content-type"
```

Expected: `content-type: text/markdown; charset=utf-8` for both.

- [ ] **Step 13.6: Verify the `.well-known` manifest**

```bash
curl -sS https://opencall-api.com/.well-known/opencall-spec | head -20
```

Expected: a valid JSON document with `siteBase`, `callVersion`, `spec`, `guides`, `packages`.

- [ ] **Step 13.7: Verify the `www` redirect to apex**

```bash
curl -sI https://www.opencall-api.com/ | head -5
```

Expected: HTTP 301 with `location: https://opencall-api.com/`.

- [ ] **Step 13.8: Verify a custom user-agent is not blocked**

```bash
curl -sI -A "opencall-test-bot/1.0" https://opencall-api.com/spec/index.md | head -5
```

Expected: HTTP 200 (no challenge, no block).

- [ ] **Step 13.9: No commit for this task**

Verification only. Any failure here points back at Tasks 11 or 12; fix and re-push.

---

### Task 14: Set branch protection on `main`

**Files:** none (manual GitHub UI step).

Branch protection prevents force-pushes and direct pushes from anyone but the user, and requires CI to pass on PRs from external contributors.

- [ ] **Step 14.1: Open branch protection settings**

Manual step. Navigate to `https://github.com/opencall-api/call-api/settings/branches → Add branch protection rule`.

- [ ] **Step 14.2: Configure the rule for `main`**

- *Branch name pattern:* `main`
- *Require a pull request before merging:* ON
  - *Require approvals:* 0 (single-maintainer project; raise later when there are co-maintainers)
- *Require status checks to pass before merging:* ON
  - Add the `Deploy site to Cloudflare Pages` workflow once it has run at least once and shows up as a selectable check.
- *Require linear history:* ON
- *Do not allow force pushes:* ON
- *Allow administrators to bypass:* OFF (the user can still merge their own PRs; bypass would only be used for emergencies)

- [ ] **Step 14.3: Verify the rule is active**

```bash
gh api repos/opencall-api/call-api/branches/main/protection --jq '.required_status_checks, .required_linear_history'
```

Expected: a JSON document showing the configured checks and `"enabled": true` for linear history.

- [ ] **Step 14.4: No commit for this task**

External configuration. Continue to Task 15.

---

### Task 15: Retire the Firebase `target: www` deploy

**Files:**
- Modify: `demo/firebase.json`
- Modify: `demo/.firebaserc` (if it has a `www` site target)

Only `target: www` is retired; `agents`, `app`, and any other Firebase targets stay on Firebase per the strategy doc.

- [ ] **Step 15.1: Inspect the current Firebase config**

```bash
cat demo/firebase.json
cat demo/.firebaserc 2>/dev/null
```

Note which `target` entries are present and which Firebase site each maps to.

- [ ] **Step 15.2: Remove the `www` target from `demo/firebase.json`**

Open `demo/firebase.json` in the `Edit` tool. Find the object inside the `hosting` array whose `target` is `www` and remove that entire object. Leave the other targets (`agents`, etc.) untouched.

After the edit, `hosting` should be a JSON array missing the `www` entry. The other entries are unchanged.

- [ ] **Step 15.3: Remove the `www` site target from `.firebaserc`**

If `demo/.firebaserc` has a `targets` block that maps `www` to a Firebase site name, remove the `www` key from that mapping. Leave other site mappings alone. If there is no such block or the file does not exist, skip this step.

- [ ] **Step 15.4: User disables the Firebase `www` site**

Manual step. In the Firebase console (`https://console.firebase.google.com/project/opencall-web/hosting/sites`), select the site that was the `www` target and click *Disable*. (Do not delete it — disabling preserves the site name for safety; re-enable is reversible.)

This step prevents Firebase from continuing to serve stale content if anyone (or a stale CI workflow) deploys to it.

- [ ] **Step 15.5: Verify Firebase is no longer the source of truth for the apex**

```bash
dig +short opencall-api.com
dig +short www.opencall-api.com
```

Expected: both resolve to Cloudflare IPs (a few `104.x.x.x` or `172.x.x.x` addresses), not Firebase IPs.

```bash
curl -sI https://opencall-api.com/ | grep -iE "server|cf-ray" | head -3
```

Expected: a `cf-ray:` header is present (proof Cloudflare served the response).

- [ ] **Step 15.6: Commit**

```bash
git add demo/firebase.json demo/.firebaserc
git commit -m "Retire Firebase www target; canonical hosting moved to Cloudflare"
```

(`demo/.firebaserc` is included only if it changed.)

- [ ] **Step 15.7: Push**

```bash
git push origin main
```

Expected: push succeeds. The deploy-site workflow runs but should be a no-op for Firebase changes; no Cloudflare deployment is triggered unless `site/` or root markdown changed.

---

## Done When

- [ ] `git remote -v` shows `git@github.com:opencall-api/call-api.git` for `origin`.
- [ ] `git config --file .gitmodules --get submodule.tooling/typescript.url` shows `git@github.com:opencall-api/ts-tools.git`.
- [ ] `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md` exist at repo root.
- [ ] `README.md` opens with the canonical-docs banner.
- [ ] `site/` exists at repo root; `demo/www/` no longer exists.
- [ ] `bun test --cwd site` passes (render and manifest tests).
- [ ] `bun run --cwd site build` produces `site/dist/` with `index.html`, `spec/index.html`, `spec/index.md`, `spec/client.md`, `spec/comparisons.md`, `_headers`, `_redirects`, and `.well-known/opencall-spec`.
- [ ] `https://opencall-api.com/` returns 200 with the brochure HTML.
- [ ] `https://opencall-api.com/spec/index.md` returns 200 with `Content-Type: text/markdown`.
- [ ] `https://opencall-api.com/.well-known/opencall-spec` returns valid JSON.
- [ ] `https://www.opencall-api.com/` 301-redirects to the apex.
- [ ] `main` branch is protected (no force pushes, no direct pushes).
- [ ] Firebase `target: www` is removed from `demo/firebase.json`; the matching Firebase site is disabled.

## Out of Scope (deferred to follow-up plans)

- `@opencall/server@0.2.0` publishing (Phase 1a in the strategy doc — its own plan).
- `@opencall/client@0.1.0` codegen and publishing (Phase 1b — its own plan).
- Migrating other Firebase targets (`agents`, `app`) off Firebase — separate, later effort.
- Adding code highlighting, TOC, or dark mode to the rendered spec pages — nice to have, not blocking.
- Pulling submodule SDK READMEs into `/spec/sdk/{lang}/` — meaningful only after Phase 1 plans land and the submodules contain those READMEs.
