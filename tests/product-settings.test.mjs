import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const storeId = '111111111111111111111111';
const firstId = '222222222222222222222222';
const secondId = '333333333333333333333333';
const request = (method, body) => new Request('http://localhost/api/test', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const commonMocks = {
  '@/lib/db': async () => {},
  '@/lib/store': { getActiveStoreContext: async () => ({ userId: 'owner', storeId }) },
  '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
};

function productFixture(initialProducts) {
  let products = structuredClone(initialProducts);
  let tail = Promise.resolve();
  const guardedQuery = operation => ({ session: async session => {
    assert.ok(session.locked, 'product reads must follow the shared store write in the transaction');
    return operation();
  } });
  const matches = (product, filter) => product.storeId === filter.storeId && (!filter._id || product._id === filter._id);
  const Product = {
    db: { transaction: async callback => {
      const session = { locked: false };
      try { return await callback(session); }
      finally { session.release?.(); }
    } },
    find: filter => ({ sort: async () => products.filter(product => matches(product, filter)) }),
    insertMany: () => { assert.fail('reading an empty menu must never insert samples'); },
    findOne: filter => guardedQuery(() => products.find(product => matches(product, filter))),
    countDocuments: filter => guardedQuery(() => products.filter(product => matches(product, filter)).length),
    findOneAndDelete: async (filter, { session }) => {
      assert.ok(session.locked);
      const found = products.find(product => matches(product, filter));
      products = products.filter(product => product !== found);
      return found;
    },
  };
  const Store = { updateOne: async (filter, update, { session }) => {
    assert.equal(filter._id, storeId);
    assert.deepEqual(update.$inc, { __v: 1 });
    const prior = tail;
    tail = new Promise(resolve => { session.release = resolve; });
    await prior;
    session.locked = true;
    return { matchedCount: 1 };
  } };
  const api = createLoader({ ...commonMocks, '@/models/Product': Product, '@/models/Store': Store })('src/app/api/products/route.ts');
  return { api, products: () => products };
}

test('concurrent reads of an empty menu never recreate sample products', async () => {
  const { api, products } = productFixture([]);
  const responses = await Promise.all(Array.from({ length: 20 }, () => api.GET(new Request('http://localhost/api/products'))));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  }
  assert.deepEqual(products(), []);
});

test('deleting the last product returns a warning and keeps the product', async () => {
  const { api, products } = productFixture([{ _id: firstId, storeId }]);
  const response = await api.DELETE(request('DELETE', { _id: firstId }));
  assert.equal(response.status, 409);
  assert.match((await response.json()).message, /商品は0件にできません/);
  assert.equal(products().length, 1);
});

test('concurrent deletions leave one product and cannot delete another store product', async () => {
  const foreign = { _id: '444444444444444444444444', storeId: 'other-store' };
  const { api, products } = productFixture([{ _id: firstId, storeId }, { _id: secondId, storeId }, foreign]);
  const responses = await Promise.all([firstId, secondId].map(_id => api.DELETE(request('DELETE', { _id }))));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(products().filter(product => product.storeId === storeId).length, 1);
  assert.equal((await api.DELETE(request('DELETE', { _id: foreign._id }))).status, 404);
  assert.ok(products().some(product => product._id === foreign._id));
});

function settingsFixture(initialSetting) {
  let saved = initialSetting && structuredClone(initialSetting);
  const Setting = { findOneAndUpdate: async (filter, update, options) => {
    assert.deepEqual(filter, { storeId, key: 'app_config' });
    // Reproduce the MongoDB update-path conflict that previously made saving fail.
    for (const key of Object.keys(update.$set)) {
      if (Object.hasOwn(update.$setOnInsert, key)) throw new Error(`Conflicting update path: ${key}`);
    }
    if (!saved && options.upsert) saved = structuredClone(update.$setOnInsert);
    Object.assign(saved, structuredClone(update.$set));
    return saved;
  } };
  const api = createLoader({ ...commonMocks, '@/models/Setting': Setting })('src/app/api/settings/route.ts');
  return { api, saved: () => saved };
}

test('saving options and other settings preserves unrelated existing values', async () => {
  const { api, saved } = settingsFixture({ storeId, key: 'app_config', pendingItemCount: 7, cancelPassword: 'keep-existing', lostTickets: [4] });
  const body = {
    maxTicketNumber: 40, maxPendingItemCount: 50, maxItemsPerOrder: 12,
    defaultThroughputPerMinute: 2, waitTimeRecentWindowMinutes: 20,
    waitTimeMinimumCompletedItemCount: 5, waitTimeWarningMinutes: 10, waitTimeCriticalMinutes: 20,
    paymentMethods: ['現金'], cashCalculationEnabled: true, cashPaymentMethod: '現金',
    customizations: [{ name: ' チーズ追加 ', price: 100 }, { name: '氷なし', price: 0 }, { name: '少なめ', price: -50 }],
  };
  const response = await api.POST(request('POST', body));
  assert.equal(response.status, 200);
  assert.deepEqual(saved().customizations, [{ name: 'チーズ追加', price: 100 }, { name: '氷なし', price: 0 }, { name: '少なめ', price: -50 }]);
  assert.equal(saved().maxTicketNumber, 40);
  assert.equal(saved().pendingItemCount, 7);
  assert.equal(saved().cancelPassword, 'keep-existing');
  assert.deepEqual(saved().lostTickets, [4]);
  assert.equal((await api.POST(request('POST', { customizations: [] }))).status, 200);
  assert.deepEqual(saved().customizations, []);
  assert.equal(saved().maxTicketNumber, 40);
});

test('first settings save combines user options with defaults without update conflicts', async () => {
  const { api, saved } = settingsFixture(null);
  const response = await api.POST(request('POST', { customizations: [{ name: 'トッピング', price: 150 }] }));
  assert.equal(response.status, 200);
  assert.deepEqual(saved().customizations, [{ name: 'トッピング', price: 150 }]);
  assert.equal(saved().maxTicketNumber, 30);
  assert.equal(saved().pendingItemCount, 0);
  assert.equal(saved().storeId, storeId);
  assert.equal((await api.POST(request('POST', { customizations: [{ name: '', price: 100 }] }))).status, 400);
  assert.deepEqual(saved().customizations, [{ name: 'トッピング', price: 150 }]);
});
