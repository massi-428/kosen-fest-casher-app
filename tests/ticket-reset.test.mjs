import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';

function setup({ authenticated = true, pending = false } = {}) {
  const writes = [];
  const session = {};
  const route = createLoader({
    '@/lib/db': async () => {},
    '@/lib/store': { getActiveStoreContext: async () => authenticated ? { storeId: 'store-a', userId: 'owner-a' } : null },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }), verifyPassword: async value => value === 'correct' },
    '@/models/User': { findOne: async filter => { assert.deepEqual(filter, { userId: 'owner-a' }); return { password: 'hash' }; } },
    '@/models/Order': { exists: filter => ({ session: async supplied => {
      assert.equal(supplied, session);
      assert.equal(filter.storeId, 'store-a');
      assert.deepEqual(filter.$or, [{ status: { $in: ['active', 'pending'] } }, { settlementLock: { $nin: [null, ''] } }]);
      return pending;
    } }) },
    '@/models/TicketCounter': {
      db: { transaction: action => action(session) },
      findOneAndUpdate: async (filter, update, options) => { assert.equal(filter.storeId, 'store-a'); assert.equal(options.session, session); writes.push(update); },
      updateOne: async (filter, update, options) => { assert.equal(filter.storeId, 'store-a'); assert.equal(options.session, session); writes.push(update); },
    },
  })('src/app/api/settings/tickets/reset/route.ts');
  return { writes, call: body => route.POST(new Request('http://localhost/api/settings/tickets/reset', { method: 'POST', body: JSON.stringify(body) })) };
}

test('ticket reset requires session, explicit confirmation and correct login password', async () => {
  assert.equal((await setup({ authenticated: false }).call({})).status, 401);
  const h = setup();
  assert.equal((await h.call({ password: 'correct' })).status, 400);
  assert.equal((await h.call({ password: 'wrong', confirm: true })).status, 403);
  assert.deepEqual(h.writes, []);
});

test('unfinished orders or settlements block resetting the sequence', async () => {
  const h = setup({ pending: true });
  assert.equal((await h.call({ password: 'correct', confirm: true })).status, 409);
  assert.deepEqual(h.writes, [{ $inc: { businessRevision: 1 } }]);
});

test('reset serializes on business counter and changes only the sequence, preserving closed day and history', async () => {
  const h = setup();
  assert.equal((await h.call({ password: 'correct', confirm: true })).status, 200);
  assert.deepEqual(h.writes, [{ $inc: { businessRevision: 1 } }, { $set: { lastIssuedNumber: 0 } }]);
});
