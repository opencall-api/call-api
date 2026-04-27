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
