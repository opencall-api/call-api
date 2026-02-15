import { toggleTheme } from './theme';
import { initSidebar } from './ui';
import { renderEnvelopeViewer } from './envelope';
import { initDashboard } from './pages/dashboard';
import { initCatalog } from './pages/catalog';
import { initItemDetail } from './pages/item-detail';
import { initAccount } from './pages/account';
import { initReports } from './pages/reports';
import { initAuth } from './pages/auth-page';

document.addEventListener('DOMContentLoaded', function () {
  // Initialize theme toggle buttons
  document.querySelectorAll('.theme-toggle').forEach(function(btn) {
    btn.addEventListener('click', toggleTheme);
  });

  // Initialize sidebar
  initSidebar();

  // Detect which page we are on and initialize the appropriate handler
  const page = document.body.getAttribute('data-page');

  switch (page) {
    case 'auth':
      initAuth();
      break;
    case 'dashboard':
      initDashboard();
      break;
    case 'catalog':
      initCatalog();
      break;
    case 'item-detail':
      initItemDetail();
      break;
    case 'account':
      initAccount();
      break;
    case 'reports':
      initReports();
      break;
    default:
      // Unknown page, do nothing
      break;
  }

  // Render initial envelope viewer state
  renderEnvelopeViewer();
});
