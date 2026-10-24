const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 30;

export function createLimiter() {
  const hits = new Map();
  return function limited(key, nowMs) {
    const recent = (hits.get(key) || []).filter((stamp) => nowMs - stamp < WINDOW_MS);
    if (recent.length >= MAX_HITS) {
      hits.set(key, recent);
      return true;
    }
    recent.push(nowMs);
    if (hits.size > 5000) hits.clear();
    hits.set(key, recent);
    return false;
  };
}
