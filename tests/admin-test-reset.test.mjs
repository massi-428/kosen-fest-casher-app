import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';

test('test reset requires opt-in, test DB, admin, password and confirmation', async t => {
  const keys = ['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'ENABLE_TEST_DATA_RESET', 'MONGODB_DB'];
  const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  t.after(() => keys.forEach(k => old[k] === undefined ? delete process.env[k] : process.env[k] = old[k]));
  Object.assign(process.env, { NODE_ENV: 'development', ENABLE_TEST_DATA_RESET: 'true', MONGODB_DB: 'test_reset' });
  delete process.env.VERCEL; delete process.env.VERCEL_ENV;
  let role = 'admin', db = 'test_reset', connects = 0;
  const deleted = [], session = {};
  const route = createLoader({
    mongoose: { connection: { get db() { return { databaseName: db }; }, transaction: fn => fn(session) } },
    '@/lib/db': async () => { connects++; },
    '@/lib/authorization': { getSessionUser: async () => ({ role, userId: 'admin' }) },
    '@/lib/auth': { verifyPassword: async p => p === 'correct' },
    '@/models/User': { findOne: async () => ({ password: 'hash' }) },
    '@/models/Setting': { updateMany: async (filter, update, options) => { assert.equal(options.session, session); assert.deepEqual(update, { $set: { pendingItemCount: 0 } }); } },
    '@/models/Order': { deleteMany: async (filter, options) => { assert.deepEqual(filter, {}); assert.equal(options.session, session); deleted.push('orders'); } },
    '@/lib/business-day': { businessDate: () => '2026-10-28' },
    '@/models/Store': { find: () => ({ session: async () => [{ _id: 'store-a' }] }) },
    '@/models/CheckoutQuote': { deleteMany: async (filter, options) => { assert.equal(options.session, session); deleted.push('quotes'); } },
    '@/models/TicketCounter': { findOneAndUpdate: async (filter, update, options) => { assert.equal(options.session, session); assert.equal(filter.storeId, 'store-a'); assert.equal(update.$set.closedDate, '2026-10-28'); assert.equal(update.$set.lastIssuedNumber, 0); deleted.push('closed'); } },
  })('src/app/api/admin/test-reset/route.ts');
  const call = (body = { password: 'correct', confirm: true }) => route.POST(new Request('http://localhost/api/admin/test-reset', { method: 'POST', body: JSON.stringify(body) }));
  process.env.VERCEL_ENV = 'production'; assert.equal((await call()).status, 404);
  // Even local development flags must not override production deployment protection.
  delete process.env.VERCEL_ENV;
  process.env.ENABLE_TEST_DATA_RESET = 'false'; assert.equal((await call()).status, 404);
  process.env.ENABLE_TEST_DATA_RESET = 'true'; process.env.MONGODB_DB = 'production'; assert.equal((await call()).status, 404);
  assert.equal(connects, 0);
  process.env.MONGODB_DB = 'test_reset'; role = 'store'; assert.equal((await call()).status, 403);
  role = 'admin'; db = 'production'; assert.equal((await call()).status, 403);
  db = 'test_reset'; assert.equal((await call({ password: 'wrong', confirm: true })).status, 403);
  assert.equal((await call({ password: 'correct' })).status, 400);
  assert.deepEqual(deleted, []);
  assert.equal((await call()).status, 200);
  assert.deepEqual(deleted, ['closed', 'orders', 'quotes']);
});
