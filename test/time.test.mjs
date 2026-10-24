import assert from 'node:assert/strict';
import test from 'node:test';
import { kstDateString, kstDayStart } from '../src/time.mjs';

test('오늘 경계는 한국 시간 자정이다', () => {
  const now = Date.parse('2026-10-24T03:00:00Z');
  const start = kstDayStart(now);
  assert.equal(start, Date.parse('2026-10-24T00:00:00+09:00'));
  assert.equal(kstDateString(start), '2026-10-24');
  assert.ok(Date.parse('2026-10-23T15:30:00Z') >= start);
  assert.ok(Date.parse('2026-10-23T14:00:00Z') < start);
});
