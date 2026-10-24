import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { before } from 'node:test';
import { GOOGLE_SCOPE, createGoogleAuth, createPkcePair, verifyIdToken } from '../src/auth/google.mjs';

const NOW = Date.parse('2026-10-24T03:00:00Z');
let privateKey;
let jwk;

before(() => {
  const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = keys.privateKey;
  jwk = keys.publicKey.export({ format: 'jwk' });
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
});

function claims(overrides = {}) {
  const now = Math.floor(NOW / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: 'test-client-id',
    sub: 'google-sub-hong',
    email: 'hong@example.com',
    email_verified: true,
    name: '홍길동',
    picture: 'https://lh3.googleusercontent.com/a/example',
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

function signJwt(payload, { alg = 'RS256', kid = 'test-key' } = {}) {
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT', kid })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const data = `${header}.${body}`;
  if (alg === 'none') return `${data}.`;
  const signature = crypto.sign('sha256', Buffer.from(data), privateKey);
  return `${data}.${signature.toString('base64url')}`;
}

function verify(token) {
  return verifyIdToken(token, {
    clientId: 'test-client-id',
    now: () => NOW,
    keys: [jwk],
  });
}

test('인가 주소는 openid email profile과 PKCE S256만 보낸다', () => {
  const { verifier, challenge } = createPkcePair();
  assert.equal(crypto.createHash('sha256').update(verifier).digest('base64url'), challenge);
  const url = new URL(createGoogleAuth().buildAuthUrl({
    clientId: 'test-client-id',
    redirectUri: 'http://localhost:4320/auth/google/callback',
    state: 'state-value',
    codeChallenge: challenge,
  }));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), GOOGLE_SCOPE);
  assert.equal(GOOGLE_SCOPE, 'openid email profile');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('include_granted_scopes'), null);
  assert.equal(url.toString().includes('gmail'), false);
  assert.equal(url.toString().includes('client_secret'), false);
});

test('구글 id_token의 서명, 발급자, 대상, 만료, 이메일 확인을 검사한다', () => {
  const profile = verify(signJwt(claims()));
  assert.equal(profile.email, 'hong@example.com');
  assert.equal(profile.name, '홍길동');
  assert.equal(profile.sub, 'google-sub-hong');
  assert.equal(verify(signJwt(claims({ email_verified: 'true' }))).emailVerified, true);

  const now = Math.floor(NOW / 1000);
  assert.throws(() => verify(signJwt(claims({ aud: 'other-client' }))), /id_token/);
  assert.throws(() => verify(signJwt(claims({ iss: 'https://evil.example.com' }))), /id_token/);
  assert.throws(() => verify(signJwt(claims({ exp: now - 120 }))), /id_token/);
  assert.doesNotThrow(() => verify(signJwt(claims({ exp: now - 30 }))));
  assert.throws(() => verify(signJwt(claims(), { alg: 'none' })), /id_token/);
  assert.throws(() => verify(signJwt(claims({ email_verified: false }))), /unverified/);
  const tampered = signJwt(claims()).slice(0, -2) + 'aa';
  assert.throws(() => verify(tampered), /id_token/);
});

test('코드 교환은 PKCE verifier를 보내고 id_token만 회원 정보로 돌린다', async () => {
  const token = signJwt(claims());
  const calls = [];
  const google = createGoogleAuth({
    now: () => NOW,
    fetchImpl: async (url, options = {}) => {
      calls.push({ url: String(url), body: options.body || '' });
      if (String(url).includes('/token')) return { ok: true, json: async () => ({ id_token: token, access_token: 'should-not-leak' }) };
      if (String(url).includes('/certs')) return { ok: true, json: async () => ({ keys: [jwk] }) };
      throw new Error('unexpected');
    },
  });
  const profile = await google.exchangeCode({
    code: 'auth-code',
    codeVerifier: 'verifier-value',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    redirectUri: 'https://hayz.example.com/auth/google/callback',
  });
  assert.equal(profile.name, '홍길동');
  assert.equal(calls[0].body.includes('code_verifier=verifier-value'), true);
  assert.equal(calls[0].body.includes('grant_type=authorization_code'), true);
  assert.equal(calls[0].body.includes('client_secret=test-client-secret'), true);
  assert.equal(calls[0].body.includes('gmail'), false);
  assert.equal(JSON.stringify(profile).includes('should-not-leak'), false);
});
