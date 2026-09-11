export const jstToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function historyQuery(params: URLSearchParams, storeId: string) {
  const date = params.get('date') || jstToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日付を指定してください。');
  const start = new Date(date + 'T00:00:00+09:00');
  if (!Number.isFinite(start.getTime()) || new Date(start.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== date) throw new Error('日付が正しくありません。');
  const ticket = params.get('ticket')?.trim() || '';
  if (ticket && !/^\d{1,6}$/.test(ticket)) throw new Error('整理番号は数字で入力してください。');
  const status = params.get('status') || 'all';
  if (!['all', 'active', 'pending', 'completed', 'cancelled'].includes(status)) throw new Error('状態が正しくありません。');
  return { storeId, createdAt: { $gte: start, $lt: new Date(start.getTime() + 86400000) }, ...(ticket ? { ticketNumber: String(Number(ticket)) } : {}), ...(status !== 'all' ? { status } : {}) };
}
