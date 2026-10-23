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
  if (![start, end].every(value => ['00', '30'].includes(value.slice(-2)))) return null;
  const dates = [start, end].map(value => new Date(`${value}:00+09:00`));
  if (dates.some((date, i) => !Number.isFinite(date.getTime()) || new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16) !== [start, end][i])) return null;
  return dates[1] > dates[0] ? { start: dates[0], end: dates[1] } : null;
}

export const attendanceTime = (value: string) => new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const durationLabel = (milliseconds: number) => {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  return `${Math.floor(minutes / 60)}時間${minutes % 60}分`;
};

export const isShiftDue = (start: string, now: number) => {
  const time = new Date(start).getTime();
  return time <= now && time > now - 60000;
};

export function festivalShift(day: unknown, start: unknown, end: unknown) {
  if ((day !== 1 && day !== 2) || typeof start !== 'string' || typeof end !== 'string') return null;
  if (!/^(1[0-5]:(00|30)|16:00)$/.test(start) || !/^(1[0-5]:(00|30)|16:00)$/.test(end)) return null;
  return start < end ? { festivalDay: day, startTime: start, endTime: end } : null;
}

export const attendanceToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
