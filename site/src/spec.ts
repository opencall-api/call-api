import { marked } from "marked"

marked.setOptions({ gfm: true })

const SLUG_REPLACE = [/[^\w\s-]/g, /\s+/g, /-+/g, /^-|-$/g] as const

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(SLUG_REPLACE[0], "")
    .replace(SLUG_REPLACE[1], "-")
    .replace(SLUG_REPLACE[2], "-")
    .replace(SLUG_REPLACE[3], "")
}

function addHeadingIds(html: string): string {
  return html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/g, (_match, tag, inner) => {
    const text = inner.replace(/<[^>]+>/g, "")
    const id = slugify(text)
    return `<${tag} id="${id}"><a href="#${id}" class="heading-anchor">${inner}</a></${tag}>`
  })
}

function extractTitle(md: string): string | null {
  const match = md.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

function lastSegment(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "")
  const parts = trimmed.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? "spec"
}

async function load(): Promise<void> {
  const target = document.getElementById("content")
  if (!target) return

  const segment = lastSegment(window.location.pathname)
  const mdUrl = `/${segment}.md`

  try {
    const res = await fetch(mdUrl, { headers: { Accept: "text/markdown,text/plain;q=0.9" } })
    if (!res.ok) {
      target.innerHTML = `<h1>Not found</h1><p>Could not load <code>${mdUrl}</code> (HTTP ${res.status}).</p>`
      return
    }
    const md = await res.text()
    const html = addHeadingIds((await marked.parse(md)) as string)
    target.innerHTML = html

    const title = extractTitle(md)
    if (title) document.title = `${title} — OpenCALL`

    if (window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1))
      const el = document.getElementById(id)
      if (el) el.scrollIntoView()
    }
  } catch (err) {
    target.innerHTML = `<h1>Error</h1><p>Failed to render <code>${mdUrl}</code>: ${(err as Error).message}</p>`
  }
}

if (typeof document !== "undefined") {
  void load()
}

export { lastSegment, slugify, addHeadingIds, extractTitle }
