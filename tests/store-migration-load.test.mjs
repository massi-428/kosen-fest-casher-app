import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

test('legacy migration is shared, expires, retries failures and keeps store authorization fresh', async t => {
  let now = 1000; t.mock.method(Date, 'now', () => now);
  const calls = []; let fail = false; let authChecks = 0;
  const mocks = {
    '@/lib/auth': { getSession: () => ({ userId: 'owner', activeStoreId: 'store' }) },
    '@/lib/systemSettings': {},
    '@/models/Store': { findOne: async () => { authChecks++; return {}; } },
  };
  for (const name of ['Product', 'Order', 'Setting']) mocks['@/models/' + name] = {
    updateMany: async (query, update) => { calls.push({ name, query, update }); if (fail) throw new Error('temporarily unavailable'); },
  };
  const { migrateLegacyOwnerDataToStore: migrate, getActiveStoreContext } = createLoader(mocks)('src/lib/store.ts');
  await Promise.all(Array.from({ length: 20 }, () => getActiveStoreContext({})));
  assert.equal(authChecks, 20);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].query, { ownerId: 'owner', storeId: null });
  assert.deepEqual(calls[0].update, { $set: { storeId: 'store' } });
  await migrate('owner', 'store'); assert.equal(calls.length, 3);
  await migrate('owner', 'other-store'); assert.equal(calls.length, 6);
  await migrate('other-owner', 'store'); assert.equal(calls.length, 9);
  now += 300000; fail = true;
  await assert.rejects(() => migrate('owner', 'store'), /temporarily unavailable/);
  fail = false; await migrate('owner', 'store'); assert.equal(calls.length, 13);
});
