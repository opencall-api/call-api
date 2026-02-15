export function debounce(fn: Function, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return function (this: any, ...args: any[]) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, ms);
  };
}

export function maskToken(token: string | null): string {
  if (!token) return '***';
  const idx = token.indexOf('_');
  if (idx === -1) return '***';
  return token.slice(0, idx + 1) + '***';
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '--';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export async function copyToClipboard(text: string, btn?: HTMLElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1500);
    }
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    if (btn) {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove('copied');
      }, 1500);
    }
  }
}

export function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function syntaxHighlight(json: any, indent?: number, collapsed?: boolean): string {
  indent = indent || 0;
  collapsed = collapsed || false;
  const pad = '  '.repeat(indent);
  const padInner = '  '.repeat(indent + 1);

  if (json === null) {
    return '<span class="json-null">null</span>';
  }

  const type = typeof json;

  if (type === 'string') {
    return '<span class="json-string">"' + escapeHtml(json) + '"</span>';
  }

  if (type === 'number') {
    return '<span class="json-number">' + json + '</span>';
  }

  if (type === 'boolean') {
    return '<span class="json-boolean">' + json + '</span>';
  }

  if (Array.isArray(json)) {
    if (json.length === 0) {
      return '<span class="json-bracket">[]</span>';
    }

    const items = json.map((item, i) => {
      const comma = i < json.length - 1 ? ',' : '';
      return padInner + syntaxHighlight(item, indent! + 1) + comma;
    });

    const id = 'json-' + Math.random().toString(36).slice(2, 8);
    const count = json.length;

    return '<span class="json-bracket json-collapsible" onclick="toggleJsonCollapse(\'' + id + '\')">[</span>' +
      '<span class="json-ellipsis" id="' + id + '-ellipsis"> ' + count + ' items... </span>' +
      '<span class="json-content" id="' + id + '">\n' +
      items.join('\n') + '\n' +
      pad + '</span><span class="json-bracket">]</span>';
  }

  if (type === 'object') {
    const keys = Object.keys(json);
    if (keys.length === 0) {
      return '<span class="json-bracket">{}</span>';
    }

    const entries = keys.map((key, i) => {
      const comma = i < keys.length - 1 ? ',' : '';
      return padInner +
        '<span class="json-key">"' + escapeHtml(key) + '"</span>: ' +
        syntaxHighlight(json[key], indent! + 1) + comma;
    });

    const id = 'json-' + Math.random().toString(36).slice(2, 8);
    const count = keys.length;

    return '<span class="json-bracket json-collapsible" onclick="toggleJsonCollapse(\'' + id + '\')">{</span>' +
      '<span class="json-ellipsis" id="' + id + '-ellipsis"> ' + count + ' keys... </span>' +
      '<span class="json-content" id="' + id + '">\n' +
      entries.join('\n') + '\n' +
      pad + '</span><span class="json-bracket">}</span>';
  }

  return escapeHtml(String(json));
}

export function toggleJsonCollapse(id: string) {
  const content = document.getElementById(id);
  const ellipsis = document.getElementById(id + '-ellipsis');
  if (!content) return;

  if (content.style.display === 'none') {
    content.style.display = '';
    if (ellipsis) ellipsis.style.display = 'none';
  } else {
    content.style.display = 'none';
    if (ellipsis) ellipsis.style.display = 'inline';
  }
}

// Make toggleJsonCollapse available globally for onclick handlers
(window as any).toggleJsonCollapse = toggleJsonCollapse;
