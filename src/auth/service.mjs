import { authConfigured, redirectUri } from '../config.mjs';
import { cleanName, normalizeEmail, safePicture } from '../profile.mjs';
import { randomId, safeEqual } from '../security.mjs';
import { createPkcePair } from './google.mjs';
import { createSession } from './session.mjs';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;

export function beginLogin({ db, config, google, now }) {
  if (!authConfigured(config)) return { ok: false, error: 'config' };
  const clock = now();
  db.oauth.deleteExpired(clock);
  db.pending.deleteExpired(clock);
  const { verifier, challenge } = createPkcePair();
  const state = randomId();
  db.oauth.create({ state, codeVerifier: verifier, expiresAt: clock + OAUTH_TTL_MS });
  const url = google.buildAuthUrl({
    clientId: config.googleClientId,
    redirectUri: redirectUri(config),
    state,
    codeChallenge: challenge,
  });
  return { ok: true, url, state, maxAge: Math.floor(OAUTH_TTL_MS / 1000) };
}

export async function finishLogin({ db, config, google, now, code, state, cookieState }) {
  const clock = now();
  if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
    return { ok: false, error: 'state' };
  }
  const stored = db.oauth.consume(state);
  if (!stored || stored.expiresAt <= clock || !stored.codeVerifier) {
    return { ok: false, error: 'state' };
  }
  let profile;
  try {
    profile = await google.exchangeCode({
      code,
      codeVerifier: stored.codeVerifier,
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: redirectUri(config),
    });
  } catch (error) {
    if (error && error.message === 'unverified') return { ok: false, error: 'unverified' };
    return { ok: false, error: 'exchange' };
  }
  const email = normalizeEmail(profile.email);
  if (!email || !profile.sub) return { ok: false, error: 'exchange' };
  const name = cleanName(profile.name);
  const picture = safePicture(profile.picture);
  const existing = db.users.findByGoogleSub(profile.sub);
  if (existing?.status === 'suspended') return { ok: false, error: 'suspended' };
  if (existing?.status === 'withdrawn') return { ok: false, error: 'exchange' };
  if (existing?.status === 'active') {
    const owner = db.users.findByEmail(email);
    if (owner && owner.id !== existing.id) return { ok: false, error: 'email_in_use' };
    const role = config.adminEmails.includes(email) ? 'admin' : existing.role;
    db.users.updateOnLogin(existing.id, { email, name, picture, lastLoginAt: clock, role });
    return { ok: true, kind: 'session', session: createSession(db, existing.id, clock) };
  }
  const owner = db.users.findByEmail(email);
  if (owner) return { ok: false, error: 'email_in_use' };
  const pendingId = randomId();
  const csrfToken = randomId();
  db.pending.create({
    id: pendingId,
    googleSub: profile.sub,
    email,
    name,
    picture,
    csrfToken,
    createdAt: clock,
    expiresAt: clock + PENDING_TTL_MS,
  });
  return { ok: true, kind: 'pending', pendingId, maxAge: Math.floor(PENDING_TTL_MS / 1000) };
}

export function viewPending({ db, config, now, pendingId }) {
  if (!pendingId) return null;
  const pending = db.pending.get(pendingId);
  const clock = now();
  if (!pending || pending.expiresAt <= clock) {
    if (pending) db.pending.delete(pending.id);
    return null;
  }
  return {
    email: pending.email,
    name: pending.name,
    csrfToken: pending.csrfToken,
    termsVersion: config.termsVersion,
    privacyVersion: config.privacyVersion,
  };
}

export function acceptConsent({ db, config, now, pendingId, agreeTerms, agreePrivacy, csrfToken }) {
  const clock = now();
  const pending = pendingId ? db.pending.get(pendingId) : null;
  if (!pending || pending.expiresAt <= clock) {
    if (pending) db.pending.delete(pending.id);
    return { ok: false, status: 401, error: 'consent' };
  }
  if (!safeEqual(pending.csrfToken, csrfToken || '')) {
    return { ok: false, status: 403, error: 'csrf' };
  }
  if (agreeTerms !== true || agreePrivacy !== true) {
    return { ok: false, status: 400, error: 'consent_required' };
  }
  const existing = db.users.findByGoogleSub(pending.googleSub);
  if (existing?.status === 'suspended') return { ok: false, status: 403, error: 'suspended' };
  if (existing?.status === 'withdrawn') return { ok: false, status: 409, error: 'exchange' };
  if (existing?.status === 'active') {
    db.pending.delete(pending.id);
    const role = config.adminEmails.includes(existing.email) ? 'admin' : existing.role;
    db.users.updateOnLogin(existing.id, {
      email: existing.email,
      name: existing.name,
      picture: existing.picture,
      lastLoginAt: clock,
      role,
    });
    return { ok: true, session: createSession(db, existing.id, clock), created: false };
  }
  const owner = db.users.findByEmail(pending.email);
  if (owner) return { ok: false, status: 409, error: 'email_in_use' };
  const userId = randomId();
  const role = config.adminEmails.includes(pending.email) ? 'admin' : 'user';
  try {
    db.users.insert({
      id: userId,
      googleSub: pending.googleSub,
      email: pending.email,
      name: pending.name,
      picture: pending.picture,
      createdAt: clock,
      lastLoginAt: clock,
      status: 'active',
      role,
      termsVersion: config.termsVersion,
      privacyVersion: config.privacyVersion,
      consentedAt: clock,
    });
  } catch {
    return { ok: false, status: 409, error: 'email_in_use' };
  }
  db.pending.delete(pending.id);
  return { ok: true, session: createSession(db, userId, clock), created: true };
}
