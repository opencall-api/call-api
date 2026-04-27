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
