import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite store. Routers talk only to this module so a Postgres
 * implementation can replace the file without rewriting auth, users, or admin.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'withdrawn')),
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  terms_version TEXT,
  privacy_version TEXT,
  consented_at INTEGER,
  withdrawn_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login_at);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pending_signups (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`;

export function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const filePath = path.join(dataDir, 'hayz.sqlite');
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(SCHEMA);

  const run = (sql, ...params) => db.prepare(sql).run(...params);
  const one = (sql, ...params) => db.prepare(sql).get(...params) || null;
  const many = (sql, ...params) => db.prepare(sql).all(...params);
  const countOf = (sql, ...params) => Number(one(sql, ...params).n);

  function transaction(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // The original error is the one callers need.
      }
      throw error;
    }
  }

  return {
    filePath,
    close() {
      db.close();
    },
    backupTo(destPath) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      if (fs.existsSync(destPath)) {
        const error = new Error('backup_exists');
        error.code = 'backup_exists';
        throw error;
      }
      const escaped = destPath.replaceAll("'", "''");
      db.exec(`VACUUM INTO '${escaped}'`);
    },
    oauth: {
      create({ state, codeVerifier, expiresAt }) {
        run(
          'INSERT INTO oauth_states (state, code_verifier, expires_at) VALUES (?, ?, ?)',
          state,
          codeVerifier,
          expiresAt,
        );
      },
      consume(state) {
        if (!state) return null;
        return transaction(() => {
          const row = one(
            'SELECT state, code_verifier AS codeVerifier, expires_at AS expiresAt FROM oauth_states WHERE state = ?',
            state,
          );
          run('DELETE FROM oauth_states WHERE state = ?', state);
          return row;
        });
      },
      deleteExpired(now) {
        run('DELETE FROM oauth_states WHERE expires_at <= ?', now);
      },
    },
    pending: {
      create(pending) {
        run(
          `INSERT INTO pending_signups
            (id, google_sub, email, name, picture, csrf_token, created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          pending.id,
          pending.googleSub,
          pending.email,
          pending.name,
          pending.picture,
          pending.csrfToken,
          pending.createdAt,
          pending.expiresAt,
        );
      },
      get(id) {
        return mapPending(one('SELECT * FROM pending_signups WHERE id = ?', id));
      },
      delete(id) {
        run('DELETE FROM pending_signups WHERE id = ?', id);
      },
      deleteByGoogleSub(googleSub) {
        if (!googleSub) return;
        run('DELETE FROM pending_signups WHERE google_sub = ?', googleSub);
      },
      deleteExpired(now) {
        run('DELETE FROM pending_signups WHERE expires_at <= ?', now);
      },
    },
    users: {
      insert(user) {
        run(
          `INSERT INTO users
            (id, google_sub, email, name, picture, created_at, last_login_at, status, role,
             terms_version, privacy_version, consented_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          user.id,
          user.googleSub,
          user.email,
          user.name,
          user.picture,
          user.createdAt,
          user.lastLoginAt,
          user.status,
          user.role,
          user.termsVersion,
          user.privacyVersion,
          user.consentedAt,
        );
      },
      updateOnLogin(id, fields) {
        run(
          `UPDATE users
             SET email = ?, name = ?, picture = ?, last_login_at = ?, role = ?
           WHERE id = ?`,
          fields.email,
          fields.name,
          fields.picture,
          fields.lastLoginAt,
          fields.role,
          id,
        );
      },
      findById(id) {
        return mapUser(one('SELECT * FROM users WHERE id = ?', id));
      },
      findByGoogleSub(googleSub) {
        if (!googleSub) return null;
        return mapUser(one('SELECT * FROM users WHERE google_sub = ?', googleSub));
      },
      findByEmail(email) {
        if (!email) return null;
        return mapUser(one(
          `SELECT * FROM users WHERE email = ? AND status != 'withdrawn'`,
          email,
        ));
      },
      setStatus(id, status) {
        run('UPDATE users SET status = ? WHERE id = ?', status, id);
      },
      setRole(id, role) {
        run('UPDATE users SET role = ? WHERE id = ?', role, id);
      },
      anonymize(id, withdrawnAt) {
        run(
          `UPDATE users
             SET google_sub = NULL, email = NULL, name = NULL, picture = NULL,
                 last_login_at = NULL, status = 'withdrawn', role = 'user', withdrawn_at = ?
           WHERE id = ?`,
          withdrawnAt,
          id,
        );
      },
      search({ query = '', status = '', limit = 20, offset = 0 } = {}) {
        const safeLimit = clamp(limit, 1, 100, 20);
        const safeOffset = clamp(offset, 0, 100000, 0);
        const filters = [];
        const params = [];
        const text = String(query || '').trim();
        if (text) {
          const like = `%${escapeLike(text)}%`;
          filters.push(`(COALESCE(email, '') LIKE ? ESCAPE '\\' OR COALESCE(name, '') LIKE ? ESCAPE '\\')`);
          params.push(like, like);
        }
        if (status === 'active' || status === 'suspended' || status === 'withdrawn') {
          filters.push('status = ?');
          params.push(status);
        }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const total = countOf(`SELECT COUNT(*) AS n FROM users ${where}`, ...params);
        const users = many(
          `SELECT * FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          ...params,
          safeLimit,
          safeOffset,
        ).map(mapUser);
        return { total, users };
      },
      countMembers() {
        return countOf(`SELECT COUNT(*) AS n FROM users WHERE status IN ('active', 'suspended')`);
      },
      countActiveAdmins() {
        return countOf(`SELECT COUNT(*) AS n FROM users WHERE status = 'active' AND role = 'admin'`);
      },
      countSignupsBetween(start, end) {
        return countOf(
          'SELECT COUNT(*) AS n FROM users WHERE created_at >= ? AND created_at < ?',
          start,
          end,
        );
      },
      recentLogins(limit = 8) {
        return many(
          `SELECT * FROM users
            WHERE status = 'active' AND last_login_at IS NOT NULL
            ORDER BY last_login_at DESC
            LIMIT ?`,
          clamp(limit, 1, 50, 8),
        ).map(mapUser);
      },
    },
    sessions: {
      create(session) {
        run(
          `INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?)`,
          session.id,
          session.userId,
          session.csrfToken,
          session.createdAt,
          session.lastSeenAt,
        );
      },
      get(id) {
        return mapSession(one('SELECT * FROM sessions WHERE id = ?', id));
      },
      touch(id, lastSeenAt) {
        run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', lastSeenAt, id);
      },
      delete(id) {
        run('DELETE FROM sessions WHERE id = ?', id);
      },
      deleteByUser(userId) {
        run('DELETE FROM sessions WHERE user_id = ?', userId);
      },
    },
  };
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    createdAt: numberOrNull(row.created_at),
    lastLoginAt: numberOrNull(row.last_login_at),
    status: row.status,
    role: row.role,
    termsVersion: row.terms_version,
    privacyVersion: row.privacy_version,
    consentedAt: numberOrNull(row.consented_at),
    withdrawnAt: numberOrNull(row.withdrawn_at),
  };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    csrfToken: row.csrf_token,
    createdAt: numberOrNull(row.created_at),
    lastSeenAt: numberOrNull(row.last_seen_at),
  };
}

function mapPending(row) {
  if (!row) return null;
  return {
    id: row.id,
    googleSub: row.google_sub,
    email: row.email,
    name: row.name,
    picture: row.picture,
    csrfToken: row.csrf_token,
    createdAt: numberOrNull(row.created_at),
    expiresAt: numberOrNull(row.expires_at),
  };
}

function numberOrNull(value) {
  if (value == null) return null;
  return Number(value);
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function escapeLike(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}
