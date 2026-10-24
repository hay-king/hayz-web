export function loadConfig(env = process.env) {
  const publicBaseUrl = String(env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return {
    port: positiveInt(env.PORT, 4320),
    publicBaseUrl,
    googleClientId: String(env.GOOGLE_CLIENT_ID || '').trim(),
    googleClientSecret: String(env.GOOGLE_CLIENT_SECRET || '').trim(),
    sessionSecret: String(env.SESSION_SECRET || ''),
    adminEmails: parseEmailList(env.ADMIN_EMAILS || ''),
    dataDir: String(env.DATA_DIR || './data').trim() || './data',
    sessionIdleMs: positiveInt(env.SESSION_IDLE_SECONDS, 7200) * 1000,
    sessionAbsoluteMs: positiveInt(env.SESSION_ABSOLUTE_SECONDS, 604800) * 1000,
    termsVersion: String(env.TERMS_VERSION || '2026-10-24').trim() || '2026-10-24',
    privacyVersion: String(env.PRIVACY_VERSION || '2026-10-24').trim() || '2026-10-24',
    trustProxy: String(env.TRUST_PROXY || '').trim() === 'true',
  };
}

export function missingAuthEnv(config) {
  const missing = [];
  if (!config.publicBaseUrl) missing.push('PUBLIC_BASE_URL');
  if (!config.googleClientId) missing.push('GOOGLE_CLIENT_ID');
  if (!config.googleClientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!config.sessionSecret || config.sessionSecret.length < 32) missing.push('SESSION_SECRET');
  return missing;
}

export function authConfigured(config) {
  return missingAuthEnv(config).length === 0;
}

export function redirectUri(config) {
  return `${config.publicBaseUrl}/auth/google/callback`;
}

export function cookieSecure(config) {
  return config.publicBaseUrl.startsWith('https://');
}

export function parseEmailList(value) {
  return String(value)
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function positiveInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}
