import assert from 'node:assert/strict';
import test from 'node:test';
import { authConfigured, cookieSecure, loadConfig, redirectUri } from '../src/config.mjs';

test('환경변수 이름만으로 콜백 주소와 쿠키 Secure를 정한다', () => {
  const config = loadConfig({
    PORT: '8080',
    PUBLIC_BASE_URL: 'https://hayz.example.com/',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    SESSION_SECRET: 'x'.repeat(32),
    ADMIN_EMAILS: ' Admin@Example.com , hong@example.com ',
    SESSION_IDLE_SECONDS: '1800',
    SESSION_ABSOLUTE_SECONDS: '86400',
  });
  assert.equal(config.port, 8080);
  assert.equal(config.publicBaseUrl, 'https://hayz.example.com');
  assert.equal(redirectUri(config), 'https://hayz.example.com/auth/google/callback');
  assert.deepEqual(config.adminEmails, ['admin@example.com', 'hong@example.com']);
  assert.equal(config.sessionIdleMs, 1800 * 1000);
  assert.equal(config.sessionAbsoluteMs, 86400 * 1000);
  assert.equal(cookieSecure(config), true);
  assert.equal(authConfigured(config), true);
});

test('값이 없으면 포트 4320을 쓰고 로그인을 열지 않는다', () => {
  const config = loadConfig({});
  assert.equal(config.port, 4320);
  assert.equal(cookieSecure(config), false);
  assert.equal(authConfigured(config), false);
  assert.equal(authConfigured(loadConfig({
    PUBLIC_BASE_URL: 'http://localhost:4320',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    SESSION_SECRET: 'x'.repeat(31),
  })), false);
});
