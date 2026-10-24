import { normalizeEmail } from '../profile.mjs';
import { formatKst } from '../time.mjs';

export function memberView(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    status: user.status,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    consentedAt: user.consentedAt,
    termsVersion: user.termsVersion,
    privacyVersion: user.privacyVersion,
    createdAtLabel: formatKst(user.createdAt),
    lastLoginAtLabel: formatKst(user.lastLoginAt),
    consentedAtLabel: formatKst(user.consentedAt),
  };
}

export function withdrawAccount({ db, user, confirmEmail, understand, now }) {
  if (understand !== true) return { ok: false, status: 400, error: 'confirm' };
  const email = normalizeEmail(confirmEmail);
  if (!email || email !== user.email) return { ok: false, status: 400, error: 'confirm_email' };
  db.pending.deleteByGoogleSub(user.googleSub);
  db.sessions.deleteByUser(user.id);
  db.users.anonymize(user.id, now());
  return { ok: true };
}
