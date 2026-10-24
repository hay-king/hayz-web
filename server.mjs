// HAYZ 홈페이지 서버 — 정적 파일 + 구글 계정 회원가입 · 로그인(OAuth 2.0 승인 코드 흐름). 외부 패키지 없음.
// 환경변수: GOOGLE_CLIENT_SECRET(필수, 저장소 금지) · GOOGLE_CLIENT_ID · APP_BASE_URL · HAYZ_DB · PORT
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CLIENT_ID = "170908678734-q0q2dmrhg5qcjv4dcbtcl2bgmk7u74nm.apps.googleusercontent.com"; // 공개값
const SESSION_DAYS = 30;
const PUBLIC = new Set(["index.html", "account.html", "css", "js", "assets"]); // 이 밖의 파일(server.mjs · data · .md)은 내보내지 않음
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

export function openDb(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, google_sub TEXT UNIQUE NOT NULL, email TEXT NOT NULL, name TEXT, office TEXT, created_at TEXT NOT NULL, last_login_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);`);
  return db;
}

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const rand = (n = 32) => crypto.randomBytes(n).toString("base64url");
const cookies = (h = "") => Object.fromEntries(h.split(";").map((c) => c.trim().split("=")).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
const safeEq = (a = "", b = "") => a.length === b.length && a.length > 0 && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// 토큰 엔드포인트에서 TLS로 직접 받은 id_token은 서명 검증 없이 내용 확인만으로 충분(OIDC Core 3.1.3.7)
export function readIdToken(idToken, clientId, now = Date.now()) {
  const part = String(idToken || "").split(".")[1];
  if (!part) throw new Error("token");
  const p = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  if (!["accounts.google.com", "https://accounts.google.com"].includes(p.iss)) throw new Error("token");
  if (p.aud !== clientId) throw new Error("token");
  if (!p.exp || p.exp * 1000 < now) throw new Error("token");
  if (!p.sub || !p.email || p.email_verified !== true) throw new Error("email");
  return p;
}

export function createApp({ env = process.env, db = openDb(env.HAYZ_DB || path.join(ROOT, "data", "hayz.db")), fetchImpl = fetch, now = () => Date.now(), root = ROOT } = {}) {
  const clientId = env.GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;
  const secret = env.GOOGLE_CLIENT_SECRET || "";
  const iso = () => new Date(now()).toISOString();

  const baseUrl = (req) => (env.APP_BASE_URL || `${req.headers["x-forwarded-proto"] || "http"}://${req.headers["x-forwarded-host"] || req.headers.host}`).replace(/\/$/, "");
  const cookie = (req, name, value, maxAge, httpOnly = true) =>
    `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${httpOnly ? "; HttpOnly" : ""}${baseUrl(req).startsWith("https") ? "; Secure" : ""}`;
  const send = (res, code, body, headers = {}) => {
    const json = typeof body !== "string";
    res.writeHead(code, { "content-type": json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8", "cache-control": "no-store", ...headers });
    res.end(json ? JSON.stringify(body) : body);
  };
  const go = (res, location, setCookie = []) => { res.writeHead(302, { location, "set-cookie": setCookie, "cache-control": "no-store" }); res.end(); };
  const readBody = (req) => new Promise((ok, no) => {
    let b = ""; req.on("data", (c) => { b += c; if (b.length > 1e4) req.destroy(); });
    req.on("end", () => { try { ok(JSON.parse(b || "{}")); } catch (e) { no(e); } }); req.on("error", no);
  });

  function currentUser(req) {
    const sid = cookies(req.headers.cookie).hayz_sid;
    if (!sid) return null;
    return db.prepare("SELECT u.id, u.email, u.name, u.office, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?").get(sha(sid), now()) || null;
  }

  function signIn(p) {
    const t = iso();
    const old = db.prepare("SELECT id FROM users WHERE google_sub = ?").get(p.sub);
    if (old) db.prepare("UPDATE users SET email = ?, name = ?, last_login_at = ? WHERE id = ?").run(p.email, p.name || null, t, old.id);
    else db.prepare("INSERT INTO users (google_sub, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)").run(p.sub, p.email, p.name || null, t, t);
    const id = old ? old.id : db.prepare("SELECT id FROM users WHERE google_sub = ?").get(p.sub).id;
    const sid = rand();
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha(sid), id, now() + SESSION_DAYS * 864e5);
    return { sid, isNew: !old };
  }

  async function callback(req, res, url) {
    const fail = (why) => go(res, `/#login?error=${why}`, [cookie(req, "hayz_oauth_state", "", 0)]);
    const q = url.searchParams;
    if (q.get("error")) return fail("denied");
    if (!safeEq(q.get("state") || "", cookies(req.headers.cookie).hayz_oauth_state || "")) return fail("state");
    let p;
    try {
      const r = await fetchImpl("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: q.get("code") || "", client_id: clientId, client_secret: secret, redirect_uri: `${baseUrl(req)}/auth/google/callback`, grant_type: "authorization_code" }),
      });
      const tok = await r.json();
      if (!r.ok) return fail("exchange");
      p = readIdToken(tok.id_token, clientId, now()); // access token은 로그인에만 쓰고 저장하지 않음
    } catch (e) { return fail(e.message === "email" ? "email" : "exchange"); }
    const { sid, isNew } = signIn(p);
    go(res, isNew ? "/account?welcome=1" : "/account", [cookie(req, "hayz_sid", sid, SESSION_DAYS * 86400), cookie(req, "hayz_oauth_state", "", 0)]);
  }

  async function api(req, res, url) {
    const p = url.pathname;
    if (p === "/auth/health") return send(res, 200, { ok: true, login: Boolean(secret) });
    if (p === "/auth/google/start") {
      if (!secret) return go(res, "/#login?error=setup");
      const state = rand(16);
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({ client_id: clientId, redirect_uri: `${baseUrl(req)}/auth/google/callback`, response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
      return go(res, auth.href, [cookie(req, "hayz_oauth_state", state, 600)]);
    }
    if (p === "/auth/google/callback") return callback(req, res, url);
    const user = currentUser(req);
    if (p === "/auth/me") return user ? send(res, 200, { user }) : send(res, 401, { user: null });
    // 아래는 바꾸는 요청: POST + 같은 사이트만 붙일 수 있는 헤더(CSRF 방지)
    if (req.method !== "POST" || req.headers["x-hayz"] !== "1") return send(res, 405, { error: "method" });
    if (p === "/auth/logout") {
      const sid = cookies(req.headers.cookie).hayz_sid;
      if (sid) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha(sid));
      return send(res, 200, { ok: true }, { "set-cookie": cookie(req, "hayz_sid", "", 0) });
    }
    if (!user) return send(res, 401, { error: "login" });
    if (p === "/auth/profile") {
      const office = String((await readBody(req).catch(() => ({}))).office ?? "").trim().slice(0, 40);
      db.prepare("UPDATE users SET office = ? WHERE id = ?").run(office || null, user.id);
      return send(res, 200, { user: { ...user, office: office || null } });
    }
    if (p === "/auth/delete") { // 회원 탈퇴: 계정과 세션을 바로 지움
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      return send(res, 200, { ok: true }, { "set-cookie": cookie(req, "hayz_sid", "", 0) });
    }
    return send(res, 404, { error: "not found" });
  }

  function file(req, res, url) {
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    if (rel === "" ) rel = "index.html";
    if (rel === "account") rel = "account.html";
    const top = rel.split("/")[0];
    let full = path.join(root, rel);
    if (!PUBLIC.has(top) || !full.startsWith(root + path.sep) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) full = path.join(root, "index.html"); // 모르는 주소는 홈으로
    const ext = path.extname(full);
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" });
    fs.createReadStream(full).pipe(res);
  }

  return async (req, res) => {
    try {
      const url = new URL(req.url, "http://x");
      if (url.pathname.startsWith("/auth/")) return await api(req, res, url);
      if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method");
      file(req, res, url);
    } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, { error: "server" }); }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  if (!process.env.GOOGLE_CLIENT_SECRET) console.warn("GOOGLE_CLIENT_SECRET 없음 — 홈페이지는 열리지만 가입 · 로그인은 꺼집니다.");
  http.createServer(createApp()).listen(port, () => console.log(`HAYZ web on :${port}`));
}
