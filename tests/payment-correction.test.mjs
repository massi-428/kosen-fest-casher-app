import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';

const id = '507f1f77bcf86cd799439011';
function setup(overrides = {}) {
  const state = { order: { _id: id, status: 'completed', revision: 2, paymentMethod: '現金', receivedAmount: 1000, changeAmount: 500, totalAmount: 500, items: [{ productName: 'お茶', quantity: 2, amount: 500 }], createdAt: new Date('2026-10-31T01:00:00Z') }, context: { storeId: 'store-a', userId: 'user-a' }, ...overrides };
  const session = {};
  const load = createLoader({
    '@/lib/db': { __esModule: true, default: async () => {} },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
    '@/lib/store': { getActiveStoreContext: async () => state.context },
    '@/models/TicketCounter': {
      db: { transaction: async action => action(session) },
      findOneAndUpdate: async (filter, update, options) => {
        assert.deepEqual(filter, { storeId: 'store-a' });
        assert.equal(options.session, session);
        assert.deepEqual(update, { $inc: { businessRevision: 1 } });
        return { closedAt: state.closedAt, closedDate: state.closedDate };
      },
    },
    '@/models/Setting': { __esModule: true, default: { findOne: () => ({ session: async () => ({ paymentMethods: ['現金', 'PayPay'] }) }) } },
    '@/models/Order': { __esModule: true, default: {
      findOne: filter => { state.readFilter = filter; return { session: async () => state.order }; },
      findOneAndUpdate: async (filter, update, options) => {
        assert.equal(options.session, session);
        state.write = { filter, update, options };
        if (state.conflict || state.order.revision !== filter.revision) return null;
        state.order = { ...state.order, ...update.$set, revision: state.order.revision + update.$inc.revision, paymentCorrections: [...(state.order.paymentCorrections || []), update.$push.paymentCorrections] };
        return state.order;
      },
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
  assert.equal(audit.afterClosing, false);
  assert.ok(audit.createdAt instanceof Date);
});

test('rejects unauthenticated, missing, stale, locked and cancelled orders', async () => {
  for (const [overrides, expected] of [[{ context: null }, 401], [{ order: null }, 404], [{ conflict: true }, 409]]) {
    const { post } = setup(overrides);
    assert.equal((await post()).status, expected);
  }
  for (const patch of [{ revision: 3 }, { settlementLock: 'operation' }, { status: 'cancelled' }]) {
    const { state, post } = setup(); Object.assign(state.order, patch);
    assert.equal((await post()).status, 409); assert.equal(state.write, undefined);
  }
});

test('closed and reopened days allow audited corrections without changing the closing state or sales total', async () => {
  const { summarizeSalesByPayment } = createLoader()('src/lib/payment-sales.ts');
  for (const closedDate of [new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10), undefined]) {
    const closedAt = new Date('2026-10-31T02:00:00Z');
    const { state, post } = setup({ closedAt, closedDate });
    assert.equal((await post()).status, 200);
    const audit = state.order.paymentCorrections[0];
    assert.equal(audit.afterClosing, true);
    assert.equal(audit.closedAt, closedAt);
    assert.equal(audit.changedBy, 'user-a');
    assert.equal(state.order.status, 'completed');
    assert.equal(state.order.totalAmount, 500);
    const [summary] = summarizeSalesByPayment([state.order]);
    assert.equal(summary.name, 'PayPay');
    assert.equal(summary.quantity, 2);
    assert.equal(summary.amount, 500);
    assert.equal((await post()).status, 409); // stale retry cannot append another log
    assert.equal(state.order.paymentCorrections.length, 1);
    assert.equal((await post({ expectedRevision: 3, paymentMethod: '現金' })).status, 200);
    assert.equal(state.order.paymentCorrections.length, 2);
    assert.equal(state.order.paymentCorrections[0].beforeMethod, '現金');
    assert.equal(state.order.paymentCorrections[1].beforeMethod, 'PayPay');
    assert.equal(state.order.paymentCorrections[1].afterMethod, '現金');
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

test('simultaneous corrections cannot overwrite the same revision or duplicate its audit entry', async () => {
  const { state, post } = setup({ closedAt: new Date('2026-10-31T02:00:00Z') });
  const responses = await Promise.all([post(), post()]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal(state.order.revision, 3);
  assert.equal(state.order.paymentCorrections.length, 1);
});
