import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

test('attendance access verifies the current account password on each request, including Unicode', async () => {
  let stored = '店舗パスワード';
  const { canManageAttendance } = createLoader({
    '@/models/User': { findOne: async filter => { assert.deepEqual(filter, { userId: 'owner' }); return { password: stored }; } },
    '@/lib/auth': { verifyPassword: async (input, value) => input === value },
  })('src/lib/attendance-access.ts');
  const request = value => new Request('http://localhost/api/attendance', { headers: value === undefined ? {} : { 'X-Attendance-Password': value } });
  assert.equal(await canManageAttendance(request(), 'owner'), false);
  assert.equal(await canManageAttendance(request('%bad'), 'owner'), false);
  assert.equal(await canManageAttendance(request(encodeURIComponent('wrong')), 'owner'), false);
  const correct = request(encodeURIComponent(stored));
  assert.equal(await canManageAttendance(correct, 'owner'), true);
  stored = 'new password';
  assert.equal(await canManageAttendance(correct, 'owner'), false);
});

test('deleted account cannot unlock attendance', async () => {
  const { canManageAttendance } = createLoader({
    '@/models/User': { findOne: async () => null },
    '@/lib/auth': { verifyPassword: async () => { assert.fail('no password check without an account'); } },
  })('src/lib/attendance-access.ts');
  assert.equal(await canManageAttendance(new Request('http://localhost/api/attendance', { headers: { 'X-Attendance-Password': 'anything' } }), 'deleted'), false);
});
