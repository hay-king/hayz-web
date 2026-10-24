const KST = 'Asia/Seoul';

export function kstParts(ms) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const read = (type) => parts.find((part) => part.type === type)?.value;
  return { year: read('year'), month: read('month'), day: read('day') };
}

export function kstDayStart(ms) {
  const { year, month, day } = kstParts(ms);
  return Date.parse(`${year}-${month}-${day}T00:00:00+09:00`);
}

export function addDays(ms, days) {
  return ms + days * 86400000;
}

export function kstDateString(ms) {
  const { year, month, day } = kstParts(ms);
  return `${year}-${month}-${day}`;
}

export function formatKst(ms) {
  if (ms == null) return null;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
}
