import { test, expect } from "bun:test"
import { lastSegment, slugify, addHeadingIds, extractTitle } from "../src/spec"

test("lastSegment of /spec is 'spec'", () => {
  expect(lastSegment("/spec")).toBe("spec")
  expect(lastSegment("/spec/")).toBe("spec")
})

test("lastSegment of /spec/client is 'client'", () => {
  expect(lastSegment("/spec/client")).toBe("client")
  expect(lastSegment("/spec/client/")).toBe("client")
})

test("lastSegment of /spec/comparisons is 'comparisons'", () => {
  expect(lastSegment("/spec/comparisons")).toBe("comparisons")
})

test("lastSegment of / falls back to 'spec'", () => {
  expect(lastSegment("/")).toBe("spec")
  expect(lastSegment("")).toBe("spec")
})

test("slugify lowercases, strips punctuation, hyphenates spaces", () => {
  expect(slugify("Hello World")).toBe("hello-world")
  expect(slugify("Path-Based Operation Endpoint")).toBe("path-based-operation-endpoint")
  expect(slugify("HTTP(S) Binding")).toBe("https-binding")
})

test("addHeadingIds attaches id and anchor link to h1-h6", () => {
  const html = addHeadingIds("<h2>Caching</h2><h3>Subsection</h3>")
  expect(html).toContain('<h2 id="caching">')
  expect(html).toContain('<h3 id="subsection">')
  expect(html).toContain('href="#caching"')
})

test("extractTitle returns the first level-1 heading", () => {
  expect(extractTitle("# OpenCALL Specification\n\nbody")).toBe("OpenCALL Specification")
  expect(extractTitle("intro\n\n# Title\n")).toBe("Title")
  expect(extractTitle("no heading here")).toBeNull()
})
