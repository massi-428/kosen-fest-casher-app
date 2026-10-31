import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';

const id = '507f1f77bcf86cd799439011';
function setup(overrides = {}) {
  const state = { order: { _id: id, status: 'completed', revision: 2, paymentMethod: '現金', receivedAmount: 1000, changeAmount: 500, createdAt: new Date('2026-10-31T01:00:00Z') }, context: { storeId: 'store-a', userId: 'user-a' }, ...overrides };
  const session = {};
  class BusinessClosedError extends Error {}
  const load = createLoader({
    '@/lib/db': { __esModule: true, default: async () => {} },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
    '@/lib/store': { getActiveStoreContext: async () => state.context },
    '@/lib/business-day': { BusinessClosedError, withOpenBusiness: async (storeId, action) => { assert.equal(storeId, 'store-a'); return action(session, state.closedAt); } },
    '@/models/Setting': { __esModule: true, default: { findOne: () => ({ session: async () => ({ paymentMethods: ['現金', 'PayPay'] }) }) } },
    '@/models/Order': { __esModule: true, default: {
      findOne: filter => { state.readFilter = filter; return { session: async () => state.order }; },
      findOneAndUpdate: async (filter, update, options) => { state.write = { filter, update, options }; return state.conflict ? null : { ...state.order, ...update.$set }; },
    } },
  });
  const { POST } = load('src/app/api/orders/payment/route.ts');
  return { state, post: (body = {}) => POST(new Request('http://localhost/api/orders/payment', { method: 'POST', body: JSON.stringify({ orderId: id, expectedRevision: 2, paymentMethod: 'PayPay', ...body }) })) };
}

test('corrects a completed order in its store and atomically preserves an audit trail', async () => {
  const { state, post } = setup();
  assert.equal((await post()).status, 200);
  assert.equal(state.readFilter.storeId, 'store-a');
  assert.equal(state.write.filter.storeId, 'store-a');
  assert.equal(state.write.filter.revision, 2);
  assert.equal(state.write.filter.settlementLock, null);
  assert.deepEqual(state.write.update.$set, { paymentMethod: 'PayPay', receivedAmount: null, changeAmount: null });
  assert.equal(state.write.update.$inc.revision, 1);
  const audit = state.write.update.$push.paymentCorrections;
  assert.equal(audit.beforeMethod, '現金');
  assert.equal(audit.afterMethod, 'PayPay');
  assert.equal(audit.changedBy, 'user-a');
  assert.equal(audit.previousReceivedAmount, 1000);
  assert.equal(audit.previousChangeAmount, 500);
});

test('rejects unauthenticated, missing, stale, locked, cancelled and closed orders', async () => {
  for (const [overrides, expected] of [[{ context: null }, 401], [{ order: null }, 404], [{ closedAt: new Date('2026-10-31T02:00:00Z') }, 409], [{ conflict: true }, 409]]) {
    const { post } = setup(overrides);
    assert.equal((await post()).status, expected);
  }
  for (const patch of [{ revision: 3 }, { settlementLock: 'operation' }, { status: 'cancelled' }]) {
    const { state, post } = setup(); Object.assign(state.order, patch);
    assert.equal((await post()).status, 409); assert.equal(state.write, undefined);
  }
});

test('validates payment methods and revisions and treats unchanged methods as a no-op', async () => {
  for (const body of [{ paymentMethod: 'invalid' }, { paymentMethod: { $ne: null } }, { expectedRevision: -1 }, { orderId: 'invalid' }]) {
    const { state, post } = setup(); assert.equal((await post(body)).status, 400); assert.equal(state.write, undefined);
  }
  const { state, post } = setup();
  assert.equal((await post({ paymentMethod: '現金' })).status, 200);
  assert.equal(state.write, undefined);
});
