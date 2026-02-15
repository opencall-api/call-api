import { escapeHtml } from '../utils';
import { callApi } from '../api';
import { showLoading, renderError, renderScopeError } from '../ui';

export async function initItemDetail() {
  const content = document.getElementById('item-detail-content');
  if (!content) return;

  const itemId = content.getAttribute('data-item-id');
  if (!itemId) {
    content.innerHTML = '<div class="alert alert-danger">No item ID specified.</div>';
    return;
  }

  showLoading(content, 'Loading item details...');

  // Fetch item data and media in parallel
  const [itemResult, mediaResult] = await Promise.all([
    callApi('v1:item.get', { itemId: itemId }),
    callApi('v1:item.getMedia', { itemId: itemId }),
  ]);

  if (itemResult.data?.state === 'error') {
    renderError(content, itemResult.data.error);
    return;
  }

  const item = itemResult.data?.result || itemResult.data;

  // Determine cover image URL
  let coverUrl: string | null = null;
  if (mediaResult.data?.location?.uri) {
    coverUrl = mediaResult.data.location.uri;
  } else if (mediaResult.data?.result?.url) {
    coverUrl = mediaResult.data.result.url;
  }

  const available = item.available || (item.availableCopies > 0);
  const badgeClass = available ? 'badge-available' : 'badge-overdue';
  const badgeText = available ? 'Available' : 'Unavailable';

  let html = '<div class="item-detail">';

  // Cover image
  if (coverUrl) {
    html += '<img class="item-cover" src="' + escapeHtml(coverUrl) + '" alt="Cover image for ' + escapeHtml(item.title || '') + '" onerror="this.outerHTML=\'<div class=item-cover-placeholder>No Cover</div>\'">';
  } else {
    html += '<div class="item-cover-placeholder">No Cover</div>';
  }

  // Item info
  html += '<div class="item-info">';
  html += '<h2>' + escapeHtml(item.title || 'Untitled') + '</h2>';

  // Detail rows
  const details: [string, any][] = [
    ['Type', item.type],
    ['Creator', item.creator],
    ['Year', item.year],
    ['ISBN', item.isbn],
    ['Copies', (item.availableCopies !== undefined ? item.availableCopies : '?') + ' / ' + (item.totalCopies !== undefined ? item.totalCopies : '?') + ' available'],
  ];

  details.forEach(function(pair) {
    if (pair[1]) {
      html += '<div class="detail-row">' +
        '<span class="detail-label">' + escapeHtml(pair[0]) + '</span>' +
        '<span class="detail-value">' + escapeHtml(String(pair[1])) + '</span>' +
      '</div>';
    }
  });

  // Status badge
  html += '<div class="detail-row">' +
    '<span class="detail-label">Status</span>' +
    '<span class="detail-value"><span class="badge ' + badgeClass + '">' + badgeText + '</span></span>' +
  '</div>';

  // Description
  if (item.description) {
    html += '<div class="detail-row">' +
      '<span class="detail-label">Description</span>' +
      '<span class="detail-value">' + escapeHtml(item.description) + '</span>' +
    '</div>';
  }

  // Tags
  const tags = Array.isArray(item.tags) ? item.tags
    : (typeof item.tags === 'string' ? JSON.parse(item.tags || '[]') : []);
  if (tags.length > 0) {
    html += '<div class="detail-row">' +
      '<span class="detail-label">Tags</span>' +
      '<span class="detail-value">';
    tags.forEach(function(tag: string) {
      html += '<span class="badge badge-info mr-2">' + escapeHtml(tag) + '</span>';
    });
    html += '</span></div>';
  }

  // Reserve button
  html += '<div class="card-actions mt-3">' +
    '<button class="btn btn-primary" id="reserve-btn" onclick="reserveItem(\'' + escapeHtml(itemId) + '\')">' +
      'Reserve This Item' +
    '</button>' +
  '</div>';

  // Reservation result area
  html += '<div id="reserve-result" class="mt-2"></div>';

  html += '</div>'; // end item-info
  html += '</div>'; // end item-detail

  content.innerHTML = html;
}

async function reserveItem(itemId: string) {
  const btn = document.getElementById('reserve-btn') as HTMLButtonElement | null;
  const resultEl = document.getElementById('reserve-result');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Reserving...';
  }

  const result = await callApi('v1:item.reserve', { itemId: itemId });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Reserve This Item';
  }

  if (!resultEl) return;

  if (result.data?.state === 'error') {
    const error = result.data.error;

    if (error?.code === 'OVERDUE_ITEMS_EXIST') {
      resultEl.innerHTML = '<div class="alert alert-warning mt-2">' +
        '<strong>Cannot reserve:</strong> You have overdue items that must be returned first. ' +
        '<a href="/account">Go to Account</a> to return them.' +
      '</div>';
    } else if (error?.code === 'ITEM_NOT_AVAILABLE') {
      resultEl.innerHTML = '<div class="alert alert-warning mt-2">' +
        '<strong>Not Available:</strong> There are no copies of this item currently available for reservation.' +
      '</div>';
    } else if (error?.code === 'ALREADY_RESERVED') {
      resultEl.innerHTML = '<div class="alert alert-info mt-2">' +
        'You already have an active reservation for this item.' +
      '</div>';
    } else if (error?.code === 'INSUFFICIENT_SCOPES') {
      renderScopeError(resultEl, error);
    } else {
      renderError(resultEl, error);
    }
    return;
  }

  const reservation = result.data?.result || result.data;
  resultEl.innerHTML = '<div class="alert alert-success mt-2">' +
    'Reserved successfully! Reservation ID: <strong class="text-mono">' +
    escapeHtml(reservation.reservationId || '') + '</strong>' +
    (reservation.message ? ' -- ' + escapeHtml(reservation.message) : '') +
  '</div>';
}

(window as any).reserveItem = reserveItem;
