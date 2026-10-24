import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdminRouter } from './admin/router.mjs';
import { createAuthRouter } from './auth/router.mjs';
import { sendJson, sendMessage } from './http.mjs';
import { createUsersRouter } from './users/router.mjs';
import { createStatic } from './web/static.mjs';

const publicRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export function createApp({ config, db, google, now = () => Date.now() }) {
  const auth = createAuthRouter({ db, config, google, now });
  const users = createUsersRouter({ db, config, now });
  const admin = createAdminRouter({ db, config, now });
  const web = createStatic({ config, root: publicRoot });

  return http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      sendMessage(res, 400, '잘못된 요청', '주소를 다시 확인해 주세요.');
      return;
    }
    handle(req, res, url).catch((error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const status = Number.isInteger(error.status) ? error.status : 500;
      if (status >= 500) console.error(error && error.message ? error.message : 'internal_error');
      const code = error.code || (status === 400 ? 'bad_request' : status === 413 ? 'too_large' : 'server_error');
      sendJson(res, status, { error: code });
    });
  });

  async function handle(req, res, url) {
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (await auth(req, res, url)) return;
    if (await users(req, res, url)) return;
    if (await admin(req, res, url)) return;
    if (await web(req, res, url)) return;
    sendMessage(res, 404, '페이지를 찾을 수 없습니다', '주소를 다시 확인해 주세요.');
  }
}
