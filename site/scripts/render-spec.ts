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
