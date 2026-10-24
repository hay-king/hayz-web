import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
export const GOOGLE_SCOPE = 'openid email profile';

export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function createGoogleAuth({
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  clockSkewMs = 60_000,
} = {}) {
  let jwksCache = { expiresAt: 0, keys: [] };

  async function getKeys() {
    if (jwksCache.keys.length && jwksCache.expiresAt > now()) return jwksCache.keys;
    const response = await fetchImpl(JWKS_URL);
    if (!response.ok) throw new Error('jwks');
    const body = await response.json();
    const keys = Array.isArray(body.keys) ? body.keys : [];
    jwksCache = { expiresAt: now() + 60 * 60 * 1000, keys };
    return keys;
  }

  return {
    scope: GOOGLE_SCOPE,
    buildAuthUrl({ clientId, redirectUri, state, codeChallenge }) {
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', GOOGLE_SCOPE);
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('prompt', 'select_account');
      return url.toString();
    },
    async exchangeCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
      const body = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      });
      const response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: body.toString(),
      });
      if (!response.ok) throw new Error('token_exchange');
      const tokens = await response.json();
      if (!tokens || typeof tokens.id_token !== 'string') throw new Error('token_exchange');
      return verifyIdToken(tokens.id_token, {
        clientId,
        now,
        clockSkewMs,
        keys: await getKeys(),
      });
    },
  };
}

export function verifyIdToken(idToken, { clientId, now, clockSkewMs = 60_000, keys }) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('id_token');
  const [headerPart, payloadPart, signaturePart] = parts;
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    throw new Error('id_token');
  }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('id_token');
  const jwk = (keys || []).find((key) => key && key.kid === header.kid);
  if (!jwk) throw new Error('id_token');
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  } catch {
    throw new Error('id_token');
  }
  const valid = crypto.verify(
    'sha256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url'),
  );
  if (!valid) throw new Error('id_token');
  if (!ISSUERS.has(payload.iss)) throw new Error('id_token');
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(clientId)) throw new Error('id_token');
  const current = now();
  if (typeof payload.exp !== 'number' || payload.exp * 1000 + clockSkewMs < current) throw new Error('id_token');
  if (typeof payload.iat === 'number' && payload.iat * 1000 > current + clockSkewMs) throw new Error('id_token');
  const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) throw new Error('unverified');
  if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('id_token');
  if (typeof payload.email !== 'string' || !payload.email) throw new Error('id_token');
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: true,
    name: typeof payload.name === 'string' ? payload.name : '',
    picture: typeof payload.picture === 'string' ? payload.picture : '',
  };
}
