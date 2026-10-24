import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieSecure } from '../config.mjs';
import {
  clearCookie,
  csrfPresented,
  readJson,
  sameOrigin,
  sendJson,
  sendMessage,
  sendMethodNotAllowed,
  sendRedirect,
} from '../http.mjs';
import { safeEqual } from '../security.mjs';
import { sessionFromRequest } from '../auth/session.mjs';
import { sendPublic } from '../web/static.mjs';
import { adminStats, adminUserView, setMemberRole, setMemberStatus } from './service.mjs';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
const DAYS = new Set([7, 30, 90]);

function pathId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function createAdminRouter({ db, config, now }) {
  function clearSession() {
    return clearCookie('hayz_sid', { secure: cookieSecure(config) });
  }

  function authorize(req, res, { html }) {
    const ctx = sessionFromRequest(req, db, config, now());
    if (!ctx.user) {
      const error = ctx.expired ? 'expired' : 'login';
      if (html) sendRedirect(res, `/?auth_error=${error}`, ctx.clear ? [clearSession()] : []);
      else sendJson(res, 401, { error }, ctx.clear ? { 'Set-Cookie': clearSession() } : {});
      return null;
    }
    if (ctx.user.role !== 'admin') {
      if (html) sendMessage(res, 403, '권한이 없습니다', '관리자만 이 페이지를 볼 수 있습니다.');
      else sendJson(res, 403, { error: 'forbidden' });
      return null;
    }
    return ctx;
  }

  function guardMutation(req, ctx, body) {
    if (!sameOrigin(req, config) || !safeEqual(ctx.session.csrfToken, csrfPresented(req, body))) {
      return false;
    }
    return true;
  }

  return async function adminRouter(req, res, url) {
    const pathname = url.pathname;
    const isPage = pathname === '/admin' || pathname === '/admin.html';
    const isApi = pathname === '/api/admin/stats' || pathname === '/api/admin/users' || pathname.startsWith('/api/admin/users/');
    if (!isPage && !isApi) return false;

    if (isPage) {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const ctx = authorize(req, res, { html: true });
      if (!ctx) return true;
      sendPublic(res, publicRoot, 'admin.html', config);
      return true;
    }

    const ctx = authorize(req, res, { html: false });
    if (!ctx) return true;

    if (pathname === '/api/admin/stats') {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const requested = Number(url.searchParams.get('days'));
      const days = DAYS.has(requested) ? requested : 30;
      sendJson(res, 200, { ...adminStats(db, now(), days), csrfToken: ctx.session.csrfToken });
      return true;
    }

    if (pathname === '/api/admin/users' && req.method === 'GET') {
      const result = db.users.search({
        query: url.searchParams.get('q') || '',
        status: url.searchParams.get('status') || '',
        limit: url.searchParams.get('limit'),
        offset: url.searchParams.get('offset'),
      });
      sendJson(res, 200, {
        total: result.total,
        users: result.users.map(adminUserView),
      });
      return true;
    }

    const detail = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (detail) {
      if (req.method !== 'GET') return sendMethodNotAllowed(res), true;
      const user = db.users.findById(pathId(detail[1]));
      if (!user) {
        sendJson(res, 404, { error: 'not_found' });
        return true;
      }
      sendJson(res, 200, { user: adminUserView(user) });
      return true;
    }

    const statusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
    const roleMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
    if (statusMatch || roleMatch) {
      if (req.method !== 'POST') return sendMethodNotAllowed(res), true;
      const body = await readJson(req);
      if (!guardMutation(req, ctx, body)) {
        sendJson(res, 403, { error: 'csrf' });
        return true;
      }
      const userId = pathId((statusMatch || roleMatch)[1]);
      const result = statusMatch
        ? setMemberStatus({ db, actor: ctx.user, userId, status: body.status })
        : setMemberRole({ db, actor: ctx.user, userId, role: body.role });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error });
        return true;
      }
      sendJson(res, 200, { ok: true, user: adminUserView(result.user) });
      return true;
    }

    if (pathname === '/api/admin/users') return sendMethodNotAllowed(res), true;
    return false;
  };
}
