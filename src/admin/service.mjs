import { formatKst, addDays, kstDateString, kstDayStart } from '../time.mjs';

const STATUS = new Set(['active', 'suspended']);
const ROLES = new Set(['user', 'admin']);

export function adminUserView(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    googleSub: user.googleSub,
    status: user.status,
    role: user.role,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    consentedAt: user.consentedAt,
    withdrawnAt: user.withdrawnAt,
    termsVersion: user.termsVersion,
    privacyVersion: user.privacyVersion,
    createdAtLabel: formatKst(user.createdAt),
    lastLoginAtLabel: formatKst(user.lastLoginAt),
    consentedAtLabel: formatKst(user.consentedAt),
    withdrawnAtLabel: formatKst(user.withdrawnAt),
  };
}

export function adminStats(db, nowMs, days) {
  const todayStart = kstDayStart(nowMs);
  const trend = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const start = addDays(todayStart, -index);
    trend.push({
      date: kstDateString(start),
      count: db.users.countSignupsBetween(start, addDays(start, 1)),
    });
  }
  return {
    totalMembers: db.users.countMembers(),
    todaySignups: db.users.countSignupsBetween(todayStart, addDays(todayStart, 1)),
    recentLogins: db.users.recentLogins(8).map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      lastLoginAt: user.lastLoginAt,
      lastLoginAtLabel: formatKst(user.lastLoginAt),
    })),
    trend,
    days,
    timezone: 'Asia/Seoul',
  };
}

export function setMemberStatus({ db, actor, userId, status }) {
  if (!STATUS.has(status)) return { ok: false, status: 400, error: 'bad_status' };
  const user = db.users.findById(userId);
  if (!user || user.status === 'withdrawn') return { ok: false, status: 404, error: 'not_found' };
  if (status === 'suspended' && user.role === 'admin' && user.status === 'active' && db.users.countActiveAdmins() <= 1) {
    return { ok: false, status: 403, error: 'last_admin' };
  }
  if (actor.id === user.id) return { ok: false, status: 403, error: 'self' };
  db.users.setStatus(user.id, status);
  if (status === 'suspended') db.sessions.deleteByUser(user.id);
  return { ok: true, user: db.users.findById(user.id) };
}

export function setMemberRole({ db, actor, userId, role }) {
  if (!ROLES.has(role)) return { ok: false, status: 400, error: 'bad_role' };
  const user = db.users.findById(userId);
  if (!user || user.status === 'withdrawn') return { ok: false, status: 404, error: 'not_found' };
  if (user.role === 'admin' && role === 'user' && user.status === 'active' && db.users.countActiveAdmins() <= 1) {
    return { ok: false, status: 403, error: 'last_admin' };
  }
  db.users.setRole(user.id, role);
  return { ok: true, user: db.users.findById(user.id) };
}
