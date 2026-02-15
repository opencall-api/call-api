import { escapeHtml, debounce } from '../utils';
import { callApi } from '../api';
import { showLoading, renderError } from '../ui';

const catalogState = {
  search: '',
  type: '',
  available: null as boolean | null,
  limit: 20,
  offset: 0,
  total: 0,
};

export async function initCatalog() {
  const content = document.getElementById('catalog-content');
  if (!content) return;

  renderCatalogFilters();
  await loadCatalog();
}

function renderCatalogFilters() {
  const filtersEl = document.getElementById('catalog-filters');
  if (!filtersEl) return;

  filtersEl.innerHTML =
    '<div class="filter-bar">' +
      '<input type="text" class="input input-search" id="catalog-search" placeholder="Search titles, authors..." value="' + escapeHtml(catalogState.search) + '">' +
      '<select class="input" id="catalog-type">' +
        '<option value="">All Types</option>' +
        '<option value="book"' + (catalogState.type === 'book' ? ' selected' : '') + '>Books</option>' +
        '<option value="cd"' + (catalogState.type === 'cd' ? ' selected' : '') + '>CDs</option>' +
        '<option value="dvd"' + (catalogState.type === 'dvd' ? ' selected' : '') + '>DVDs</option>' +
        '<option value="boardgame"' + (catalogState.type === 'boardgame' ? ' selected' : '') + '>Board Games</option>' +
      '</select>' +
      '<label class="checkbox-label">' +
        '<input type="checkbox" id="catalog-available"' + (catalogState.available === true ? ' checked' : '') + '>' +
        '<span>Available only</span>' +
      '</label>' +
    '</div>';

  // Attach event listeners
  const searchInput = document.getElementById('catalog-search') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', debounce(function () {
      catalogState.search = searchInput.value.trim();
      catalogState.offset = 0;
      loadCatalog();
    }, 300));
  }

  const typeSelect = document.getElementById('catalog-type') as HTMLSelectElement;
  if (typeSelect) {
    typeSelect.addEventListener('change', function () {
      catalogState.type = typeSelect.value;
      catalogState.offset = 0;
      loadCatalog();
    });
  }

  const availableCheckbox = document.getElementById('catalog-available') as HTMLInputElement;
  if (availableCheckbox) {
    availableCheckbox.addEventListener('change', function () {
      catalogState.available = availableCheckbox.checked ? true : null;
      catalogState.offset = 0;
      loadCatalog();
    });
  }
}

async function loadCatalog() {
  const content = document.getElementById('catalog-list');
  if (!content) return;

  showLoading(content, 'Loading catalog...');

  const args: any = {
    limit: catalogState.limit,
    offset: catalogState.offset,
  };
  if (catalogState.search) args.search = catalogState.search;
  if (catalogState.type) args.type = catalogState.type;
  if (catalogState.available !== null) args.available = catalogState.available;

  const result = await callApi('v1:catalog.list', args);

  if (result.data?.state === 'error') {
    renderError(content, result.data.error);
    return;
  }

  const data = result.data?.result || result.data;
  const items = data?.items || [];
  catalogState.total = data?.total || 0;

  if (items.length === 0) {
    content.innerHTML = '<div class="empty-state">' +
      '<div class="empty-icon">&#128218;</div>' +
      '<div class="empty-title">No items found</div>' +
      '<div class="empty-text">Try adjusting your search or filter criteria.</div>' +
    '</div>';
    renderCatalogPagination();
    return;
  }

  let html = '<div class="catalog-list">';
  items.forEach(function(item: any) {
    const available = item.available || item.availableCopies > 0;
    const badgeClass = available ? 'badge-available' : 'badge-overdue';
    const badgeText = available ? 'Available' : 'Unavailable';
    const copies = (item.availableCopies !== undefined ? item.availableCopies : '?') +
      '/' + (item.totalCopies !== undefined ? item.totalCopies : '?');

    html += '<div class="card card-clickable catalog-item" onclick="navigateToItem(\'' + escapeHtml(item.id) + '\')">' +
      '<div class="item-type">' + escapeHtml(item.type || '') + '</div>' +
      '<div class="card-title">' + escapeHtml(item.title || 'Untitled') + '</div>' +
      '<div class="item-creator">' + escapeHtml(item.creator || '') + '</div>' +
      (item.year ? '<div class="item-year">' + item.year + '</div>' : '') +
      '<div class="item-availability">' +
        '<span class="badge ' + badgeClass + '">' + badgeText + '</span>' +
        '<span class="text-muted text-sm">' + copies + ' copies</span>' +
      '</div>' +
    '</div>';
  });
  html += '</div>';

  content.innerHTML = html;
  renderCatalogPagination();
}

function renderCatalogPagination() {
  const paginationEl = document.getElementById('catalog-pagination');
  if (!paginationEl) return;

  const start = catalogState.offset + 1;
  const end = Math.min(catalogState.offset + catalogState.limit, catalogState.total);
  const hasPrev = catalogState.offset > 0;
  const hasNext = catalogState.offset + catalogState.limit < catalogState.total;

  paginationEl.innerHTML = '<div class="pagination">' +
    '<span class="pagination-info">' +
      (catalogState.total > 0 ? 'Showing ' + start + '-' + end + ' of ' + catalogState.total : 'No results') +
    '</span>' +
    '<div class="pagination-buttons">' +
      '<button class="btn btn-sm btn-secondary" onclick="catalogPrev()"' + (hasPrev ? '' : ' disabled') + '>Previous</button>' +
      '<button class="btn btn-sm btn-secondary" onclick="catalogNext()"' + (hasNext ? '' : ' disabled') + '>Next</button>' +
    '</div>' +
  '</div>';
}

function catalogPrev() {
  if (catalogState.offset > 0) {
    catalogState.offset = Math.max(0, catalogState.offset - catalogState.limit);
    loadCatalog();
  }
}

function catalogNext() {
  if (catalogState.offset + catalogState.limit < catalogState.total) {
    catalogState.offset += catalogState.limit;
    loadCatalog();
  }
}

function navigateToItem(itemId: string) {
  window.location.href = '/catalog/' + encodeURIComponent(itemId);
}

(window as any).catalogPrev = catalogPrev;
(window as any).catalogNext = catalogNext;
(window as any).navigateToItem = navigateToItem;
