export function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const value = email.trim().toLowerCase();
  if (!value || value.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

export function cleanName(name) {
  if (typeof name !== 'string') return null;
  const value = name.replace(/\s+/g, ' ').trim();
  if (!value) return null;
  return Array.from(value).slice(0, 200).join('');
}

export function safePicture(picture) {
  if (typeof picture !== 'string' || !picture || picture.length > 500) return null;
  let url;
  try {
    url = new URL(picture);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'googleusercontent.com' && !host.endsWith('.googleusercontent.com')) return null;
  return url.toString();
}
