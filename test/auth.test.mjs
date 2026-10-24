import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginLogin,
  callback,
  consent,
  cookieLine,
  loginExisting,
  person,
  signup,
  withHarness,
} from './helpers.mjs';

test('첫 로그인은 동의 전에는 회원을 만들지 않고, 동의 후 약관 버전을 저장한다', async () => {
  await withHarness({}, async (harness) => {
    const { jar, start, back, response } = await signup(harness);
    const authUrl = new URL(start.location);
    assert.equal(start.response.status, 302);
    assert.equal(authUrl.searchParams.get('scope'), 'openid email profile');
    assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:4320/auth/google/callback');
    assert.equal(start.location.includes('gmail'), false);
    assert.equal(start.location.includes('test-client-secret'), false);
    assert.match(cookieLine(start.response, 'hayz_oauth'), /HttpOnly/);
    assert.match(cookieLine(start.response, 'hayz_oauth'), /SameSite=Lax/);
    assert.doesNotMatch(cookieLine(start.response, 'hayz_oauth'), /\bSecure\b/);
    assert.equal(new URL(back.headers.get('location'), harness.base).pathname, '/signup/consent');
    assert.equal(harness.db.users.countMembers(), 1);
    assert.equal(response.status, 200);
    const user = harness.db.users.findByEmail('hong@example.com');
    assert.equal(user.name, '홍길동');
    assert.equal(user.picture, 'https://lh3.googleusercontent.com/a/example');
    assert.equal(user.termsVersion, '2026-10-24');
    assert.equal(user.privacyVersion, '2026-10-24');
    assert.equal(user.consentedAt, harness.clock.t);
    assert.equal(user.role, 'user');
    assert.match(cookieLine(response, 'hayz_sid'), /HttpOnly/);
    assert.match(cookieLine(response, 'hayz_sid'), /SameSite=Lax/);
    const me = await fetch(`${harness.base}/api/me`, { headers: { cookie: jar.header() } });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.user.email, 'hong@example.com');
    assert.equal(body.user.name, '홍길동');
  });
});

test('state가 다르면 구글 교환을 하지 않는다', async () => {
  await withHarness({}, async (harness) => {
    const { jar, state } = await beginLogin(harness);
    const response = await callback(harness, jar, `${state}x`);
    assert.equal(new URL(response.headers.get('location'), harness.base).searchParams.get('auth_error'), 'state');
    assert.equal(harness.exchanges(), 0);
    assert.equal(harness.db.users.countMembers(), 0);
  });
});

test('동의 체크와 CSRF가 없으면 가입되지 않는다', async () => {
  await withHarness({}, async (harness) => {
    const jarStart = await beginLogin(harness);
    await callback(harness, jarStart.jar, jarStart.state);
    const missing = await consent(harness, jarStart.jar, { agreeTerms: false, agreePrivacy: true });
    assert.equal(missing.response.status, 400);
    assert.equal(harness.db.users.countMembers(), 0);
    const badToken = await consent(harness, jarStart.jar, { token: 'not-the-token' });
    assert.equal(badToken.response.status, 403);
    const badOrigin = await consent(harness, jarStart.jar, { origin: false });
    assert.equal(badOrigin.response.status, 403);
    assert.equal(harness.db.users.countMembers(), 0);
    const ok = await consent(harness, jarStart.jar);
    assert.equal(ok.response.status, 200);
  });
});

test('이미 동의한 회원은 동의 화면 없이 로그인한다', async () => {
  await withHarness({}, async (harness) => {
    await signup(harness);
    const again = await loginExisting(harness);
    assert.equal(new URL(again.back.headers.get('location'), harness.base).pathname, '/me');
    assert.match(cookieLine(again.back, 'hayz_sid'), /HttpOnly/);
    assert.equal(harness.db.users.countMembers(), 1);
    const me = await fetch(`${harness.base}/api/me`, { headers: { cookie: again.jar.header() } });
    assert.equal((await me.json()).user.email, 'hong@example.com');
  });
});

test('https 공개 주소에서는 세션 쿠키에 Secure를 붙인다', async () => {
  await withHarness({ config: { publicBaseUrl: 'https://hayz.example.com' } }, async (harness) => {
    const { response } = await signup(harness);
    const line = cookieLine(response, 'hayz_sid');
    assert.match(line, /HttpOnly/);
    assert.match(line, /SameSite=Lax/);
    assert.match(line, /\bSecure\b/);
  });
});

test('서명만 바꾼 세션 쿠키는 거절한다', async () => {
  await withHarness({}, async (harness) => {
    const { jar } = await signup(harness);
    const value = jar.cookies.get('hayz_sid');
    jar.cookies.set('hayz_sid', `${value.slice(0, -1)}x`);
    const response = await fetch(`${harness.base}/api/me`, { headers: { cookie: jar.header() } });
    assert.equal(response.status, 401);
  });
});

test('확인되지 않은 이메일, 정지 계정, 같은 이메일의 다른 구글 계정은 로그인되지 않는다', async () => {
  await withHarness({
    profiles: {
      'auth-code': person(),
      'plain': person({ emailVerified: false, sub: 'google-sub-plain' }),
      'other': person({ sub: 'google-sub-other', email: 'hong@example.com' }),
      'admin-code': person({ sub: 'google-sub-admin', email: 'admin@example.com' }),
    },
  }, async (harness) => {
    const unverified = await beginLogin(harness);
    const unverifiedBack = await callback(harness, unverified.jar, unverified.state, 'plain');
    assert.equal(new URL(unverifiedBack.headers.get('location'), harness.base).searchParams.get('auth_error'), 'unverified');
    await signup(harness);
    const clash = await beginLogin(harness);
    const clashBack = await callback(harness, clash.jar, clash.state, 'other');
    assert.equal(new URL(clashBack.headers.get('location'), harness.base).searchParams.get('auth_error'), 'email_in_use');
    assert.equal(harness.db.users.countMembers(), 1);
    harness.db.users.setStatus(harness.db.users.findByEmail('hong@example.com').id, 'suspended');
    const blocked = await loginExisting(harness);
    assert.equal(new URL(blocked.back.headers.get('location'), harness.base).searchParams.get('auth_error'), 'suspended');
  });
});

test('안전하지 않은 사진 주소는 저장하지 않고 관리자 이메일은 관리자가 된다', async () => {
  await withHarness({
    profiles: {
      'auth-code': person({ picture: 'javascript:alert(1)' }),
      'admin-code': person({ sub: 'google-sub-admin', email: 'Admin@Example.com', picture: 'https://files.example.com/a.png' }),
    },
  }, async (harness) => {
    await signup(harness);
    assert.equal(harness.db.users.findByEmail('hong@example.com').picture, null);
    const admin = await signup(harness, 'admin-code');
    assert.equal(admin.response.status, 200);
    const adminUser = harness.db.users.findByEmail('admin@example.com');
    assert.equal(adminUser.role, 'admin');
    assert.equal(adminUser.name, '홍길동');
    assert.equal(adminUser.picture, null);
  });
});

test('로그인 설정이 없으면 홈은 열리고 시작 주소는 안내로 돌아간다', async () => {
  await withHarness({ config: { googleClientId: '' } }, async (harness) => {
    const home = await fetch(harness.base);
    assert.equal(home.status, 200);
    const start = await fetch(`${harness.base}/auth/google/start`, { redirect: 'manual' });
    assert.equal(new URL(start.headers.get('location'), harness.base).searchParams.get('auth_error'), 'config');
  });
});

test('구글이 거절하면 denied로 돌아간다', async () => {
  await withHarness({}, async (harness) => {
    const start = await beginLogin(harness);
    const response = await fetch(`${harness.base}/auth/google/callback?error=access_denied&state=${start.state}`, {
      redirect: 'manual',
      headers: { cookie: start.jar.header() },
    });
    assert.equal(new URL(response.headers.get('location'), harness.base).searchParams.get('auth_error'), 'denied');
    assert.equal(harness.exchanges(), 0);
  });
});
