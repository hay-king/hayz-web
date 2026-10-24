import assert from 'node:assert/strict';
import test from 'node:test';
import { api, beginLogin, callback, person, signup, withHarness } from './helpers.mjs';

test('이메일이 일치할 때만 탈퇴하고 개인정보를 지운다', async () => {
  await withHarness({}, async (harness) => {
    const { jar } = await signup(harness);
    const me = await api(harness, jar, '/api/me');
    const { csrfToken, user } = await me.json();
    const wrong = await api(harness, jar, '/api/me/withdraw', {
      method: 'POST',
      token: csrfToken,
      body: { confirmEmail: 'other@example.com', understand: true },
    });
    assert.equal(wrong.status, 400);
    assert.equal(harness.db.users.findById(user.id).email, 'hong@example.com');
    const unchecked = await api(harness, jar, '/api/me/withdraw', {
      method: 'POST',
      token: csrfToken,
      body: { confirmEmail: 'hong@example.com', understand: false },
    });
    assert.equal(unchecked.status, 400);
    const ok = await api(harness, jar, '/api/me/withdraw', {
      method: 'POST',
      token: csrfToken,
      body: { confirmEmail: 'Hong@Example.com', understand: true },
    });
    assert.equal(ok.status, 200);
    const withdrawn = harness.db.users.findById(user.id);
    assert.equal(withdrawn.status, 'withdrawn');
    assert.equal(withdrawn.email, null);
    assert.equal(withdrawn.name, null);
    assert.equal(withdrawn.picture, null);
    assert.equal(withdrawn.googleSub, null);
    assert.equal((await api(harness, jar, '/api/me')).status, 401);
  });
});

test('탈퇴한 구글 계정으로 다시 로그인하면 새 동의부터 시작한다', async () => {
  await withHarness({
    profiles: { 'auth-code': person({ sub: 'google-sub-hong' }) },
  }, async (harness) => {
    const first = await signup(harness);
    const me = await api(harness, first.jar, '/api/me');
    const { csrfToken, user } = await me.json();
    await api(harness, first.jar, '/api/me/withdraw', {
      method: 'POST',
      token: csrfToken,
      body: { confirmEmail: 'hong@example.com', understand: true },
    });
    const start = await beginLogin(harness);
    const back = await callback(harness, start.jar, start.state);
    assert.equal(new URL(back.headers.get('location'), harness.base).pathname, '/signup/consent');
    assert.equal(harness.db.users.findById(user.id).status, 'withdrawn');
    assert.equal(harness.db.users.findByGoogleSub('google-sub-hong'), null);
  });
});
