export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' https://*.googleusercontent.com",
    "style-src 'self'",
    "script-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export function parseCookies(header = '') {
  const cookies = {};
  if (!header) return cookies;
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const name = part.slice(0, index).trim();
    const raw = part.slice(index + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(raw);
    } catch {
      cookies[name] = raw;
    }
  }
  return cookies;
}

export function cookieHeader(name, value, { secure = false, maxAge } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (typeof maxAge === 'number') parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearCookie(name, { secure = false } = {}) {
  return cookieHeader(name, '', { secure, maxAge: 0 });
}

export function readJson(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error('too_large');
        error.status = 413;
        error.code = 'too_large';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          const error = new Error('bad_json');
          error.status = 400;
          error.code = 'bad_request';
          reject(error);
          return;
        }
        resolve(parsed);
      } catch {
        const error = new Error('bad_json');
        error.status = 400;
        error.code = 'bad_request';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res, status, body, extra = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extra,
  };
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export function sendRedirect(res, location, cookies = []) {
  const headers = {
    Location: location,
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
  };
  if (cookies.length) headers['Set-Cookie'] = cookies;
  res.writeHead(302, headers);
  res.end();
}

export function sendNoContent(res, status, extra = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extra,
  });
  res.end();
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function sendMessage(res, status, title, message, extra = {}) {
  const body = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body>
  <main class="section">
    <div class="wrap prose">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <p><a href="/">홈으로</a></p>
    </div>
  </main>
</body>
</html>`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...extra,
  });
  res.end(body);
}

export function sendMethodNotAllowed(res) {
  sendJson(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET, POST' });
}

export function clientIp(req, config) {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function sameOrigin(req, config) {
  let expected;
  try {
    expected = new URL(config.publicBaseUrl).origin;
  } catch {
    return false;
  }
  if (typeof req.headers.origin === 'string' && req.headers.origin) {
    return req.headers.origin === expected;
  }
  const referer = req.headers.referer || req.headers.referrer;
  if (typeof referer !== 'string' || !referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

export function csrfPresented(req, body) {
  const header = req.headers['x-csrf-token'];
  if (typeof header === 'string' && header) return header;
  if (body && typeof body.csrfToken === 'string') return body.csrfToken;
  return '';
}
