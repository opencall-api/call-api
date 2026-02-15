import { escapeHtml, formatDate } from '../utils';
import { callApi } from '../api';
import { showLoading, renderError, renderScopeError } from '../ui';

let historyState = {
  limit: 20,
  offset: 0,
  total: 0,
};

export async function initAccount() {
  const content = document.getElementById('account-content');
  if (!content) return;

  showLoading(content, 'Loading account data...');

  // Fetch patron data, history, and reservations in parallel
  const [patronResult, historyResult, reservationsResult] = await Promise.all([
    callApi('v1:patron.get'),
    callApi('v1:patron.history', { limit: 20, offset: 0 }),
    callApi('v1:patron.reservations', { limit: 20, offset: 0 }),
  ]);

  if (patronResult.data?.state === 'error') {
    renderError(content, patronResult.data.error);
    return;
  }

  const patron = patronResult.data?.result || patronResult.data;
  const history = historyResult.data?.result || historyResult.data;
  const reservations = reservationsResult.data?.result || reservationsResult.data;

  let html = '';

  // Patron info card
  html += '<div class="card mb-3">' +
    '<div class="d-flex align-center gap-3">' +
      '<div>' +
        '<div class="text-mono font-bold" style="font-size:1.3rem; letter-spacing:0.05em">' + escapeHtml(patron.cardNumber || '') + '</div>' +
        '<div class="text-muted text-sm">' + escapeHtml(patron.patronName || '') + '</div>' +
      '</div>' +
      '<div class="ml-2 d-flex gap-2 flex-wrap">' +
        '<span class="badge badge-info">' + (patron.totalCheckedOut || 0) + ' checked out</span>' +
        '<span class="badge badge-accepted">' + (patron.activeReservations || 0) + ' reserved</span>' +
        (patron.totalOverdue > 0 ? '<span class="badge badge-overdue">' + patron.totalOverdue + ' overdue</span>' : '') +
      '</div>' +
    '</div>' +
  '</div>';

  // Overdue items section
  if (patron.overdueItems && patron.overdueItems.length > 0) {
    html += '<h3 class="mb-2">Overdue Items</h3>';
    html += '<div class="overdue-list mb-4" id="overdue-list">';

    patron.overdueItems.forEach(function(item: any) {
      html += '<div class="overdue-item" id="overdue-' + escapeHtml(item.itemId) + '">' +
        '<div class="overdue-item-info">' +
          '<div class="overdue-item-title">' + escapeHtml(item.title || 'Unknown Item') + '</div>' +
          '<div class="overdue-item-meta">' +
            'Due: ' + formatDate(item.dueDate) +
            (item.daysLate ? ' (' + item.daysLate + ' days late)' : '') +
          '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-danger" onclick="returnItem(\'' + escapeHtml(item.itemId) + '\')">' +
          'Return' +
        '</button>' +
      '</div>';
    });

    html += '</div>';
  }

  // Reservations section
  html += '<h3 class="mb-2">Reservations</h3>';

  if (reservations?.reservations && reservations.reservations.length > 0) {
    html += '<div style="overflow-x:auto">' +
      '<table class="history-table">' +
      '<thead><tr>' +
        '<th>Title</th>' +
        '<th>Creator</th>' +
        '<th>Reserved</th>' +
        '<th>Status</th>' +
      '</tr></thead><tbody>';

    reservations.reservations.forEach(function(res: any) {
      var statusBadge = '';
      switch (res.status) {
        case 'pending':
          statusBadge = '<span class="badge badge-pending">Pending</span>';
          break;
        case 'ready':
          statusBadge = '<span class="badge badge-accepted">Ready for Pickup</span>';
          break;
        case 'collected':
          statusBadge = '<span class="badge badge-complete">Collected</span>';
          break;
        case 'cancelled':
          statusBadge = '<span class="badge badge-error">Cancelled</span>';
          break;
        default:
          statusBadge = '<span class="badge">' + escapeHtml(res.status) + '</span>';
      }

      html += '<tr>' +
        '<td><a href="/catalog/' + escapeHtml(res.itemId) + '">' + escapeHtml(res.title || '') + '</a></td>' +
        '<td>' + escapeHtml(res.creator || '') + '</td>' +
        '<td>' + formatDate(res.reservedAt) + '</td>' +
        '<td>' + statusBadge + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';
  } else {
    html += '<div class="empty-state">' +
      '<div class="empty-icon">&#128278;</div>' +
      '<div class="empty-title">No reservations</div>' +
      '<div class="empty-text">Reserve items from the <a href="/catalog">catalog</a> to see them here.</div>' +
    '</div>';
  }

  // Lending history section
  html += '<h3 class="mb-2" style="margin-top:1.5rem">Lending History</h3>';

  if (history?.records && history.records.length > 0) {
    html += '<div style="overflow-x:auto">' +
      '<table class="history-table">' +
      '<thead><tr>' +
        '<th>Title</th>' +
        '<th>Checkout</th>' +
        '<th>Due</th>' +
        '<th>Returned</th>' +
        '<th>Status</th>' +
      '</tr></thead><tbody>';

    history.records.forEach(function(record: any) {
      const isOverdue = !record.returnDate && record.daysLate > 0;
      const isActive = !record.returnDate && !isOverdue;

      let statusBadge = '';
      if (record.returnDate) {
        statusBadge = '<span class="badge badge-complete">Returned</span>';
        if (record.daysLate > 0) {
          statusBadge += ' <span class="badge badge-overdue">' + record.daysLate + 'd late</span>';
        }
      } else if (isOverdue) {
        statusBadge = '<span class="badge badge-overdue">Overdue</span>';
      } else {
        statusBadge = '<span class="badge badge-pending">Active</span>';
      }

      html += '<tr>' +
        '<td>' + escapeHtml(record.title || record.itemId || '') + '</td>' +
        '<td>' + formatDate(record.checkoutDate) + '</td>' +
        '<td>' + formatDate(record.dueDate) + '</td>' +
        '<td>' + (record.returnDate ? formatDate(record.returnDate) : '--') + '</td>' +
        '<td>' + statusBadge + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';

    // History pagination
    const histTotal = history.total || 0;
    const histOffset = history.offset || 0;
    const histLimit = history.limit || 20;
    html += '<div id="history-pagination" data-total="' + histTotal + '" data-offset="' + histOffset + '" data-limit="' + histLimit + '"></div>';
  } else {
    html += '<div class="empty-state">' +
      '<div class="empty-icon">&#128214;</div>' +
      '<div class="empty-title">No lending history</div>' +
      '<div class="empty-text">Your borrowing history will appear here.</div>' +
    '</div>';
  }

  content.innerHTML = html;

  // Render history pagination
  renderHistoryPagination(history);
}

function renderHistoryPagination(history: any) {
  if (!history) return;
  historyState.total = history.total || 0;
  historyState.offset = history.offset || 0;
  historyState.limit = history.limit || 20;

  const el = document.getElementById('history-pagination');
  if (!el) return;

  const start = historyState.offset + 1;
  const end = Math.min(historyState.offset + historyState.limit, historyState.total);
  const hasPrev = historyState.offset > 0;
  const hasNext = historyState.offset + historyState.limit < historyState.total;

  el.innerHTML = '<div class="pagination">' +
    '<span class="pagination-info">' +
      (historyState.total > 0 ? start + '-' + end + ' of ' + historyState.total + ' records' : 'No records') +
    '</span>' +
    '<div class="pagination-buttons">' +
      '<button class="btn btn-sm btn-secondary" onclick="historyPrev()"' + (hasPrev ? '' : ' disabled') + '>Previous</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="historyNext()"' + (hasNext ? '' : ' disabled') + '>Next</button>' +
    '</div>' +
  '</div>';
}

async function historyPrev() {
  if (historyState.offset <= 0) return;
  historyState.offset = Math.max(0, historyState.offset - historyState.limit);
  await initAccount();
}

async function historyNext() {
  if (historyState.offset + historyState.limit >= historyState.total) return;
  historyState.offset += historyState.limit;
  await initAccount();
}

async function returnItem(itemId: string) {
  const itemEl = document.getElementById('overdue-' + itemId);
  const btn = itemEl?.querySelector('button') as HTMLButtonElement | null;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  }

  const result = await callApi('v1:item.return', { itemId: itemId });

  if (result.data?.state === 'error') {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Return';
    }

    const error = result.data.error;
    if (error?.code === 'INSUFFICIENT_SCOPES') {
      if (itemEl) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'mt-1';
        renderScopeError(errorDiv, error);
        itemEl.appendChild(errorDiv);
      }
    } else {
      alert((error?.code || 'Error') + ': ' + (error?.message || 'Failed to return item.'));
    }
    return;
  }

  // Success - update the UI
  if (itemEl) {
    const returnData = result.data?.result || result.data;
    itemEl.innerHTML = '<div class="overdue-item-info">' +
      '<div class="overdue-item-title text-success">' + escapeHtml(returnData.title || 'Item') + ' -- Returned!</div>' +
      '<div class="overdue-item-meta">' + escapeHtml(returnData.message || '') + '</div>' +
    '</div>' +
    '<span class="badge badge-complete">Done</span>';
    itemEl.style.borderLeftColor = 'var(--success)';
  }
}

(window as any).returnItem = returnItem;
(window as any).historyPrev = historyPrev;
(window as any).historyNext = historyNext;
