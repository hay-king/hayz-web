const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  messenger: svg('<path d="M5 16.5V7.8A2.8 2.8 0 0 1 7.8 5h8.4A2.8 2.8 0 0 1 19 7.8v5.4a2.8 2.8 0 0 1-2.8 2.8H9z"/>'),
  spark: svg('<path d="M12 3.2l1.3 5.1 5.2 1.2-5.2 1.3L12 16.8l-1.3-5.9-5.2-1.3 5.2-1.2z"/>'),
  apps: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>'),
  mail: svg('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>'),
  office: svg('<path d="M4.5 20V6.8A1.8 1.8 0 0 1 6.3 5h7.2a1.8 1.8 0 0 1 1.8 1.8V20"/><path d="M15.3 10H18a1.5 1.5 0 0 1 1.5 1.5V20"/><path d="M3 20h18M8 9h2M8 12.5h2M8 16h2"/>'),
  market: svg('<path d="M5 9h14l-1.1 9.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8z"/><path d="M8.5 9V7.4A3.5 3.5 0 0 1 12 3.9a3.5 3.5 0 0 1 3.5 3.5V9"/>'),
  laptop: svg('<rect x="4" y="5" width="16" height="10.5" rx="1.6"/><path d="M3 19h18M8.5 19l.6-3.5h6l.6 3.5"/>'),
  window: svg('<rect x="3.5" y="4.5" width="7.2" height="6.2" rx="1"/><rect x="13.3" y="4.5" width="7.2" height="6.2" rx="1"/><rect x="3.5" y="13.3" width="7.2" height="6.2" rx="1"/><rect x="13.3" y="13.3" width="7.2" height="6.2" rx="1"/>'),
  web: svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.1 2.3 3.2 5 3.2 8s-1.1 5.7-3.2 8c-2.1-2.3-3.2-5-3.2-8s1.1-5.7 3.2-8z"/>'),
  phone: svg('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 17.5h2"/>'),
  user: svg('<circle cx="12" cy="8.5" r="3"/><path d="M5.5 19.2a6.5 6.5 0 0 1 13 0"/>'),
  logout: svg('<path d="M9 6.5H6.8A1.8 1.8 0 0 0 5 8.3v7.4a1.8 1.8 0 0 0 1.8 1.8H9"/><path d="M10 12h9M16.2 8.8 19.5 12l-3.3 3.2"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5 20 20"/>'),
  shield: svg('<path d="M12 3.5 19 6v6.1c0 3.9-2.7 6.5-7 8.4-4.3-1.9-7-4.5-7-8.4V6z"/>'),
  check: svg('<path d="M5 12.5 9.2 16.7 19 7.2"/>'),
  google: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
};

export function mountIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((host) => {
    const markup = ICONS[host.getAttribute('data-icon')];
    if (!markup) return;
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const node = parsed.documentElement;
    if (!node || node.nodeName.toLowerCase() !== 'svg') return;
    host.replaceChildren(node);
  });
}
