import { isShiftDue } from './attendance';

export type ShiftReminderEvent = { _id: string; personalId: number; name: string; start: string; kind: 'clockIn' | 'clockOut' };

// Keep due notifications until displayed, even while checkout notifications take priority.
export function queueShiftReminders(pending: ShiftReminderEvent[], incoming: ShiftReminderEvent[], seen: Set<string>, now: number) {
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const queue = new Map(pending.filter(r => !seen.has(r._id) && new Date(new Date(r.start).getTime() + 9 * 3600000).toISOString().slice(0, 10) === today).map(r => [r._id, r]));
  for (const reminder of incoming) {
    if (!seen.has(reminder._id) && isShiftDue(reminder.start, now)) queue.set(reminder._id, reminder);
  }
  return [...queue.values()].sort((a, b) => a.start.localeCompare(b.start) || a.personalId - b.personalId);
}
