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
