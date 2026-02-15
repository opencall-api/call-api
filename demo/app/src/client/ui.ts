import { escapeHtml } from './utils';

export function renderScopeError(container: HTMLElement, errorData: any) {
  const missingScopes = errorData?.cause || [];
  let html = '<div class="scope-error">' +
    '<div class="scope-error-title">Access Denied: Insufficient Scopes</div>' +
    '<p class="text-sm mb-2">' + escapeHtml(errorData?.message || 'You do not have permission to perform this action.') + '</p>';

  if (Array.isArray(missingScopes) && missingScopes.length > 0) {
    html += '<div class="missing-scopes">';
    missingScopes.forEach(function(scope: string) {
      html += '<span class="badge badge-scope">' + escapeHtml(scope) + '</span>';
    });
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

export function renderError(container: HTMLElement, errorData: any) {
  if (errorData?.code === 'INSUFFICIENT_SCOPES') {
    renderScopeError(container, errorData);
    return;
  }

  container.innerHTML = '<div class="alert alert-danger">' +
    '<strong>' + escapeHtml(errorData?.code || 'Error') + '</strong>: ' +
    escapeHtml(errorData?.message || 'An unexpected error occurred.') +
  '</div>';
}

export function showLoading(container: HTMLElement, message?: string) {
  container.innerHTML = '<div class="loading">' + escapeHtml(message || 'Loading...') + '</div>';
}

export function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (toggle && sidebar) {
    toggle.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('open');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', function () {
      if (sidebar) sidebar.classList.remove('open');
      overlay.classList.remove('open');
    });
  }

  // Highlight active nav link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(function (link) {
    const href = link.getAttribute('href');
    if (href === currentPath || (href !== '/' && currentPath.startsWith(href!))) {
      link.classList.add('active');
    }
  });
}
