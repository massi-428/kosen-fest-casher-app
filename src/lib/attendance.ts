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

export const attendanceInput = (value: string | Date) => new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 23);

export function attendanceDates(clockIn: unknown, clockOut: unknown) {
  const parse = (value: unknown) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(value)) return null;
    const date = new Date(`${value}+09:00`);
    return Number.isFinite(date.getTime()) && attendanceInput(date).startsWith(value) ? date : null;
  };
  const start = parse(clockIn);
  const end = clockOut === '' || clockOut === null ? null : parse(clockOut);
  if (!start || (clockOut !== '' && clockOut !== null && !end) || (end && end <= start)) return null;
  return { clockIn: start, clockOut: end };
}

export function attendanceCsv(records: { personalId: number; clockIn: string | Date; clockOut?: string | Date | null }[]) {
  const grouped = new Map<number, string[]>();
  for (const record of [...records].sort((a, b) => a.personalId - b.personalId || new Date(a.clockIn).getTime() - new Date(b.clockIn).getTime())) {
    const row = grouped.get(record.personalId) || [];
    const format = (value: string | Date) => attendanceInput(value).slice(0, 19).replace('T', ' ');
    row.push(format(record.clockIn), record.clockOut ? format(record.clockOut) : '');
    grouped.set(record.personalId, row);
  }
  const width = Math.max(2, ...Array.from(grouped.values(), row => row.length));
  const header = ['ID', ...Array.from({ length: width / 2 }, () => ['出勤', '退勤']).flat()];
  return '\uFEFF' + [header, ...Array.from(grouped, ([id, row]) => [String(id), ...row, ...Array(width - row.length).fill('')])].map(row => row.join(',')).join('\r\n') + '\r\n';
}
