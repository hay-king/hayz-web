import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieSecure } from '../config.mjs';
import { clearCookie, csrfPresented, readJson, sameOrigin, sendJson, sendMethodNotAllowed, sendRedirect } from '../http.mjs';
import { safeEqual } from '../security.mjs';
import { sessionFromRequest } from '../auth/session.mjs';
import { sendPublic } from '../web/static.mjs';
import { memberView, withdrawAccount } from './service.mjs';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

export function createUsersRouter({ db, config, now }) {
  function clearSession() {
    return clearCookie('hayz_sid', { secure: cookieSecure(config) });
  }

  function load(req, res) {
    const ctx = sessionFromRequest(req, db, config, now());
    if (!ctx.user) {
      const error = ctx.expired ? 'expired' : 'login';
      return { ctx, error };
    }
    return { ctx, error: null };
  }

  return async function usersRouter(req, res, url) {
    const pathname = url.pathname;
    if (pathname !== '/api/me' && pathname !== '/api/me/withdraw' && pathname !== '/me' && pathname !== '/me.html') {
      return false;
    }

    if (pathname === '/me' || pathname === '/me.html') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const { ctx, error } = load(req, res);
      if (!ctx.user) {
        sendRedirect(res, `/?auth_error=${error}`, ctx.clear ? [clearSession()] : []);
        return true;
      }
      sendPublic(res, publicRoot, 'me.html', config);
      return true;
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const { ctx, error } = load(req, res);
      if (!ctx.user) {
        sendJson(res, 401, { error }, ctx.clear ? { 'Set-Cookie': clearSession() } : {});
        return true;
      }
      sendJson(res, 200, { user: memberView(ctx.user), csrfToken: ctx.session.csrfToken });
      return true;
    }

    if (pathname === '/api/me/withdraw') {
      if (req.method !== 'POST') return sendMethodNotAllowed(res), true;
      if (!sameOrigin(req, config)) {
        sendJson(res, 403, { error: 'csrf' });
        return true;
      }
      const body = await readJson(req);
      const { ctx, error } = load(req, res);
      if (!ctx.user) {
        sendJson(res, 401, { error: error || 'login' }, ctx.clear ? { 'Set-Cookie': clearSession() } : {});
        return true;
      }
      if (!safeEqual(ctx.session.csrfToken, csrfPresented(req, body))) {
        sendJson(res, 403, { error: 'csrf' });
        return true;
      }
      const result = withdrawAccount({
        db,
        user: ctx.user,
        confirmEmail: body.confirmEmail,
        understand: body.understand,
        now,
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return true;
      }
      sendJson(res, 200, { ok: true }, { 'Set-Cookie': clearSession() });
      return true;
    }

    if (pathname === '/api/me') return sendMethodNotAllowed(res), true;
    return false;
  };
}
