import { escapeHtml } from '../utils';

export function initAuth() {
  const form = document.getElementById('auth-form') as HTMLFormElement | null;
  if (!form) return;

  // Check for reset banner
  const params = new URLSearchParams(window.location.search);
  if (params.get('reset') === '1') {
    const banner = document.getElementById('auth-banner');
    if (banner) {
      banner.innerHTML = '<div class="alert alert-warning mb-3">The demo has been reset. Please authenticate again.</div>';
      banner.style.display = 'block';
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = (document.getElementById('auth-username') as HTMLInputElement)?.value?.trim() || undefined;
    const submitBtn = document.getElementById('auth-submit') as HTMLButtonElement | null;
    const errorEl = document.getElementById('auth-error');

    // Gather selected scopes
    const scopeCheckboxes = form.querySelectorAll('input[name="scopes"]:checked');
    const scopes = Array.from(scopeCheckboxes).map(function(cb) { return (cb as HTMLInputElement).value; });

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Starting Demo...';
    }

    if (errorEl) errorEl.innerHTML = '';

    try {
      const res = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, scopes: scopes.length > 0 ? scopes : undefined }),
      });

      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      if (res.ok) {
        window.location.href = '/';
        return;
      }

      const data = await res.json().catch(function() { return {} as any; });
      if (errorEl) {
        errorEl.innerHTML = '<div class="alert alert-danger mt-2">' +
          escapeHtml(data.error?.message || data.message || 'Authentication failed. Please try again.') +
        '</div>';
      }
    } catch (err: any) {
      if (errorEl) {
        errorEl.innerHTML = '<div class="alert alert-danger mt-2">Network error: ' + escapeHtml(err.message) + '</div>';
      }
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Start Demo';
    }
  });
}
