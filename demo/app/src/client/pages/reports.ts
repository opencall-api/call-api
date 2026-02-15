import { escapeHtml, formatDateTime } from '../utils';
import { callApi, pollOperation, fetchChunks } from '../api';
import { showLoading } from '../ui';
import { clearEnvelopeViewer } from '../envelope';

let reportState = {
  requestId: null as string | null,
  pollTimer: null as ReturnType<typeof setInterval> | null,
  generating: false,
};

export async function initReports() {
  const content = document.getElementById('reports-content');
  if (!content) return;

  renderReportForm();
}

function renderReportForm() {
  const form = document.getElementById('report-form');
  if (!form) return;

  form.innerHTML =
    '<div class="report-form">' +
      '<div class="form-row">' +
        '<div class="form-group">' +
          '<label for="report-format">Format</label>' +
          '<select class="input" id="report-format">' +
            '<option value="csv">CSV</option>' +
            '<option value="json">JSON</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="report-type">Item Type (optional)</label>' +
          '<select class="input" id="report-type">' +
            '<option value="">All Types</option>' +
            '<option value="book">Books</option>' +
            '<option value="cd">CDs</option>' +
            '<option value="dvd">DVDs</option>' +
            '<option value="boardgame">Board Games</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="report-from">Date From (optional)</label>' +
          '<input type="date" class="input" id="report-from">' +
        '</div>' +
        '<div class="form-group">' +
          '<label for="report-to">Date To (optional)</label>' +
          '<input type="date" class="input" id="report-to">' +
        '</div>' +
      '</div>' +
      '<div>' +
        '<button class="btn btn-primary" id="generate-btn" onclick="generateReport()">Generate Report</button>' +
      '</div>' +
    '</div>';
}

async function generateReport() {
  const btn = document.getElementById('generate-btn') as HTMLButtonElement | null;
  const progressEl = document.getElementById('report-progress');
  const resultEl = document.getElementById('report-result');

  if (reportState.generating) return;
  reportState.generating = true;

  // Clear previous state
  if (reportState.pollTimer) {
    clearInterval(reportState.pollTimer);
    reportState.pollTimer = null;
  }
  reportState.requestId = null;
  if (resultEl) resultEl.innerHTML = '';

  // Get form values
  const format = (document.getElementById('report-format') as HTMLSelectElement)?.value || 'csv';
  const itemType = (document.getElementById('report-type') as HTMLSelectElement)?.value || undefined;
  const dateFrom = (document.getElementById('report-from') as HTMLInputElement)?.value || undefined;
  const dateTo = (document.getElementById('report-to') as HTMLInputElement)?.value || undefined;

  const args: any = { format: format };
  if (itemType) args.itemType = itemType;
  if (dateFrom) args.dateFrom = dateFrom;
  if (dateTo) args.dateTo = dateTo;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating...';
  }

  // Show initial progress
  if (progressEl) {
    progressEl.innerHTML = '<div class="report-progress">' +
      '<div class="progress-step active">' +
        '<span class="step-icon">&#9679;</span>' +
        '<span class="step-label">Submitting request...</span>' +
      '</div>' +
    '</div>';
  }

  // Clear previous envelope exchanges for clean lifecycle view
  clearEnvelopeViewer();

  const result = await callApi('v1:report.generate', args);

  if (result.data?.state === 'error') {
    reportState.generating = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }
    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step failed">' +
          '<span class="step-icon">&#10007;</span>' +
          '<span class="step-label">Failed: ' + escapeHtml(result.data.error?.message || 'Unknown error') + '</span>' +
        '</div>' +
      '</div>';
    }
    return;
  }

  // Handle 202 accepted (async operation)
  if (result.status === 202 || result.data?.state === 'accepted') {
    reportState.requestId = result.data?.requestId;

    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
          '<span class="step-time">' + formatDateTime(new Date().toISOString()) + '</span>' +
        '</div>' +
        '<div class="progress-step active">' +
          '<span class="step-icon">&#8987;</span>' +
          '<span class="step-label">Generating report...</span>' +
        '</div>' +
      '</div>';
    }

    // Start polling
    if (reportState.requestId) {
      const retryMs = result.data?.retryAfterMs || 1000;
      reportState.pollTimer = setInterval(function () {
        pollReportStatus();
      }, retryMs);
    }
  } else {
    // Synchronous completion (unlikely for reports, but handle it)
    reportState.generating = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }
    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Complete</span>' +
        '</div>' +
      '</div>';
    }
  }
}

async function pollReportStatus() {
  if (!reportState.requestId) return;

  const result = await pollOperation(reportState.requestId);
  const state = result.data?.state;

  const progressEl = document.getElementById('report-progress');
  const resultEl = document.getElementById('report-result');
  const btn = document.getElementById('generate-btn') as HTMLButtonElement | null;

  if (state === 'complete') {
    // Stop polling
    if (reportState.pollTimer) {
      clearInterval(reportState.pollTimer);
      reportState.pollTimer = null;
    }
    reportState.generating = false;

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }

    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
        '</div>' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Generated</span>' +
        '</div>' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Complete</span>' +
          '<span class="step-time">' + formatDateTime(new Date().toISOString()) + '</span>' +
        '</div>' +
      '</div>';
    }

    // Show download link and chunks button
    if (resultEl) {
      const downloadUrl = result.data?.location?.uri;
      let html = '<div class="card mt-2">';
      html += '<h4 class="mb-2">Report Ready</h4>';

      if (downloadUrl) {
        html += '<a href="' + escapeHtml(downloadUrl) + '" target="_blank" class="btn btn-success mr-2">Download Report</a>';
      }

      html += '<button class="btn btn-outline" onclick="viewChunks(\'' + escapeHtml(reportState.requestId!) + '\')">View Chunks</button>';
      html += '<div id="chunks-container" class="mt-3"></div>';
      html += '</div>';
      resultEl.innerHTML = html;
    }

  } else if (state === 'error') {
    // Stop polling
    if (reportState.pollTimer) {
      clearInterval(reportState.pollTimer);
      reportState.pollTimer = null;
    }
    reportState.generating = false;

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate Report';
    }

    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
        '</div>' +
        '<div class="progress-step failed">' +
          '<span class="step-icon">&#10007;</span>' +
          '<span class="step-label">Error: ' + escapeHtml(result.data?.error?.message || 'Generation failed') + '</span>' +
        '</div>' +
      '</div>';
    }

  } else if (state === 'pending') {
    // Still in progress, update display
    if (progressEl) {
      progressEl.innerHTML = '<div class="report-progress">' +
        '<div class="progress-step completed">' +
          '<span class="step-icon">&#10003;</span>' +
          '<span class="step-label">Accepted</span>' +
        '</div>' +
        '<div class="progress-step active">' +
          '<span class="step-icon">&#8987;</span>' +
          '<span class="step-label">Generating report...</span>' +
        '</div>' +
      '</div>';
    }
  }
  // else: still accepted, keep polling
}

async function viewChunks(requestId: string) {
  const container = document.getElementById('chunks-container');
  if (!container) return;

  showLoading(container, 'Fetching chunks...');

  const chunks = await fetchChunks(requestId);

  if (chunks.length === 0) {
    container.innerHTML = '<div class="alert alert-warning">No chunks available.</div>';
    return;
  }

  let html = '<div class="chunks-viewer">' +
    '<h4 class="mb-2">Chunked Retrieval (' + chunks.length + ' chunk' + (chunks.length !== 1 ? 's' : '') + ')</h4>';

  let previousChecksum: string | null = null;

  chunks.forEach(function(chunk: any, i: number) {
    // Verify checksum chain
    const chainValid = chunk.checksumPrevious === previousChecksum;
    previousChecksum = chunk.checksum;

    html += '<div class="chunk">' +
      '<div class="chunk-header">' +
        '<span>Chunk ' + (i + 1) + ' / ' + chunks.length + ' | Offset: ' + (chunk.offset || 0) + ' | Length: ' + (chunk.length || 0) + '</span>' +
        '<span class="chunk-checksum' + (chainValid ? '' : ' invalid') + '">' +
          (chainValid ? 'Chain valid' : 'Chain INVALID') +
          ' | ' + escapeHtml((chunk.checksum || '').slice(0, 20)) + '...' +
        '</span>' +
      '</div>' +
      '<div class="chunk-data">' + escapeHtml(chunk.data || '') + '</div>' +
    '</div>';
  });

  html += '</div>';
  container.innerHTML = html;
}

(window as any).generateReport = generateReport;
(window as any).viewChunks = viewChunks;
