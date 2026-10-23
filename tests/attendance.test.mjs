import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const { personalIdFrom, shiftDates, durationLabel, isShiftDue, festivalShift, attendanceToday } = createLoader()('src/lib/attendance.ts');
test('festival shifts allow exactly two days and 10–16 in half-hour steps', () => {
  assert.deepEqual(festivalShift(1, '10:00', '16:00'), { festivalDay: 1, startTime: '10:00', endTime: '16:00' });
  assert.ok(festivalShift(2, '15:30', '16:00'));
  for (const [day, start, end] of [[3, '10:00', '11:00'], [0, '10:00', '11:00'], [1, '09:30', '11:00'], [1, '15:00', '16:30'], [1, '10:15', '11:00'], [1, '12:00', '12:00'], [1, '13:00', '12:00']]) assert.equal(festivalShift(day, start, end), null);
});
test('shift notifications begin at the scheduled time, never 15 minutes early', () => {
  const start = '2026-10-23T10:00:00+09:00';
  const time = new Date(start).getTime();
  assert.equal(isShiftDue(start, time - 15 * 60000), false);
  assert.equal(isShiftDue(start, time - 1), false);
  assert.equal(isShiftDue(start, time), true);
  assert.equal(isShiftDue(start, time + 59999), true);
  assert.equal(isShiftDue(start, time + 60000), false);
});
test('personal IDs accept only positive safe integers', () => {
  for (const value of ['', 0, -1, '1.5', '1e2', null, {}, Number.MAX_SAFE_INTEGER + 1]) assert.equal(personalIdFrom(value), null);
  assert.equal(personalIdFrom('001'), 1);
});
test('shifts use Japan time, allow overnight work, and reject invalid ranges and calendar dates', () => {
  const dates = shiftDates('2026-10-23T23:00', '2026-10-24T02:00');
  assert.equal(dates.start.toISOString(), '2026-10-23T14:00:00.000Z');
  assert.equal(dates.end - dates.start, 3 * 3600000);
  assert.equal(shiftDates('2026-02-30T10:00', '2026-03-01T12:00'), null);
  assert.equal(shiftDates('2026-10-23T10:00', '2026-10-23T10:00'), null);
  assert.equal(shiftDates('bad', 'bad'), null);
  assert.equal(shiftDates('2026-10-23T10:15', '2026-10-23T11:00'), null);
  assert.ok(shiftDates('2026-10-23T10:30', '2026-10-23T11:00'));
});
test('duration totals display hours beyond a day without rounding up', () => {
  assert.equal(durationLabel(27 * 3600000 + 31 * 60000 + 59000), '27時間31分');
  assert.equal(durationLabel(0), '0時間0分');
});

function fixture(authenticated = true) {
  const employees = [];
  const records = [];
  const shifts = [];
  let counter = 0;
  const scoped = filter => assert.equal(filter.storeId, 'store-a');
  const Employee = {
    db: { transaction: async fn => fn({}) },
    create: async values => { const created = values.map((v, i) => ({ ...v, _id: String(employees.length + i + 1).padStart(24, '0') })); employees.push(...created); return created; },
    findOneAndUpdate: async filter => { scoped(filter); return employees.find(e => e.personalId === filter.personalId && (!filter._id || e._id === filter._id) && (filter.archivedAt !== null || !e.archivedAt)); },
    findOne: async filter => { scoped(filter); return employees.find(e => e.personalId === filter.personalId && (filter.archivedAt !== null || !e.archivedAt)); },
    exists: filter => { scoped(filter); return { session: async () => employees.some(e => e.personalId === filter.personalId) }; },
    updateOne: async (filter, update) => { scoped(filter); Object.assign(employees.find(e => e._id === filter._id), update.$set); },
    find: filter => { scoped(filter); return { lean: async () => employees }; },
  };
  const AttendanceRecord = {
    findOne: filter => {
      scoped(filter);
      const record = records.find(r => r.personalId === filter.personalId && !r.clockOut) || null;
      return { session: async () => record, then: resolve => resolve(record) };
    },
    create: async ([value]) => { records.push({ ...value, _id: String(records.length + 1), save: async () => {} }); },
    updateMany: async (filter, update) => { scoped(filter); records.filter(r => r.personalId === filter.personalId).forEach(r => Object.assign(r, update.$set)); },
    find: filter => { scoped(filter); return { sort: () => ({ lean: async () => records.filter(r => r.clockOut === null) }) }; },
  };
  const Shift = {
    exists: filter => { scoped(filter); return { session: async () => shifts.some(s => s.personalId === filter.personalId && s.festivalDay === filter.festivalDay && s._id !== filter._id?.$ne && s.startTime < filter.startTime.$lt && s.endTime > filter.endTime.$gt) }; },
    create: async ([value]) => shifts.push({ ...value, _id: String(shifts.length + 1).padStart(24, '0') }),
    findOneAndUpdate: async (filter, update) => { scoped(filter); const shift = shifts.find(s => s._id === filter._id && s.personalId === filter.personalId); if (shift) Object.assign(shift, update.$set); return shift; },
    updateMany: async (filter, update) => { scoped(filter); shifts.filter(s => s.personalId === filter.personalId).forEach(s => Object.assign(s, update.$set)); },
    deleteMany: async filter => { scoped(filter); assert.ok(filter.$or); for (let i = shifts.length - 1; i >= 0; i--) if (shifts[i].personalId === filter.personalId) shifts.splice(i, 1); },
  };
  const api = createLoader({
    '@/lib/db': async () => {},
    '@/lib/store': { getActiveStoreContext: async () => authenticated ? { storeId: 'store-a' } : null },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
    '@/models/Attendance': { Employee, AttendanceRecord, Shift, EmployeeCounter: { findOneAndUpdate: async (filter, update) => { assert.equal(filter._id, 'store-a'); counter = update.$inc ? counter + update.$inc.value : Math.max(counter, update.$max.value); return { value: counter }; } } },
  })('src/app/api/attendance/route.ts');
  const post = body => api.POST(new Request('http://localhost/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  return { api, post, records, shifts };
}

test('registration assigns sequential IDs; punches reject duplicates and stale checkout', async () => {
  const { api, post, records } = fixture();
  for (let i = 1; i <= 3; i++) assert.equal((await (await post({ action: 'employee', name: `Staff ${i}` })).json()).personalId, i);
  assert.equal((await post({ action: 'clockIn', personalId: 99 })).status, 404);
  assert.equal((await post({ action: 'clockIn', personalId: 1 })).status, 200);
  assert.equal((await post({ action: 'clockIn', personalId: 1 })).status, 409);
  const state = await (await api.GET(new Request('http://localhost/api/attendance?personalId=1'))).json();
  assert.equal(state.active._id, '1');
  assert.equal((await post({ action: 'clockOut', personalId: 1, recordId: 'old' })).status, 409);
  assert.equal(records[0].clockOut, null);
  assert.equal((await post({ action: 'clockOut', personalId: 1, recordId: '1' })).status, 200);
  assert.ok(records[0].clockOut instanceof Date);
  assert.equal((await post({ action: 'clockOut', personalId: 1, recordId: '1' })).status, 409);
});

test('bulk registration preserves name order and continues existing IDs without consuming IDs for invalid input', async () => {
  const { post } = fixture();
  await post({ action: 'employee', name: 'Existing' });
  for (const names of [[], ['Valid', ' '], ['x'.repeat(81)], [null], Array(201).fill('A'), 'invalid']) {
    assert.equal((await post({ action: 'employees', names })).status, 400);
  }
  const response = await post({ action: 'employees', names: [' A ', 'B', 'C'] });
  assert.equal(response.status, 201);
  assert.deepEqual((await response.json()).employees.map(e => [e.personalId, e.name]), [[2, 'A'], [3, 'B'], [4, 'C']]);
  assert.equal((await (await post({ action: 'employee', name: 'Next' })).json()).personalId, 5);
});

test('ID changes migrate open and closed records and shifts, reject collisions, and preserve automatic numbering', async () => {
  const { api, post, records, shifts } = fixture();
  const employee = await (await post({ action: 'employee', name: 'A' })).json();
  await post({ action: 'employee', name: 'B' });
  await post({ action: 'clockIn', personalId: 1 });
  await post({ action: 'clockOut', personalId: 1, recordId: '1' });
  await post({ action: 'clockIn', personalId: 1 });
  await post({ action: 'shift', personalId: 1, day: 1, start: '10:00', end: '11:30' });
  const change = newPersonalId => post({ action: 'changeId', personalId: 1, employeeId: employee._id, newPersonalId });
  assert.equal((await change(2)).status, 409);
  assert.equal((await change(0)).status, 400);
  assert.equal((await change(50)).status, 200);
  assert.ok(records.every(r => r.personalId === 50));
  assert.equal(shifts[0].personalId, 50);
  assert.equal((await api.GET(new Request('http://localhost/api/attendance?personalId=1'))).status, 404);
  assert.equal((await (await post({ action: 'employee', name: 'C' })).json()).personalId, 51);
  const active = await (await api.GET(new Request('http://localhost/api/attendance?mode=active'))).json();
  assert.equal(active.length, 1);
  assert.equal(active[0].name, 'A');
  assert.equal(active[0].personalId, 50);
  assert.equal((await post({ action: 'clockOut', personalId: 50, recordId: active[0]._id })).status, 200);
  assert.equal((await post({ action: 'clockOut', personalId: 50, recordId: active[0]._id })).status, 409);
});
test('overlapping shifts are rejected but adjacent shifts are allowed', async () => {
  const { post, shifts } = fixture();
  await post({ action: 'employee', name: 'Staff' });
  const shift = (start, end) => post({ action: 'shift', personalId: 1, day: 1, start, end });
  assert.equal((await shift('10:00', '12:00')).status, 201);
  assert.equal((await shift('11:00', '13:00')).status, 409);
  assert.equal((await shift('12:00', '13:00')).status, 201);
  assert.equal(shifts.length, 2);
  assert.equal((await post({ action: 'shift', personalId: 1, day: 2, start: '10:00', end: '12:00' })).status, 201);
  assert.equal((await post({ action: 'updateShift', shiftId: shifts[0]._id, personalId: 1, day: 1, start: '10:30', end: '11:30' })).status, 200);
  assert.equal(shifts[0].startTime, '10:30');
  assert.equal((await post({ action: 'updateShift', shiftId: shifts[0]._id, personalId: 1, day: 1, start: '11:30', end: '12:30' })).status, 409);
  assert.equal((await shift('09:30', '10:30')).status, 400);
});
test('unauthenticated reads and mutations are denied', async () => {
  const { api, post } = fixture(false);
  assert.equal((await api.GET(new Request('http://localhost/api/attendance'))).status, 401);
  assert.equal((await post({ action: 'employee', name: 'Staff' })).status, 401);
});

test('reminders preload upcoming shifts and include the current start minute, excluding clocked-in staff', async () => {
  const startTime = new Date(Date.now() + 9 * 3600000).toISOString().slice(11, 16);
  const shifts = [{ _id: 's1', personalId: 1, startTime }, { _id: 's2', personalId: 2, startTime }];
  const api = createLoader({
    '@/lib/db': async () => {},
    '@/lib/store': { getActiveStoreContext: async () => ({ storeId: 'store-a' }) },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
    '@/models/Attendance': {
      FestivalSchedule: { findById: async () => ({ notificationDay: 1, notificationDate: attendanceToday() }) },
      Shift: { find: filter => {
        assert.equal(filter.storeId, 'store-a');
        assert.equal(filter.festivalDay, 1);
        return { sort: () => ({ lean: async () => shifts }) };
      } },
      Employee: { find: filter => { assert.equal(filter.storeId, 'store-a'); return { lean: async () => [{ personalId: 1, name: 'A' }, { personalId: 2, name: 'B' }] }; } },
      AttendanceRecord: { find: filter => {
        assert.equal(filter.storeId, 'store-a'); assert.equal(filter.clockOut, null);
        return { lean: async () => [{ personalId: 2 }] };
      } },
    },
  })('src/app/api/attendance/route.ts');
  const result = await api.GET(new Request('http://localhost/api/attendance?mode=reminders'));
  const reminders = await result.json();
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].name, 'A');
  assert.equal(reminders[0].start, new Date(`${attendanceToday()}T${startTime}:00+09:00`).toISOString());
});

test('staff deletion rejects active attendance, preserves history and reserves the ID', async () => {
  const { api, post, records, shifts } = fixture();
  const employee = await (await post({ action: 'employee', name: 'Delete me' })).json();
  const remove = () => post({ action: 'deleteEmployee', personalId: 1, employeeId: employee._id });
  await post({ action: 'shift', personalId: 1, day: 1, start: '10:00', end: '11:00' });
  await post({ action: 'clockIn', personalId: 1 });
  assert.equal((await remove()).status, 409);
  assert.equal(shifts.length, 1);
  await post({ action: 'clockOut', personalId: 1, recordId: '1' });
  assert.equal((await remove()).status, 200);
  assert.equal(shifts.length, 0);
  assert.equal(records.length, 1);
  assert.ok(records[0].clockOut);
  assert.equal((await api.GET(new Request('http://localhost/api/attendance?personalId=1'))).status, 404);
  assert.equal((await post({ action: 'clockIn', personalId: 1 })).status, 404);
  const other = await (await post({ action: 'employee', name: 'Other' })).json();
  assert.equal(other.personalId, 2);
  assert.equal((await post({ action: 'changeId', personalId: 2, employeeId: other._id, newPersonalId: 1 })).status, 409);
});
