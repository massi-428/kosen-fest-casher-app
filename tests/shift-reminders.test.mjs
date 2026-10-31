import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const { queueShiftReminders } = createLoader()('src/lib/shift-reminders.ts');
const start = '2026-10-31T01:00:00.000Z';
const now = Date.parse(start);
const reminders = Array.from({ length: 20 }, (_, i) => ({ _id: `s${i}:2026-10-31:clockIn`, personalId: i + 1, name: `Staff ${i}`, kind: 'clockIn', start }));

test('never notifies early; all simultaneous reminders survive checkout pauses and subsequent polls', () => {
  assert.deepEqual(queueShiftReminders([], reminders, new Set(), now - 1), []);
  const pending = queueShiftReminders([], reminders, new Set(), now);
  assert.equal(pending.length, 20);
  assert.equal(queueShiftReminders(pending, [], new Set(), now + 120000).length, 20);
  assert.equal(queueShiftReminders(pending, reminders, new Set(), now + 1000).length, 20);
});

test('dismissed reminders stay dismissed but departure and next-day events remain independent', () => {
  const seen = new Set(reminders.map(r => r._id));
  assert.deepEqual(queueShiftReminders(reminders, reminders, seen, now), []);
  const departure = { ...reminders[0], kind: 'clockOut', _id: 's0:2026-10-31:clockOut' };
  assert.deepEqual(queueShiftReminders([], [departure], seen, now), [departure]);
  const nextDay = { ...reminders[0], _id: 's0:2026-11-01:clockIn', start: '2026-11-01T01:00:00.000Z' };
  assert.deepEqual(queueShiftReminders(reminders, [nextDay], seen, now + 86400000), [nextDay]);
});
