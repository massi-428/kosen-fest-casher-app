import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

test('quote index setup shares concurrent calls and retries after initialization failure', async () => {
  let client = {}, calls = 0, fail = true;
  const load = createLoader({ '@/models/CheckoutQuote': {
    db: { getClient: () => client },
    collection: { createIndex: async (key, options) => {
      calls++;
      assert.deepEqual(key, { storeId: 1, requestId: 1 });
      assert.equal(options.unique, true);
      if (fail) throw new Error('temporary index outage');
    } },
  } });
  const { ensureCheckoutQuoteIndex: ensure } = load('src/lib/checkout-quote-index.ts');
  const first = await Promise.allSettled([ensure(), ensure(), ensure()]);
  assert.ok(first.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  fail = false;
  await Promise.all([ensure(), ensure()]);
  await ensure();
  assert.equal(calls, 2);
  client = {};
  await ensure();
  assert.equal(calls, 3);
});

function harness({ duplicate = false, indexFailure = false } = {}) {
  let saved, writes = 0;
  const productId = '000000000000000000000001';
  const route = createLoader({
    '@/lib/db': async () => {},
    '@/lib/store': { getActiveStoreContext: async () => ({ storeId: 'store', userId: 'user' }) },
    '@/lib/checkout-quote-index': { ensureCheckoutQuoteIndex: async () => { if (indexFailure) throw Object.assign(new Error('secret connection details'), { code: 89 }); } },
    '@/models/TicketCounter': { findOne: async () => null },
    '@/models/Product': { find: async () => [{ _id: productId, name: '商品', price: 100 }] },
    '@/models/Setting': { findOne: async () => ({ paymentMethods: ['現金'], customizations: [] }) },
    '@/models/CheckoutQuote': {
      findOne: async () => saved,
      findOneAndUpdate: async (_filter, update) => {
        writes++;
        saved = update.$setOnInsert;
        if (duplicate) throw Object.assign(new Error('duplicate'), { code: 11000 });
        return saved;
      },
    },
  })('src/app/api/order-quotes/route.ts');
  return {
    writes: () => writes,
    call: (extra = {}) => route.POST(new Request('http://localhost/api/order-quotes', { method: 'POST', body: JSON.stringify({ requestId: 'quote-1', items: [{ productId, quantity: 2, selectedOptionNames: [], ...extra }] }) })),
  };
}

test('duplicate quote insert recovers the saved price and repeated requests reuse it', async () => {
  const h = harness({ duplicate: true });
  const response = await h.call();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).totalAmount, 200);
  assert.equal((await h.call()).status, 200);
  assert.equal(h.writes(), 1);
});

test('quote failures identify the failing stage without leaking raw error details', async () => {
  const previous = console.error, logs = [];
  console.error = (...args) => logs.push(args);
  try {
    const response = await harness({ indexFailure: true }).call();
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.errorCode, 'QUOTE_QUOTE_INDEX');
    assert.equal(logs[0][1].stage, 'quote-index');
    assert.equal(logs[0][1].code, 89);
    assert.doesNotMatch(JSON.stringify([logs, body]), /secret/);
  } finally { console.error = previous; }
});

test('invalid option payloads are validation errors instead of generic retry failures', async () => {
  const h = harness();
  assert.equal((await h.call({ selectedOptionNames: {} })).status, 400);
  assert.equal(h.writes(), 0);
});
