import { escapeHtml, syntaxHighlight, copyToClipboard } from './utils';

// Map<number, RequestEntry> -- keyed by timestamp for chronological sorting
let requests = new Map<number, any>();

// Map<string, ResponseEntry[]> -- keyed by requestId, ARRAY for polling chain
let responses = new Map<string, any[]>();

// Currently selected request timestamp
let selectedRequestTimestamp: number | null = null;

// Monotonic counter to avoid timestamp collisions when parallel calls resolve in the same ms
let requestSeq = 0;

export function addRequest(entry: any) {
  let key = entry.timestamp;
  while (requests.has(key)) {
    key = entry.timestamp + (++requestSeq) * 0.001;
  }
  entry.timestamp = key;
  requests.set(key, entry);
  selectedRequestTimestamp = key;
}

export function addResponse(requestId: string, entry: any) {
  if (!responses.has(requestId)) {
    responses.set(requestId, []);
  }
  responses.get(requestId)!.push(entry);
}

export function clearEnvelopeViewer() {
  requests = new Map();
  responses = new Map();
  selectedRequestTimestamp = null;
  renderEnvelopeViewer();
}

function getSortedRequestTimestamps(): number[] {
  return Array.from(requests.keys()).sort((a, b) => b - a);
}

// Viewer collapsed state
let viewerCollapsed = false;

function selectRequest(timestamp: number) {
  selectedRequestTimestamp = timestamp;
  renderEnvelopeViewer();
}

function envelopePrev() {
  const timestamps = getSortedRequestTimestamps();
  const idx = timestamps.indexOf(selectedRequestTimestamp!);
  if (idx < timestamps.length - 1) {
    selectedRequestTimestamp = timestamps[idx + 1];
    renderEnvelopeViewer();
  }
}

function envelopeNext() {
  const timestamps = getSortedRequestTimestamps();
  const idx = timestamps.indexOf(selectedRequestTimestamp!);
  if (idx > 0) {
    selectedRequestTimestamp = timestamps[idx - 1];
    renderEnvelopeViewer();
  }
}

function toggleViewerCollapse() {
  viewerCollapsed = !viewerCollapsed;
  renderEnvelopeViewer();
}

function statusColorClass(status: number): string {
  if (status === 202) return 'status-accepted';
  if (status === 303) return 'status-redirect';
  if (status >= 200 && status < 300) return 'status-ok';
  if (status >= 400 && status < 500) return 'status-error';
  if (status >= 500) return 'status-server-error';
  return '';
}

function copyAsCurl(timestamp: number, btn: HTMLElement) {
  const req = requests.get(timestamp);
  if (!req) return;

  const method = req.method || 'POST';
  const url = req.url || '/call';
  let curl = 'curl -X ' + method + " '" + url + "'";

  if (req.headers) {
    Object.entries(req.headers).forEach(function(pair) {
      curl += " \\\n  -H '" + pair[0] + ': ' + pair[1] + "'";
    });
  }
  if (req.body) {
    curl += " \\\n  -d '" + JSON.stringify(req.body) + "'";
  }

  copyToClipboard(curl, btn);
}

function renderRequestSection(req: any): string {
  if (!req) return '<div class="empty-viewer" style="height:auto;padding:1rem">No request data</div>';

  let html = '';

  html += '<div class="meta-row">' +
    '<span class="meta-label">Method</span>' +
    '<span class="meta-value">' + escapeHtml(req.method || 'POST') + '</span>' +
  '</div>';

  html += '<div class="meta-row">' +
    '<span class="meta-label">URL</span>' +
    '<span class="meta-value">' + escapeHtml(req.url || '/call') + '</span>' +
  '</div>';

  if (req.headers) {
    html += '<div class="meta-row">' +
      '<span class="meta-label">Auth</span>' +
      '<span class="meta-value">' + escapeHtml(req.headers.Authorization || 'none') + '</span>' +
    '</div>';
  }

  if (req.body) {
    html += '<div class="json-viewer">' +
      '<pre class="code-block">' + syntaxHighlight(req.body) + '</pre>' +
    '</div>';
  }

  return html;
}

export function renderEnvelopeViewer() {
  const viewer = document.getElementById('envelope-viewer');
  if (!viewer) return;

  if (requests.size === 0) {
    viewer.innerHTML =
      '<div class="viewer-header">' +
        '<span class="viewer-title">Envelope Viewer</span>' +
      '</div>' +
      '<div class="empty-viewer">' +
        '<div class="empty-icon">{ }</div>' +
        '<div>Make an API call to see the<br>request and response envelopes here.</div>' +
      '</div>';
    return;
  }

  const collapseIcon = viewerCollapsed ? '\u25b6' : '\u25bc';
  const timestamps = getSortedRequestTimestamps();
  const currentIdx = timestamps.indexOf(selectedRequestTimestamp!);
  const total = timestamps.length;
  const prevDisabled = currentIdx >= total - 1;
  const nextDisabled = currentIdx <= 0;

  // Header
  let html = '<div class="viewer-header">' +
    '<span class="viewer-title">' +
      '<button class="btn-collapse" onclick="toggleViewerCollapse()">' + collapseIcon + '</button>' +
      ' Envelope Viewer' +
    '</span>' +
    '<div class="viewer-nav">' +
      '<button class="btn btn-sm btn-nav" onclick="envelopePrev()"' + (prevDisabled ? ' disabled' : '') + '>&lsaquo;</button>' +
      '<span class="viewer-counter">' + (currentIdx + 1) + '/' + total + '</span>' +
      '<button class="btn btn-sm btn-nav" onclick="envelopeNext()"' + (nextDisabled ? ' disabled' : '') + '>&rsaquo;</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="clearEnvelopeViewer()">Clear</button>' +
    '</div>' +
  '</div>';

  if (viewerCollapsed) {
    viewer.innerHTML = html;
    return;
  }

  // Request list panel
  html += '<div class="viewer-requests">';
  timestamps.forEach(function(ts) {
    const req = requests.get(ts);
    const opName = req?.body?.op || req?.op || 'call';
    const requestId = req?.requestId;
    const chain = requestId ? (responses.get(requestId) || []) : [];
    const lastResp = chain.length > 0 ? chain[chain.length - 1] : null;
    const status = lastResp ? lastResp.status : '';
    const elapsed = lastResp ? (lastResp.timeMs || 0) : '';
    const colorClass = status ? statusColorClass(status) : '';
    const selected = ts === selectedRequestTimestamp ? ' selected' : '';
    const arrow = ts === selectedRequestTimestamp ? '\u25b9' : '\u25b8';

    html += '<div class="viewer-request-row' + selected + '" onclick="selectRequest(' + ts + ')">' +
      '<span class="row-arrow">' + arrow + '</span>' +
      '<span class="row-op">' + escapeHtml(opName) + '</span>' +
      '<span class="row-status ' + colorClass + '">' + status + '</span>' +
      '<span class="row-time">' + (elapsed ? elapsed + 'ms' : '') + '</span>' +
    '</div>';
  });
  html += '</div>';

  // Detail panel -- request then response(s) stacked
  const currentRequest = requests.get(selectedRequestTimestamp!);
  const requestId = currentRequest?.requestId;
  const responseChain = requestId ? (responses.get(requestId) || []) : [];

  html += '<div class="viewer-detail">';

  // REQUEST section
  html += '<div class="viewer-section-label">' +
    '<span>REQUEST</span>' +
    '<button class="copy-btn" onclick="copyAsCurl(' + selectedRequestTimestamp + ', this)">Copy cURL</button>' +
  '</div>';
  html += renderRequestSection(currentRequest);

  // RESPONSE section(s)
  if (responseChain.length === 0) {
    html += '<div class="viewer-section-label"><span>RESPONSE</span></div>';
    html += '<div class="empty-viewer" style="height:auto;padding:1rem">Waiting for response\u2026</div>';
  } else {
    responseChain.forEach(function(resp: any, index: number) {
      const total = responseChain.length;
      const status = resp.status || 0;
      const elapsed = resp.timeMs || resp.elapsed || 0;
      const colorClass = statusColorClass(status);
      const label = total > 1
        ? 'RESPONSE ' + (index + 1) + '/' + total
        : 'RESPONSE';
      const textareaId = 'resp-raw-' + index;
      const jsonStr = resp.body ? JSON.stringify(resp.body, null, 2) : '';

      html += '<div class="viewer-section-label' + (index > 0 ? ' chain-divider' : '') + '">' +
        '<span>' + label +
          ' <span class="' + colorClass + '">' + status + '</span>' +
          ' <span class="resp-time">' + elapsed + 'ms</span>' +
        '</span>' +
        '<button class="copy-btn" onclick="copyToClipboard(document.getElementById(\'' + textareaId + '\').value, this)">Copy</button>' +
      '</div>';

      if (resp.body?.state) {
        html += '<div class="meta-row">' +
          '<span class="meta-label">State</span>' +
          '<span class="meta-value">' +
            '<span class="status-indicator status-' + escapeHtml(resp.body.state) + '">' +
              escapeHtml(resp.body.state) +
            '</span>' +
          '</span>' +
        '</div>';
      }

      if (resp.body) {
        html += '<div class="json-viewer">' +
          '<pre class="code-block">' + syntaxHighlight(resp.body) + '</pre>' +
          '<textarea class="sr-only" id="' + textareaId + '">' + escapeHtml(jsonStr) + '</textarea>' +
        '</div>';
      }
    });
  }

  html += '</div>';

  viewer.innerHTML = html;
}

// Make functions globally available
(window as any).clearEnvelopeViewer = clearEnvelopeViewer;
(window as any).selectRequest = selectRequest;
(window as any).envelopePrev = envelopePrev;
(window as any).envelopeNext = envelopeNext;
(window as any).toggleViewerCollapse = toggleViewerCollapse;
(window as any).copyAsCurl = copyAsCurl;
(window as any).copyToClipboard = copyToClipboard;
