import crypto from 'node:crypto';

export function randomId() {
  return crypto.randomBytes(32).toString('base64url');
}

export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signValue(secret, purpose, value) {
  const mac = crypto.createHmac('sha256', secret).update(`${purpose}\n${value}`).digest('base64url');
  return `${value}.${mac}`;
}

export function unsignValue(secret, purpose, signed) {
  if (typeof signed !== 'string' || !secret) return null;
  const index = signed.lastIndexOf('.');
  if (index <= 0) return null;
  const value = signed.slice(0, index);
  const mac = signed.slice(index + 1);
  const expected = crypto.createHmac('sha256', secret).update(`${purpose}\n${value}`).digest('base64url');
  if (!safeEqual(mac, expected)) return null;
  return value;
}
