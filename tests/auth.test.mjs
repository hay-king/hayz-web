// 가입 · 로그인 서버 — 가짜 구글 응답으로 state 대조 · 신규/재로그인 · 세션 · CSRF 헤더 · 탈퇴 · 정적 파일 보호를 확인.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createApp, openDb, readIdToken } from "../server.mjs";

const CID = "cid.apps.googleusercontent.com";
const NOW = Date.parse("2026-10-24T12:00:00Z");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (p) => `${b64({ alg: "RS256" })}.${b64({ iss: "https://accounts.google.com", aud: CID, exp: NOW / 1000 + 3600, sub: "g-1", email: "hong@example.com", email_verified: true, name: "홍길동", ...p })}.sig`;

async function boot(env = { GOOGLE_CLIENT_ID: CID, GOOGLE_CLIENT_SECRET: "s", APP_BASE_URL: "https://hayz.example.com" }, token = {}) {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, body: String(init.body) }); return { ok: true, json: async () => ({ id_token: idToken(token) }) }; };
  const server = http.createServer(createApp({ env, db: openDb(":memory:"), fetchImpl, now: () => NOW }));
  await new Promise((ok) => server.listen(0, ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, { method = "GET", cookie = "", headers = {}, body } = {}) => fetch(base + path, { method, redirect: "manual", headers: { cookie, ...headers }, body });
  return { server, req, seen };
}
const setCookies = (r) => r.headers.getSetCookie();
const cookieOf = (r, name) => setCookies(r).map((c) => c.split(";")[0]).find((c) => c.startsWith(name + "="));

async function signIn(t) {
  const start = await t.req("/auth/google/start");
  const state = new URL(start.headers.get("location")).searchParams.get("state");
  const cb = await t.req(`/auth/google/callback?code=abc&state=${state}`, { cookie: cookieOf(start, "hayz_oauth_state") });
  return { start, cb, sid: cookieOf(cb, "hayz_sid") };
}

test("id_token 확인: 발급자 · 대상 · 만료 · 이메일 인증", () => {
  const read = (p) => readIdToken(idToken(p), CID, NOW);
  assert.equal(read({}).email, "hong@example.com");
  assert.throws(() => read({ aud: "other" }), /token/);
  assert.throws(() => read({ iss: "evil.com" }), /token/);
  assert.throws(() => read({ exp: NOW / 1000 - 1 }), /token/);
  assert.throws(() => read({ email_verified: false }), /email/);
});

test("가입 → 내 계정 → 재로그인 → 로그아웃", async () => {
  const t = await boot();
  try {
    const { start, cb, sid } = await signIn(t);
    const auth = new URL(start.headers.get("location"));
    assert.equal(auth.origin, "https://accounts.google.com");
    assert.equal(auth.searchParams.get("redirect_uri"), "https://hayz.example.com/auth/google/callback");
    assert.match(setCookies(start)[0], /HttpOnly.*Secure|Secure.*HttpOnly/);
    assert.match(t.seen[0].body, /client_secret=s/);
    assert.equal(cb.headers.get("location"), "/account?welcome=1"); // 신규 가입
    let me = await (await t.req("/auth/me", { cookie: sid })).json();
    assert.equal(me.user.name, "홍길동");
    assert.equal(me.user.google_sub, undefined); // 내부 값은 내보내지 않음
    // 사무실 이름: CSRF 헤더 없으면 거절
    assert.equal((await t.req("/auth/profile", { method: "POST", cookie: sid, body: '{"office":"x"}' })).status, 405);
    const saved = await (await t.req("/auth/profile", { method: "POST", cookie: sid, headers: { "x-hayz": "1" }, body: '{"office":"  김예시 사무소  "}' })).json();
    assert.equal(saved.user.office, "김예시 사무소");
    const again = await signIn(t);
    assert.equal(again.cb.headers.get("location"), "/account"); // 같은 구글 계정은 로그인
    await t.req("/auth/logout", { method: "POST", cookie: sid, headers: { "x-hayz": "1" } });
    assert.equal((await t.req("/auth/me", { cookie: sid })).status, 401);
    me = await (await t.req("/auth/me", { cookie: again.sid })).json();
    assert.equal(me.user.office, "김예시 사무소");
  } finally { t.server.close(); }
});

test("state 불일치 · 구글 거부 · 미인증 이메일 · 키 없음 → 가입 창으로 안내", async () => {
  const t = await boot();
  try {
    const start = await t.req("/auth/google/start");
    const bad = await t.req("/auth/google/callback?code=abc&state=wrong", { cookie: cookieOf(start, "hayz_oauth_state") });
    assert.equal(bad.headers.get("location"), "/#login?error=state");
    assert.equal((await t.req("/auth/google/callback?error=access_denied")).headers.get("location"), "/#login?error=denied");
    assert.equal(t.seen.length, 0);
  } finally { t.server.close(); }
  const u = await boot(undefined, { email_verified: false });
  try { assert.equal((await signIn(u)).cb.headers.get("location"), "/#login?error=email"); } finally { u.server.close(); }
  const off = await boot({});
  try {
    assert.deepEqual(await (await off.req("/auth/health")).json(), { ok: true, login: false });
    assert.equal((await off.req("/auth/google/start")).headers.get("location"), "/#login?error=setup");
  } finally { off.server.close(); }
});

test("회원 탈퇴: 계정 · 세션 삭제", async () => {
  const t = await boot();
  try {
    const { sid } = await signIn(t);
    assert.equal((await t.req("/auth/delete", { method: "POST", cookie: sid, headers: { "x-hayz": "1" } })).status, 200);
    assert.equal((await t.req("/auth/me", { cookie: sid })).status, 401);
    assert.equal((await signIn(t)).cb.headers.get("location"), "/account?welcome=1"); // 다시 오면 새 가입
  } finally { t.server.close(); }
});

test("정적 파일: 공개 폴더만, 서버 코드 · 문서 · DB는 홈으로", async () => {
  const t = await boot();
  try {
    assert.match(await (await t.req("/account")).text(), /내 계정/);
    assert.match((await t.req("/css/style.css")).headers.get("content-type"), /text\/css/);
    for (const p of ["/server.mjs", "/package.json", "/data/hayz.db", "/구글로그인설계.md", "/../server.mjs", "/js/../server.mjs"]) {
      const body = await (await t.req(encodeURI(p))).text();
      assert.doesNotMatch(body, /createApp|DatabaseSync|"scripts"/, p);
    }
  } finally { t.server.close(); }
});
