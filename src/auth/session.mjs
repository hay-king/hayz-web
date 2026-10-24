import { parseCookies } from '../http.mjs';
import { randomId, unsignValue } from '../security.mjs';

export function createSession(db, userId, nowMs) {
  const session = {
    id: randomId(),
    userId,
    csrfToken: randomId(),
    createdAt: nowMs,
    lastSeenAt: nowMs,
  };
  db.sessions.create(session);
  return session;
}

export function readSession(db, config, signedCookie, nowMs) {
  const id = unsignValue(config.sessionSecret, 'session', signedCookie);
  if (!id) return null;
  const session = db.sessions.get(id);
  if (!session) return null;
  if (nowMs >= session.createdAt + config.sessionAbsoluteMs) {
    db.sessions.delete(session.id);
    return { expired: 'absolute' };
  }
  if (nowMs >= session.lastSeenAt + config.sessionIdleMs) {
    db.sessions.delete(session.id);
    return { expired: 'idle' };
  }
  const user = db.users.findById(session.userId);
  if (!user || user.status !== 'active') {
    db.sessions.delete(session.id);
    return null;
  }
  db.sessions.touch(session.id, nowMs);
  return { session: { ...session, lastSeenAt: nowMs }, user };
}

export function sessionFromRequest(req, db, config, nowMs) {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.hayz_sid) return { user: null, session: null, clear: false, expired: false };
  const result = readSession(db, config, cookies.hayz_sid, nowMs);
  if (!result) return { user: null, session: null, clear: true, expired: false };
  if (result.expired) return { user: null, session: null, clear: true, expired: true };
  return { user: result.user, session: result.session, clear: false, expired: false };
}
