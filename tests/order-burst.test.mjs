import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

function setup({ occupied = [], lost = [], last = 0 } = {}) {
  const state = { orders: occupied.map(ticketNumber => ({ ticketNumber })), last, transactions: 0, scans: 0, pending: occupied.length };
  const session = {};
  const inSession = value => ({ session: async supplied => { assert.equal(supplied, session); return value; } });
  const route = createLoader({
    '@/lib/db': async () => {},
    '@/lib/store': { getActiveStoreContext: async () => ({ storeId: 'store', userId: 'user' }) },
    '@/lib/auth': {},
    '@/models/CheckoutQuote': {
      findOne: async () => ({ _id: 'quote', totalAmount: 100, paymentMethods: ['cash'], items: [{ quantity: 1 }], createdAt: new Date() }),
      findOneAndUpdate: async (_filter, update) => update.$set,
    },
    '@/models/Setting': {
      findOneAndUpdate: async (_filter, update) => {
        state.pending += update.$inc?.pendingItemCount || 0;
        return { maxTicketNumber: 30, lostTickets: lost, pendingItemCount: state.pending };
      },
      updateOne: async (_filter, update) => { state.pending += update.$inc?.pendingItemCount || 0; },
    },
    '@/models/TicketCounter': {
      db: { transaction: async action => { state.transactions++; return action(session); } },
      findOneAndUpdate: async () => ({}),
      findOne: () => inSession({ lastIssuedNumber: state.last }),
      updateOne: async (_filter, update, options) => { assert.equal(options.session, session); state.last = update.$set.lastIssuedNumber; },
    },
    '@/models/Order': {
      findOne: async filter => state.orders.find(order => order.requestId === filter.requestId),
      aggregate: () => assert.fail('initialized counter must not aggregate all order items'),
      distinct: (field, filter) => {
        assert.equal(field, 'ticketNumber'); assert.equal(filter.storeId, 'store');
        assert.deepEqual(filter.status.$in, ['active', 'pending']); state.scans++;
        return inSession(state.orders.map(order => order.ticketNumber));
      },
      create: async ([order], options) => { assert.equal(options.session, session); state.orders.push(order); return [order]; },
    },
  })('src/app/api/orders/route.ts');
  const submit = requestId => route.POST(new Request('http://localhost/api/orders', {
    method: 'POST', body: JSON.stringify({ requestId, expectedTotal: 100, paymentMethod: 'cash' }),
  }));
  return { state, submit };
}

test('consecutive orders fill the ticket range once each and retries do not duplicate orders', async () => {
  const h = setup();
  for (let i = 1; i <= 30; i++) {
    const response = await h.submit(`order-${i}`);
    assert.equal(response.status, 201);
    assert.equal((await response.json()).ticketNumber, String(i));
  }
  assert.equal((await h.submit('order-30')).status, 200);
  assert.equal(h.state.orders.length, 30);
  assert.equal((await h.submit('full')).status, 409);
  assert.equal(h.state.transactions, 31);
  assert.equal(h.state.pending, 30);
  h.state.orders.shift(); // Returned ticket becomes available after wraparound.
  assert.equal((await (await h.submit('next')).json()).ticketNumber, '1');
});

test('occupied and lost tickets are skipped in one transaction and one scan', async () => {
  const h = setup({ occupied: Array.from({ length: 28 }, (_, i) => String(i + 1)), lost: [29] });
  const result = await h.submit('last-free');
  assert.equal(result.status, 201);
  assert.equal((await result.json()).ticketNumber, '30');
  assert.equal(h.state.transactions, 1);
  assert.equal(h.state.scans, 1);
});
