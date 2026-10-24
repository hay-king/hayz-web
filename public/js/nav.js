import { mountIcons } from './icons.js';

export function initNav() {
  const header = document.querySelector('[data-nav]');
  const toggle = document.querySelector('[data-nav-toggle]');
  if (!header || !toggle) return;
  const icon = toggle.querySelector('[data-icon]');
  const setOpen = (open) => {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (icon) {
      icon.setAttribute('data-icon', open ? 'close' : 'menu');
      mountIcons(toggle);
    }
  };
  toggle.addEventListener('click', () => setOpen(!header.classList.contains('is-open')));
  header.querySelectorAll('nav a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
}
