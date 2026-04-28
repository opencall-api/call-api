import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const REPO_ROOT = resolve(import.meta.dir, "..", "..")
const SITE = resolve(REPO_ROOT, "site")
const DIST = resolve(SITE, "dist")
const SRC = resolve(SITE, "src")

interface SpecDoc {
  source: string
  rawOut: string
}

const DOCS: SpecDoc[] = [
  { source: resolve(REPO_ROOT, "specification.md"), rawOut: resolve(DIST, "spec.md") },
  { source: resolve(REPO_ROOT, "client.md"), rawOut: resolve(DIST, "client.md") },
  { source: resolve(REPO_ROOT, "comparisons.md"), rawOut: resolve(DIST, "comparisons.md") },
]

export async function renderSite(): Promise<void> {
  await mkdir(DIST, { recursive: true })

  for (const doc of DOCS) {
    await copyFile(doc.source, doc.rawOut)
    console.log(`copied ${doc.source} → ${doc.rawOut}`)
  }

  const shellHtml = await readFile(resolve(SRC, "spec-shell.html"), "utf8")
  const shellRoutes = [
    resolve(DIST, "spec", "index.html"),
    resolve(DIST, "spec", "client", "index.html"),
    resolve(DIST, "spec", "comparisons", "index.html"),
  ]
  for (const out of shellRoutes) {
    await mkdir(resolve(out, ".."), { recursive: true })
    await writeFile(out, shellHtml, "utf8")
    console.log(`wrote ${out}`)
  }

  const result = await Bun.build({
    entrypoints: [resolve(SRC, "spec.ts")],
    outdir: resolve(DIST, "spec"),
    target: "browser",
    format: "esm",
    minify: true,
  })

  if (!result.success) {
    for (const log of result.logs) console.error(log)
    throw new Error("Bun.build failed for site/src/spec.ts")
  }

  console.log(`bundled ${resolve(DIST, "spec", "spec.js")}`)
}

if (import.meta.main) {
  await renderSite()
}
