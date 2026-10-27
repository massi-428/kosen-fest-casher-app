import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';

test('retired store cleanup never connects or deletes data', async () => {
  const fail = () => assert.fail('must not access database');
  const route = createLoader({ '@/lib/db': fail, '@/lib/authorization': {}, '@/models/User': {}, '@/models/Store': {} })('src/app/api/admin/stores/route.ts');
  assert.equal((await route.POST()).status, 410);
});

test('closing refuses unfinished work and preserves history; status distinguishes closed days', async () => {
  let pending = true, closedDate;
  const session = {}, writes = [];
  const route = createLoader({
    '@/lib/db': async () => {}, '@/lib/store': { getActiveStoreContext: async () => ({ storeId: 'a' }) },
    '@/lib/auth': {}, '@/lib/business-day': { businessDate: () => '2026-10-28' },
    '@/models/Order': { exists: () => ({ session: async () => pending }), countDocuments: async () => pending ? 1 : 0 },
    '@/models/TicketCounter': {
      db: { transaction: fn => fn(session) }, findOne: async () => ({ closedDate }),
      findOneAndUpdate: async () => ({ closedDate }),
      updateOne: async (filter, update, options) => { assert.equal(options.session, session); assert.equal(filter.storeId, 'a'); writes.push(update); closedDate = update.$set?.closedDate; },
    },
  })('src/app/api/business-day/route.ts');
  const call = () => route.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ date: '2026-10-28', confirm: true }) }));
  assert.equal((await call()).status, 409); assert.equal(writes.length, 0);
  pending = false; assert.equal((await call()).status, 200); assert.equal(writes.length, 1);
  assert.equal((await (await route.GET(new Request('http://localhost'))).json()).closed, true);
  assert.equal((await call()).status, 200); assert.equal(writes.length, 1);
  const reopen = body => route.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ date: '2026-10-28', action: 'reopen', ...body }) }));
  assert.equal((await reopen({})).status, 400);
  assert.equal((await reopen({ confirm: true, date: '2026-10-27' })).status, 400);
  assert.equal((await reopen({ confirm: true })).status, 200);
  assert.deepEqual(writes[1], { $unset: { closedDate: 1 } });
  assert.equal((await (await route.GET(new Request('http://localhost'))).json()).closed, false);
  assert.equal((await reopen({ confirm: true })).status, 200); assert.equal(writes.length, 2);
});
