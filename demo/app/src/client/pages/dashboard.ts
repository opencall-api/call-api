import { escapeHtml } from '../utils';
import { callApi } from '../api';
import { showLoading, renderError } from '../ui';

export async function initDashboard() {
  const content = document.getElementById('dashboard-content');
  if (!content) return;

  showLoading(content, 'Loading patron data...');

  const result = await callApi('v1:patron.get');

  if (result.data?.state === 'error') {
    renderError(content, result.data.error);
    return;
  }

  const patron = result.data?.result || result.data;

  let html = '';

  // Overdue warning banner
  if (patron.totalOverdue > 0) {
    html += '<div class="overdue-banner mb-3">' +
      '<span>You have <strong>' + patron.totalOverdue + ' overdue item' +
      (patron.totalOverdue !== 1 ? 's' : '') + '</strong>. ' +
      'Please return them to reserve new items. </span>' +
      '<a href="/account">View Account</a>' +
    '</div>';
  }

  // Welcome
  html += '<div class="page-header">' +
    '<h1>Welcome back!</h1>' +
    '<p>Explore the OpenCALL Demo Library to see the protocol in action.</p>' +
  '</div>';

  // Quick links
  html += '<div class="quick-links">';

  html += '<a href="/catalog" class="card card-clickable quick-link-card">' +
    '<div class="quick-icon">&#128218;</div>' +
    '<div class="quick-title">Browse Catalog</div>' +
    '<div class="quick-desc">Search and browse the library collection. Filter by type and availability.</div>' +
  '</a>';

  html += '<a href="/account" class="card card-clickable quick-link-card">' +
    '<div class="quick-icon">&#128100;</div>' +
    '<div class="quick-title">My Account</div>' +
    '<div class="quick-desc">View your lending history, return overdue items, and manage reservations.</div>' +
  '</a>';

  html += '<a href="/reports" class="card card-clickable quick-link-card">' +
    '<div class="quick-icon">&#128202;</div>' +
    '<div class="quick-title">Reports</div>' +
    '<div class="quick-desc">Generate lending reports. Demonstrates async operations and chunked retrieval.</div>' +
  '</a>';

  html += '</div>';

  // Agent instructions callout -- fetch a random book for the suggestion
  var agentCardNumber = patron.cardNumber || '';
  var appOrigin = window.location.origin;
  var suggestion = 'ask your favourite AI agent to reserve a book for you';

  var randomResult = await callApi('v1:catalog.list', { type: 'book', limit: 20 });
  var catalogItems = randomResult.data?.result?.items || randomResult.data?.items || [];
  if (catalogItems.length > 0) {
    var pick = catalogItems[Math.floor(Math.random() * catalogItems.length)];
    suggestion = 'ask your favourite AI agent to reserve <strong>' +
      escapeHtml(pick.title) + '</strong> by ' + escapeHtml(pick.creator) +
      ' for you';
  }

  html += '<div class="card mt-4">' +
    '<h3>AI Agent Integration</h3>' +
    '<p class="card-meta mt-1">This library supports AI agents. Why not ' +
    suggestion + ' from your local community library at <code>' +
    escapeHtml(appOrigin) + '</code>?</p>' +
    '<p class="card-meta mt-1">Your library card number is <strong>' +
    escapeHtml(agentCardNumber) + '</strong> — give it to the agent so it can sign in on your behalf.</p>' +
    '<p class="card-meta mt-1"><em>Note: Public chatbots (ChatGPT, Claude.ai, Gemini, etc.) are not agents — they cannot make API calls directly. You need an AI agent framework such as Claude Code, OpenAI Codex, or Google Jules that can execute HTTP requests on your behalf.</em></p>' +
    '<div class="mt-2">' +
      '<a href="' + (document.body.dataset.agentsUrl || '/') + '" target="_blank" rel="noopener" class="btn btn-sm btn-outline">View Agent Instructions</a>' +
    '</div>' +
  '</div>';

  content.innerHTML = html;
}
