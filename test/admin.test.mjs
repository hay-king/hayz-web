import assert from 'node:assert/strict';
import test from 'node:test';
import { adminStats } from '../src/admin/service.mjs';
import { openDatabase } from '../src/db/index.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { api, loginExisting, person, signup, withHarness } from './helpers.mjs';

function row(overrides) {
  return {
    id: overrides.id,
    googleSub: overrides.googleSub,
    email: overrides.email,
    name: '홍길동',
    picture: null,
    createdAt: overrides.createdAt,
    lastLoginAt: overrides.createdAt,
    status: 'active',
    role: 'user',
    termsVersion: '2026-10-24',
    privacyVersion: '2026-10-24',
    consentedAt: overrides.createdAt,
  };
}

test('가입 추이는 한국 시간 날짜로 나뉜다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hayz-db-'));
  const db = openDatabase(dir);
  try {
    db.users.insert(row({
      id: 'before',
      googleSub: 'google-sub-before',
      email: 'before@example.com',
      createdAt: Date.parse('2026-10-23T14:00:00Z'),
    }));
    db.users.insert(row({
      id: 'after',
      googleSub: 'google-sub-after',
      email: 'after@example.com',
      createdAt: Date.parse('2026-10-23T15:30:00Z'),
    }));
    const stats = adminStats(db, Date.parse('2026-10-24T03:00:00Z'), 7);
    assert.equal(stats.todaySignups, 1);
    assert.equal(stats.totalMembers, 2);
    assert.equal(stats.trend.find((point) => point.date === '2026-10-23').count, 1);
    assert.equal(stats.trend.find((point) => point.date === '2026-10-24').count, 1);
    assert.equal(stats.trend.length, 7);
    const found = db.users.search({ query: '홍길동' });
    assert.equal(found.total, 2);
    assert.equal(db.users.search({ query: '%' }).total, 0);
    assert.equal(db.users.search({ query: "' OR 1=1 --" }).total, 0);
    assert.equal(db.users.search({ query: 'before@example.com' }).users[0].name, '홍길동');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('관리자만 회원 목록, 정지, 역할 변경을 할 수 있다', async () => {
  await withHarness({
    profiles: {
      'auth-code': person(),
      'admin-code': person({ sub: 'google-sub-admin', email: 'admin@example.com' }),
    },
  }, async (harness) => {
    const anon = await fetch(`${harness.base}/admin`, { redirect: 'manual' });
    assert.equal(anon.status, 302);
    assert.equal(new URL(anon.headers.get('location'), harness.base).searchParams.get('auth_error'), 'login');
    assert.equal((await fetch(`${harness.base}/api/admin/stats`)).status, 401);

    const member = await signup(harness);
    const admin = await signup(harness, 'admin-code');
    assert.equal((await api(harness, member.jar, '/admin')).status, 403);
    assert.equal((await api(harness, member.jar, '/api/admin/stats')).status, 403);

    const stats = await api(harness, admin.jar, '/api/admin/stats?days=7');
    assert.equal(stats.status, 200);
    const statsBody = await stats.json();
    assert.equal(statsBody.totalMembers, 2);
    assert.equal(statsBody.todaySignups, 2);
    assert.equal(statsBody.trend.length, 7);
    assert.ok(statsBody.recentLogins.some((item) => item.email === 'hong@example.com'));

    const hong = harness.db.users.findByEmail('hong@example.com');
    const noToken = await api(harness, admin.jar, `/api/admin/users/${hong.id}/status`, {
      method: 'POST',
      body: { status: 'suspended' },
    });
    assert.equal(noToken.status, 403);
    assert.equal(harness.db.users.findById(hong.id).status, 'active');

    const noOrigin = await api(harness, admin.jar, `/api/admin/users/${hong.id}/status`, {
      method: 'POST',
      token: statsBody.csrfToken,
      origin: false,
      body: { status: 'suspended' },
    });
    assert.equal(noOrigin.status, 403);

    const self = await api(harness, admin.jar, `/api/admin/users/${harness.db.users.findByEmail('admin@example.com').id}/status`, {
      method: 'POST',
      token: statsBody.csrfToken,
      body: { status: 'suspended' },
    });
    assert.equal(self.status, 403);
    assert.equal((await self.json()).error, 'last_admin');

    const demoteSelf = await api(harness, admin.jar, `/api/admin/users/${harness.db.users.findByEmail('admin@example.com').id}/role`, {
      method: 'POST',
      token: statsBody.csrfToken,
      body: { role: 'user' },
    });
    assert.equal((await demoteSelf.json()).error, 'last_admin');

    const suspended = await api(harness, admin.jar, `/api/admin/users/${hong.id}/status`, {
      method: 'POST',
      token: statsBody.csrfToken,
      body: { status: 'suspended' },
    });
    assert.equal(suspended.status, 200);
    assert.equal((await api(harness, member.jar, '/api/me')).status, 401);

    const restored = await api(harness, admin.jar, `/api/admin/users/${hong.id}/status`, {
      method: 'POST',
      token: statsBody.csrfToken,
      body: { status: 'active' },
    });
    assert.equal(restored.status, 200);
    const promoted = await api(harness, admin.jar, `/api/admin/users/${hong.id}/role`, {
      method: 'POST',
      token: statsBody.csrfToken,
      body: { role: 'admin' },
    });
    assert.equal(promoted.status, 200);
    const memberAgain = await loginExisting(harness, 'auth-code');
    const seen = await api(harness, memberAgain.jar, '/api/me');
    assert.equal((await seen.json()).user.role, 'admin');

    const search = await api(harness, admin.jar, `/api/admin/users?q=${encodeURIComponent('홍길동')}`);
    const searched = await search.json();
    assert.ok(searched.total >= 2);
    assert.ok(searched.users.every((user) => user.name === '홍길동' || user.name == null));
  });
});
