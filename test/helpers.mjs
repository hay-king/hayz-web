import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createApp } from '../src/app.mjs';
import { createGoogleAuth } from '../src/auth/google.mjs';
import { openDatabase } from '../src/db/index.mjs';

export function person(overrides = {}) {
  return {
    sub: 'google-sub-hong',
    email: 'hong@example.com',
    emailVerified: true,
    name: '홍길동',
    picture: 'https://lh3.googleusercontent.com/a/example',
    ...overrides,
  };
}

export class Jar {
  constructor() {
    this.cookies = new Map();
  }

  store(response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const index = pair.indexOf('=');
      if (index < 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (/max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

export function cookieLine(response, name) {
  return response.headers.getSetCookie().find((line) => line.startsWith(`${name}=`)) || '';
}

export async function createHarness(options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hayz-'));
  const clock = { t: Date.parse('2026-10-24T03:00:00Z') };
  const profiles = options.profiles || { 'auth-code': person() };
  const real = createGoogleAuth();
  let seen = null;
  let exchanges = 0;
  const google = {
    buildAuthUrl(params) {
      seen = params;
      return real.buildAuthUrl(params);
    },
    async exchangeCode({ code, codeVerifier }) {
      exchanges += 1;
      const challenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      if (!seen || challenge !== seen.codeChallenge) throw new Error('pkce');
      const profile = profiles[code];
      if (!profile) throw new Error('code');
      if (profile.emailVerified === false) throw new Error('unverified');
      return profile;
    },
  };
  const config = {
    port: 0,
    publicBaseUrl: 'http://127.0.0.1:4320',
    googleClientId: 'test-client-id',
    googleClientSecret: 'test-client-secret',
    sessionSecret: 'test-session-secret-0123456789abcd',
    adminEmails: ['admin@example.com'],
    sessionIdleMs: 2 * 60 * 60 * 1000,
    sessionAbsoluteMs: 7 * 24 * 60 * 60 * 1000,
    termsVersion: '2026-10-24',
    privacyVersion: '2026-10-24',
    trustProxy: false,
    ...options.config,
    dataDir: dir,
  };
  const db = openDatabase(dir);
  const server = createApp({ config, db, google, now: () => clock.t });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    clock,
    db,
    config,
    exchanges: () => exchanges,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function withHarness(options, fn) {
  const harness = await createHarness(options);
  try {
    await fn(harness);
  } finally {
    await harness.close();
  }
}

export async function beginLogin(harness, jar = new Jar()) {
  const response = await fetch(`${harness.base}/auth/google/start`, { redirect: 'manual' });
  jar.store(response);
  const location = response.headers.get('location');
  const state = new URL(location).searchParams.get('state');
  return { response, location, state, jar };
}

export async function callback(harness, jar, state, code = 'auth-code') {
  const response = await fetch(
    `${harness.base}/auth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(code)}`,
    { redirect: 'manual', headers: { cookie: jar.header() } },
  );
  jar.store(response);
  return response;
}

export async function consent(harness, jar, { agreeTerms = true, agreePrivacy = true, token, origin = true } = {}) {
  const pendingResponse = await fetch(`${harness.base}/api/auth/pending`, {
    headers: { cookie: jar.header(), accept: 'application/json' },
  });
  const pending = await pendingResponse.json();
  const headers = {
    cookie: jar.header(),
    accept: 'application/json',
    'content-type': 'application/json',
    'x-csrf-token': token === undefined ? pending.csrfToken : token,
  };
  if (origin) headers.origin = harness.config.publicBaseUrl;
  const response = await fetch(`${harness.base}/api/auth/consent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ agreeTerms, agreePrivacy }),
  });
  jar.store(response);
  return { response, pending, pendingResponse };
}

export async function signup(harness, code = 'auth-code') {
  const jar = new Jar();
  const start = await beginLogin(harness, jar);
  const back = await callback(harness, jar, start.state, code);
  const agreed = await consent(harness, jar);
  return { jar, start, back, ...agreed };
}

export async function loginExisting(harness, code = 'auth-code') {
  const jar = new Jar();
  const start = await beginLogin(harness, jar);
  const back = await callback(harness, jar, start.state, code);
  return { jar, start, back };
}

export async function api(harness, jar, pathname, { method = 'GET', body, token, origin = true } = {}) {
  const headers = { accept: 'application/json', cookie: jar.header() };
  if (origin) headers.origin = harness.config.publicBaseUrl;
  if (token) headers['x-csrf-token'] = token;
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(harness.base + pathname, { method, headers, body: payload });
  jar.store(response);
  return response;
}
