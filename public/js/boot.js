import { showAuthNotice } from './auth-notice.js';
import { mountIcons } from './icons.js';
import { initNav } from './nav.js';
import { refreshSessionNav } from './session-nav.js';

export function boot() {
  mountIcons(document);
  initNav();
  showAuthNotice();
  refreshSessionNav();
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}
