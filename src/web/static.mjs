import fs from 'node:fs';
import path from 'node:path';
import { SECURITY_HEADERS, escapeHtml, sendMessage } from '../http.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const GATED = new Set(['me.html', 'admin.html', 'signup/consent.html']);

export function createStatic({ config, root }) {
  return async function web(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const file = resolvePublic(root, url.pathname);
    if (!file) return false;
    sendFile(res, file, req.method, config);
    return true;
  };
}

export function sendPublic(res, root, relativePath, config) {
  const file = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!file.startsWith(rootWithSep) || !fs.existsSync(file)) {
    sendMessage(res, 404, '페이지를 찾을 수 없습니다', '주소를 다시 확인해 주세요.');
    return;
  }
  sendFile(res, file, 'GET', config);
}

export function resolvePublic(root, pathname) {
  if (pathname === '/') return existingFile(root, 'index.html');
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (!decoded.startsWith('/') || decoded.includes('\0') || decoded.includes('\\')) return null;
  const relative = decoded.replace(/^\/+/, '');
  if (!relative || relative.split('/').some((part) => !part || part === '..' || part.startsWith('.'))) return null;
  const candidates = path.extname(relative) ? [relative] : [relative, `${relative}.html`];
  for (const candidate of candidates) {
    if (GATED.has(candidate)) continue;
    const file = existingFile(root, candidate);
    if (file) return file;
  }
  return null;
}

function existingFile(root, relativePath) {
  const full = path.resolve(root, relativePath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (full !== root && !full.startsWith(rootWithSep)) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function sendFile(res, file, method, config) {
  const extension = path.extname(file).toLowerCase();
  const type = TYPES[extension];
  if (!type) {
    sendMessage(res, 404, '페이지를 찾을 수 없습니다', '주소를 다시 확인해 주세요.');
    return;
  }
  let body = fs.readFileSync(file);
  if (extension === '.html') {
    const html = body.toString('utf8')
      .replaceAll('__TERMS_VERSION__', escapeHtml(config.termsVersion))
      .replaceAll('__PRIVACY_VERSION__', escapeHtml(config.privacyVersion));
    body = Buffer.from(html);
  }
  const cache = extension === '.html' ? 'no-cache' : 'public, max-age=3600';
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cache,
    ...SECURITY_HEADERS,
  });
  res.end(method === 'HEAD' ? undefined : body);
}
