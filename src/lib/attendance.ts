export const personalIdFrom = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// Shift form inputs are explicitly interpreted in Japan time, regardless of device timezone.
export function shiftDates(start: unknown, end: unknown) {
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
  if (typeof start !== 'string' || typeof end !== 'string' || !pattern.test(start) || !pattern.test(end)) return null;
  const dates = [start, end].map(value => new Date(`${value}:00+09:00`));
  if (dates.some((date, i) => !Number.isFinite(date.getTime()) || new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16) !== [start, end][i])) return null;
  return dates[1] > dates[0] ? { start: dates[0], end: dates[1] } : null;
}

export const attendanceTime = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
