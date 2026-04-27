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
