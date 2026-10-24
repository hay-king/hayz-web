import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/db/index.mjs';

test('SQLite 백업 파일에서 회원을 다시 읽을 수 있다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'hayz-backup-'));
  const db = openDatabase(dir);
  try {
    db.users.insert({
      id: 'user-hong',
      googleSub: 'google-sub-hong',
      email: 'hong@example.com',
      name: '홍길동',
      picture: null,
      createdAt: Date.parse('2026-10-24T03:00:00Z'),
      lastLoginAt: Date.parse('2026-10-24T03:00:00Z'),
      status: 'active',
      role: 'user',
      termsVersion: '2026-10-24',
      privacyVersion: '2026-10-24',
      consentedAt: Date.parse('2026-10-24T03:00:00Z'),
    });
    const copyDir = path.join(dir, 'copy');
    db.backupTo(path.join(copyDir, 'hayz.sqlite'));
    const copy = openDatabase(copyDir);
    try {
      const user = copy.users.findByEmail('hong@example.com');
      assert.equal(user.name, '홍길동');
      assert.equal(user.googleSub, 'google-sub-hong');
    } finally {
      copy.close();
    }
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
