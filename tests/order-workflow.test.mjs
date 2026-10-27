import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
// Execute the actual route handlers with a deterministic in-memory model.
// This test never loads db.ts, environment credentials, or a MongoDB connection.
function load(path, mocks = {}) {
  const source = readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name in mocks) return mocks[name];
    if (name === 'next/server') return { NextResponse: Response };
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', mocks);
    return require(name);
  }, compiled, compiled.exports);
  return compiled.exports;
}
const accounting = load('src/lib/order-accounting.ts');
const id = n => n.toString(16).padStart(24, '0');
const copy = value => structuredClone(value);
const line = { _id: id(2), productId: id(3), productName: 'コーヒー', quantity: 1, amount: 500, detail: '', selectedOptions: [] };
const initial = (extra = {}) => ({ _id: id(1), storeId: 'test-store', ticketNumber: '1', status: 'active', items: [copy(line)], totalAmount: 500, receivedAmount: 1000, changeAmount: 500, paymentMethod: '現金', createdAt: new Date('2026-09-12T01:00:00Z'), ...extra });

function matches(doc, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some(f => matches(doc, f));
    const actual = key === 'editRequests.requestId' ? (doc.editRequests || []).map(e => e.requestId) : key === 'settlementOperations.operationId' ? (doc.settlementOperations || []).map(e => e.operationId) : doc[key];
    if (Array.isArray(actual) && typeof value === 'string') return actual.includes(value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$in' in value) return value.$in.includes(actual);
      if ('$ne' in value) return Array.isArray(actual) ? !actual.includes(value.$ne) : actual !== value.$ne;
      if ('$exists' in value) return (actual !== undefined) === value.$exists;
      return (!('$gte' in value) || actual >= value.$gte) && (!('$lte' in value) || actual <= value.$lte);
    }
    return value === null ? actual == null : actual === value;
  });
}
function harness(seed = [initial()]) {
  const state = { orders: copy(seed), failCounter: false, failRead: false, duplicateOnUpdate: false };
  const query = value => ({ then: (resolve, reject) => Promise.resolve(copy(value)).then(resolve, reject), select() { return this; }, sort() { return this; }, limit() { return this; } });
  const Order = {
    find: filter => { if (state.failRead) throw new Error('simulated read outage'); return query(state.orders.filter(o => matches(o, filter))); },
    findOne: filter => query(state.orders.find(o => matches(o, filter)) || null),
    exists: async filter => state.orders.some(o => matches(o, filter)),
    aggregate: async () => [{ count: state.orders.filter(o => ['active', 'pending'].includes(o.status)).reduce((s, o) => s + o.items.reduce((sum, i) => sum + i.quantity, 0), 0) }],
    findOneAndUpdate: async (filter, update) => {
      if (state.duplicateOnUpdate) throw Object.assign(new Error('duplicate ticket'), { code: 11000 });
      const doc = state.orders.find(o => matches(o, filter));
      if (!doc) return null;
      Object.assign(doc, copy(update.$set || {}));
      for (const [key, value] of Object.entries(update.$inc || {})) doc[key] = (doc[key] || 0) + value;
      for (const [key, value] of Object.entries(update.$push || {})) (doc[key] ||= []).push(copy(value));
      return copy(doc);
    },
  };
  const mocks = {
    '@/lib/db': async () => {},
    '@/lib/store': { getActiveStoreContext: async () => ({ storeId: 'test-store', userId: 'test-user' }) },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
    '@/lib/systemSettings': { getCancelPassword: async () => 'test-password' },
    '@/models/Order': Order,
    '@/models/Product': { find: async () => [{ _id: id(3), name: 'コーヒー', price: 800 }] },
    '@/models/Setting': { findOne: async () => ({ customizations: [], cashCalculationEnabled: true, cashPaymentMethod: '現金' }), updateOne: async () => { if (state.failCounter) throw new Error('simulated counter outage'); } },
    '@/models/TicketCounter': {
      db: { transaction: async action => action({}) },
      findOneAndUpdate: async () => ({ closedDate: null, closedAt: null }),
    },
    '@/models/CheckoutQuote': {},
  };
  const operations = load('src/app/api/settlements/route.ts', mocks);
  const edit = load('src/app/api/orders/route.ts', mocks).PUT;
  const tickets = load('src/app/api/tickets/route.ts', mocks).PUT;
  const report = load('src/app/api/report/route.ts', mocks).GET;
  const request = body => new Request('http://localhost/api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { state, operations: body => operations.POST(request(body)), lookup: operationId => operations.GET(new Request('http://localhost/api/settlements?operationId=' + operationId)), edit: body => edit(request(body)), tickets: body => tickets(request(body)), report: (scope = '') => report(new Request('http://localhost/api/report?date=2026-09-12' + scope)) };
}
const editBody = (extra = {}) => ({ orderId: id(1), requestId: 'edit-1', expectedRevision: 0, expectedTotal: 1000, items: [{ lineId: id(2), productId: id(3), quantity: 2, detail: '', selectedOptionNames: [] }], note: '', settlement: { confirmed: true, receivedAmount: 1000 }, ...extra });
const prepare = (extra = {}) => ({ ...editBody(), action: 'prepare', kind: 'edit', operationId: 'operation-1', ...extra });
const action = (name, extra = {}) => ({ orderId: id(1), operationId: 'operation-1', action: name, ...extra });

test('prepare freezes accepted prices before cash changes hands and prevents other mutations', async () => {
  const h = harness();
  const responses = await Promise.all([h.operations(prepare()), h.operations(prepare())]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(h.state.orders[0].settlementOperations.length, 1);
  assert.equal(h.state.orders[0].settlementOperations[0].afterAmount, 1000);
  assert.equal(h.state.orders[0].totalAmount, 500);
  for (const status of ['active', 'pending', 'completed', 'cancelled']) assert.equal((await h.tickets({ orderId: id(1), expectedRevision: 1, status })).status, 409);
  assert.equal((await h.operations(prepare({ operationId: 'another', expectedRevision: 1 }))).status, 409);
});

test('only one handoff start succeeds and handoff cannot be automatically aborted', async () => {
  const h = harness(); await h.operations(prepare());
  const results = await Promise.all([h.operations(action('start')), h.operations(action('start'))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await h.operations(action('abort'))).status, 409);
  assert.equal((await (await h.lookup('operation-1')).json()).operation.phase, 'handling');
});

test('cash settlement commits atomically and concurrent retries append exactly one history entry', async () => {
  const h = harness(); await h.operations(prepare()); await h.operations(action('start'));
  assert.equal((await h.operations(action('commit', { confirmed: true, receivedAmount: 499 }))).status, 400);
  assert.equal((await h.operations(action('commit', { confirmed: false, receivedAmount: 1000 }))).status, 400);
  const body = action('commit', { confirmed: true, receivedAmount: 1000 });
  const responses = await Promise.all([h.operations(body), h.operations(body)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const order = h.state.orders[0];
  assert.equal(order.totalAmount, 1000); assert.equal(order.receivedAmount, 1000); assert.equal(order.changeAmount, 500);
  assert.equal(order.settlements.length, 1); assert.equal(order.settlements[0].delta, 500); assert.equal(order.settlements[0].changeAmount, 500);
  assert.equal((await h.operations(body)).status, 200); assert.equal(order.settlements.length, 1);
});

test('lost response can be recovered by operation ID after atomic commit without another payment', async () => {
  const h = harness(); await h.operations(prepare()); await h.operations(action('start'));
  await h.operations(action('commit', { confirmed: true, receivedAmount: 500 })); // response intentionally ignored
  const result = await (await h.lookup('operation-1')).json();
  assert.equal(result.operation.phase, 'completed'); assert.equal(result.order.settlements.length, 1);
  assert.equal((await h.operations(action('commit', { confirmed: true, receivedAmount: 500 }))).status, 200);
});

test('refund then full cancellation refunds only remaining total, preserving initial cash', async () => {
  const h = harness([initial({ items: [{ ...line, quantity: 2, amount: 1000 }], totalAmount: 1000 })]);
  await h.operations(prepare({ expectedTotal: 500, items: [{ lineId: id(2), productId: id(3), quantity: 1, detail: '', selectedOptionNames: [] }] }));
  await h.operations(action('start')); await h.operations(action('commit', { confirmed: true }));
  assert.equal((await h.operations(prepare({ operationId: 'cancel', kind: 'cancel', expectedRevision: 3, cancelPassword: 'test-password' }))).status, 200);
  await h.operations(action('start', { operationId: 'cancel' }));
  await h.operations(action('commit', { operationId: 'cancel', confirmed: true }));
  const order = h.state.orders[0];
  assert.equal(order.status, 'cancelled'); assert.equal(order.settlements.reduce((sum, entry) => sum + entry.delta, 0), -1000); assert.equal(order.receivedAmount, 1000);
  assert.deepEqual(await (await h.report()).json(), []);
});

test('zero-delta edits need no handoff and pre-handoff abort unlocks the order', async () => {
  const h = harness();
  const body = prepare({ expectedTotal: 500, note: '備考のみ', items: [{ lineId: id(2), productId: id(3), quantity: 1, detail: '', selectedOptionNames: [] }] });
  await h.operations(body); assert.equal((await h.operations(action('commit'))).status, 200);
  assert.equal(h.state.orders[0].note, '備考のみ'); assert.equal(h.state.orders[0].settlements, undefined);
  await h.operations(prepare({ operationId: 'abort', expectedRevision: 2 }));
  assert.equal((await h.operations(action('abort', { operationId: 'abort' }))).status, 200); assert.equal(h.state.orders[0].settlementLock, null);
});

test('changed price/revision are rejected before reservation; legacy direct edits cannot bypass it', async () => {
  const h = harness();
  assert.equal((await h.operations(prepare({ expectedTotal: 1600 }))).status, 409);
  assert.equal((await h.operations(prepare({ expectedRevision: 1 }))).status, 409);
  assert.equal((await h.edit(editBody())).status, 409);
  assert.equal(h.state.orders[0].settlementLock, undefined); assert.equal(h.state.orders[0].totalAmount, 500);
});

test('returning a reused ticket changes only the current order; cancelled history and other store stay untouched', async () => {
  const h = harness([initial(), initial({ _id: id(4), status: 'cancelled' }), initial({ _id: id(5), storeId: 'other' })]);
  assert.equal((await h.tickets({ orderId: id(1), expectedRevision: 0, status: 'completed' })).status, 200);
  assert.deepEqual(h.state.orders.map(o => o.status), ['completed', 'cancelled', 'active']);
  assert.equal((await h.tickets({ ticketNumber: '1', status: 'completed' })).status, 400);
  assert.equal((await h.tickets({ orderId: id(4), expectedRevision: 0, status: 'completed' })).status, 409);
  assert.equal((await h.tickets({ orderId: id(1), expectedRevision: 0, status: 'completed' })).status, 409);
});

test('pending, resume, completed, reopen keep revenue stable and clear/rewrite completion time', async () => {
  const h = harness();
  for (const [revision, status] of ['pending', 'active', 'completed', 'active', 'completed'].entries()) {
    assert.equal((await h.tickets({ orderId: id(1), expectedRevision: revision, status })).status, 200);
    const report = await (await h.report()).json();
    assert.equal(report.reduce((sum, o) => sum + o.totalAmount, 0), 500);
    assert.equal(Boolean(h.state.orders[0].completedAt), status === 'completed');
    if (status === 'active') assert.equal(h.state.orders[0].completedAt, null);
  }
});

test('reopen refuses reused numbers and concurrent index conflicts without overwriting any order', async () => {
  const h = harness([initial({ status: 'completed' }), initial({ _id: id(4) })]);
  assert.equal((await h.tickets({ orderId: id(1), expectedRevision: 0, status: 'active' })).status, 409);
  assert.equal(h.state.orders[0].status, 'completed');
  h.state.orders.pop(); h.state.duplicateOnUpdate = true;
  assert.equal((await h.tickets({ orderId: id(1), expectedRevision: 0, status: 'active' })).status, 409);
  assert.equal(h.state.orders[0].status, 'completed');
});

test('noncash requires manual confirmation but no received cash; old sold-out lines keep original base/options', () => {
  assert.deepEqual(accounting.settlementAmounts(500, 800, true, false, undefined), { delta: 300, receivedAmount: null, changeAmount: null });
  const original = [{ ...line, amount: 550, selectedOptions: [{ name: 'ミルク', price: 50 }] }];
  const result = accounting.priceEditedItems([{ lineId: id(2), productId: id(3), quantity: 2, detail: '', selectedOptionNames: ['ミルク'] }], original, [{ _id: id(3), name: '新名称', price: 800, isAvailable: false }], [{ name: 'ミルク', price: 100 }]);
  assert.equal(result[0].amount, 1100); assert.equal(result[0].productName, 'コーヒー');
});

test('daily report uses JST boundaries and CSV sales lines equal daily sales for all paid states', async () => {
  const h = harness(['active', 'pending', 'completed', 'cancelled'].map((status, i) => initial({ _id: id(i + 10), status })));
  h.state.orders.push(initial({ _id: id(99), createdAt: new Date('2026-09-11T14:59:59Z') }));
  h.state.orders.push(initial({ _id: id(100), createdAt: new Date('2026-09-11T15:00:00Z') }));
  const daily = await (await h.report()).json(); const all = await (await h.report('&scope=all')).json();
  assert.equal(daily.length, 4); assert.equal(all.length, 5);
  assert.equal(daily.reduce((s, o) => s + o.totalAmount, 0), all.filter(accounting.isSalesOrder).flatMap(o => o.items).reduce((s, i) => s + i.amount, 0));
});

test('report read failures are HTTP errors, never an empty successful report; retry recovers', async () => {
  const h = harness(); h.state.failRead = true;
  const failed = await h.report();
  assert.equal(failed.status, 500); assert.equal(Array.isArray(await failed.json()), false);
  h.state.failRead = false;
  assert.equal((await (await h.report()).json())[0].totalAmount, 500);
});
