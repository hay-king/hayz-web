import assert from 'node:assert/strict';
import test from 'node:test';
import { api, signup, withHarness } from './helpers.mjs';

test('유휴 시간이 지나면 세션이 끝나고, 그 안의 요청은 유휴 시간을 늘린다', async () => {
  await withHarness({ config: { sessionIdleMs: 10_000, sessionAbsoluteMs: 100_000 } }, async (harness) => {
    const { jar } = await signup(harness);
    const started = harness.clock.t;
    harness.clock.t = started + 9_000;
    assert.equal((await api(harness, jar, '/api/me')).status, 200);
    harness.clock.t = started + 18_000;
    assert.equal((await api(harness, jar, '/api/me')).status, 200);
    harness.clock.t = started + 28_000;
    assert.equal((await api(harness, jar, '/api/me')).status, 401);
  });
});

test('절대 만료는 활동으로 늘어나지 않는다', async () => {
  await withHarness({ config: { sessionIdleMs: 1_000_000, sessionAbsoluteMs: 8_000 } }, async (harness) => {
    const { jar } = await signup(harness);
    const started = harness.clock.t;
    harness.clock.t = started + 7_000;
    assert.equal((await api(harness, jar, '/api/me')).status, 200);
    harness.clock.t = started + 8_000;
    const expired = await api(harness, jar, '/api/me');
    assert.equal(expired.status, 401);
    assert.equal((await expired.json()).error, 'expired');
  });
});

test('로그아웃은 CSRF가 있어야 세션을 지운다', async () => {
  await withHarness({}, async (harness) => {
    const { jar } = await signup(harness);
    const me = await api(harness, jar, '/api/me');
    const { csrfToken } = await me.json();
    const missing = await api(harness, jar, '/api/auth/logout', { method: 'POST' });
    assert.equal(missing.status, 403);
    assert.equal((await api(harness, jar, '/api/me')).status, 200);
    const gone = await api(harness, jar, '/api/auth/logout', { method: 'POST', token: csrfToken });
    assert.equal(gone.status, 200);
    assert.equal((await api(harness, jar, '/api/me')).status, 401);
  });
});
