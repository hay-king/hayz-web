import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieSecure } from '../config.mjs';
import {
  clearCookie,
  clientIp,
  cookieHeader,
  csrfPresented,
  parseCookies,
  readJson,
  sameOrigin,
  sendJson,
  sendMessage,
  sendMethodNotAllowed,
  sendRedirect,
} from '../http.mjs';
import { safeEqual, signValue, unsignValue } from '../security.mjs';
import { createLimiter } from './limiter.mjs';
import { acceptConsent, beginLogin, finishLogin, viewPending } from './service.mjs';
import { sessionFromRequest } from './session.mjs';
import { sendPublic } from '../web/static.mjs';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

export function createAuthRouter({ db, config, google, now }) {
  const limited = createLimiter();
  const secure = () => cookieSecure(config);

  function oauthCookie(state, maxAge) {
    return cookieHeader('hayz_oauth', signValue(config.sessionSecret, 'oauth', state), {
      secure: secure(),
      maxAge,
    });
  }

  function pendingCookie(pendingId, maxAge) {
    return cookieHeader('hayz_pending', signValue(config.sessionSecret, 'pending', pendingId), {
      secure: secure(),
      maxAge,
    });
  }

  function sessionCookie(sessionId) {
    return cookieHeader('hayz_sid', signValue(config.sessionSecret, 'session', sessionId), {
      secure: secure(),
      maxAge: Math.floor(config.sessionAbsoluteMs / 1000),
    });
  }

  function clearOauth() {
    return clearCookie('hayz_oauth', { secure: secure() });
  }

  function clearPending() {
    return clearCookie('hayz_pending', { secure: secure() });
  }

  function clearSession() {
    return clearCookie('hayz_sid', { secure: secure() });
  }

  function failLogin(res, error, cookies = []) {
    sendRedirect(res, `/?auth_error=${encodeURIComponent(error)}`, [clearOauth(), ...cookies]);
    return true;
  }

  return async function authRouter(req, res, url) {
    const pathname = url.pathname;

    if (pathname === '/auth/google/start') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      if (limited(clientIp(req, config), now())) return failLogin(res, 'rate');
      const result = beginLogin({ db, config, google, now });
      if (!result.ok) return failLogin(res, result.error);
      sendRedirect(res, result.url, [oauthCookie(result.state, result.maxAge)]);
      return true;
    }

    if (pathname === '/auth/google/callback') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const providerError = url.searchParams.get('error');
      if (providerError) return failLogin(res, providerError === 'access_denied' ? 'denied' : 'exchange');
      const code = url.searchParams.get('code') || '';
      const state = url.searchParams.get('state') || '';
      if (code.length > 2048 || state.length > 512) return failLogin(res, 'state');
      const cookies = parseCookies(req.headers.cookie);
      const cookieState = unsignValue(config.sessionSecret, 'oauth', cookies.hayz_oauth);
      const result = await finishLogin({
        db,
        config,
        google,
        now,
        code,
        state,
        cookieState,
      });
      if (!result.ok) return failLogin(res, result.error);
      if (result.kind === 'pending') {
        sendRedirect(res, '/signup/consent', [
          clearOauth(),
          pendingCookie(result.pendingId, result.maxAge),
        ]);
        return true;
      }
      sendRedirect(res, '/me', [clearOauth(), clearPending(), sessionCookie(result.session.id)]);
      return true;
    }

    if (pathname === '/api/auth/pending') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const cookies = parseCookies(req.headers.cookie);
      const pendingId = unsignValue(config.sessionSecret, 'pending', cookies.hayz_pending);
      const pending = viewPending({ db, config, now, pendingId });
      if (!pending) {
        sendJson(res, 401, { error: 'consent' });
        return true;
      }
      sendJson(res, 200, pending);
      return true;
    }

    if (pathname === '/api/auth/consent') {
      if (req.method !== 'POST') return sendMethodNotAllowed(res), true;
      if (!sameOrigin(req, config)) {
        sendJson(res, 403, { error: 'csrf' });
        return true;
      }
      const body = await readJson(req);
      const cookies = parseCookies(req.headers.cookie);
      const pendingId = unsignValue(config.sessionSecret, 'pending', cookies.hayz_pending);
      const result = acceptConsent({
        db,
        config,
        now,
        pendingId,
        agreeTerms: body.agreeTerms,
        agreePrivacy: body.agreePrivacy,
        csrfToken: csrfPresented(req, body),
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return true;
      }
      sendJson(res, 200, { ok: true, created: result.created }, {
        'Set-Cookie': [clearPending(), sessionCookie(result.session.id)],
      });
      return true;
    }

    if (pathname === '/api/auth/logout') {
      if (req.method !== 'POST') return sendMethodNotAllowed(res), true;
      if (!sameOrigin(req, config)) {
        sendJson(res, 403, { error: 'csrf' });
        return true;
      }
      const ctx = sessionFromRequest(req, db, config, now());
      if (!ctx.user) {
        sendJson(res, 401, { error: ctx.expired ? 'expired' : 'login' }, ctx.clear ? { 'Set-Cookie': clearSession() } : {});
        return true;
      }
      if (!safeEqual(ctx.session.csrfToken, csrfPresented(req))) {
        sendJson(res, 403, { error: 'csrf' });
        return true;
      }
      db.sessions.delete(ctx.session.id);
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSession() });
      return true;
    }

    if (pathname === '/api/legal') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      sendJson(res, 200, {
        termsVersion: config.termsVersion,
        privacyVersion: config.privacyVersion,
      });
      return true;
    }

    if (pathname === '/signup/consent' || pathname === '/signup/consent.html') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const cookies = parseCookies(req.headers.cookie);
      const pendingId = unsignValue(config.sessionSecret, 'pending', cookies.hayz_pending);
      const pending = viewPending({ db, config, now, pendingId });
      if (!pending) {
        sendRedirect(res, '/?auth_error=consent');
        return true;
      }
      sendPublic(res, publicRoot, 'signup/consent.html', config);
      return true;
    }

    return false;
  };
}
