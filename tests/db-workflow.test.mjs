import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import env from '@next/env';
import { createLoader } from './support/load-ts.mjs';

test('isolated real MongoDB: settlements, tickets, quotes, retries, legacy orders and history', { skip: process.env.RUN_ISOLATED_DB_TESTS !== '1' }, async t => {
  env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  if (!process.env.MONGODB_URI) throw new Error('DB configuration missing (values suppressed)');
  const testDbName = 'casher_presentation_test_' + randomUUID().replaceAll('-', '');
  const connection = mongoose.createConnection(process.env.MONGODB_URI, { dbName: testDbName, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 12000 });
  let isolated = false;
  try {
    await connection.asPromise();
    assert.equal(connection.name, testDbName);
    assert.match(connection.name, /^casher_presentation_test_[a-f0-9]{32}$/);
    assert.equal((await connection.db.listCollections().toArray()).length, 0, 'new isolated database must have no existing collections');
    isolated = true;
    const storeId = new mongoose.Types.ObjectId().toString();
    const userId = 'isolated-test-user';
    const load = createLoader({
      mongoose: { ...mongoose, models: connection.models, model: (name, schema, collection) => connection.model(name, schema, collection) },
      '@/lib/db': async () => {},
      '@/lib/store': { getActiveStoreContext: async () => ({ storeId, userId }) },
      '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
      '@/lib/systemSettings': { getCancelPassword: async () => 'isolated-password' },
    });
    const Order = load('src/models/Order.ts').default;
    const Product = load('src/models/Product.ts').default;
    const Setting = load('src/models/Setting.ts').default;
    const Quote = load('src/models/CheckoutQuote.ts').default;
    const Counter = load('src/models/TicketCounter.ts').default;
    for (const Model of [Order, Product, Setting, Quote, Counter]) { assert.equal(Model.db.name, testDbName); await Model.createCollection(); await Model.createIndexes(); }
    await Setting.create({ ownerId: userId, storeId, key: 'app_config', cashCalculationEnabled: true, cashPaymentMethod: '現金', paymentMethods: ['現金', 'カード'] });
    const product = await Product.create({ ownerId: userId, storeId, name: '隔離テスト商品', price: 800 });
    const oldId = new mongoose.Types.ObjectId();
    const lineId = new mongoose.Types.ObjectId();
    // Legacy document deliberately omits revision and settlement fields.
    await Order.collection.insertOne({ _id: oldId, ownerId: userId, storeId, ticketNumber: '1', items: [{ _id: lineId, productId: String(product._id), productName: '受付時商品', quantity: 1, amount: 500, detail: '', selectedOptions: [] }], totalAmount: 500, receivedAmount: 1000, changeAmount: 500, paymentMethod: '現金', status: 'active', createdAt: new Date('2026-09-12T01:00:00Z') });
    const settlements = load('src/app/api/settlements/route.ts');
    const tickets = load('src/app/api/tickets/route.ts');
    const orders = load('src/app/api/orders/route.ts');
    const quotes = load('src/app/api/order-quotes/route.ts');
    const call = (handler, body) => handler(new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const operationId = randomUUID();
    const prepare = { action: 'prepare', kind: 'edit', operationId, orderId: String(oldId), expectedRevision: 0, expectedTotal: 1000, items: [{ lineId: String(lineId), productId: String(product._id), quantity: 2, detail: '保持', selectedOptionNames: [] }], note: '隔離テスト' };
    await t.test('simultaneous prepare reserves only one operation; legacy prices survive', async () => {
      const responses = await Promise.all([call(settlements.POST, prepare), call(settlements.POST, prepare)]);
      assert.deepEqual(responses.map(r => r.status), [200, 200]);
      const doc = await Order.findById(oldId);
      assert.equal(doc.settlementLock, operationId); assert.equal(doc.settlementOperations.length, 1); assert.equal(doc.settlementOperations[0].afterAmount, 1000);
      assert.equal(doc.totalAmount, 500);
    });
    await t.test('every conflicting state change and separate edit is refused while reserved', async () => {
      const revision = (await Order.findById(oldId)).revision;
      for (const status of ['completed', 'pending', 'active', 'cancelled']) assert.equal((await call(tickets.PUT, { orderId: String(oldId), expectedRevision: revision, status })).status, 409);
      assert.equal((await call(settlements.POST, { ...prepare, operationId: randomUUID(), expectedRevision: revision })).status, 409);
      assert.equal((await call(orders.PUT, {})).status, 409);
    });
    await t.test('only one screen begins handoff; no expiry or abort after handoff starts', async () => {
      const body = { action: 'start', operationId, orderId: String(oldId) };
      const responses = await Promise.all([call(settlements.POST, body), call(settlements.POST, body)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal((await call(settlements.POST, { ...body, action: 'abort' })).status, 409);
      const resumed = await settlements.GET(new Request('http://localhost/api/settlements?operationId=' + operationId));
      assert.equal((await resumed.json()).operation.phase, 'handling');
    });
    await t.test('concurrent commit/retry records one settlement and preserves initial cash', async () => {
      const body = { action: 'commit', operationId, orderId: String(oldId), confirmed: true, receivedAmount: 1000 };
      const responses = await Promise.all([call(settlements.POST, body), call(settlements.POST, body)]);
      assert.deepEqual(responses.map(r => r.status), [200, 200]);
      assert.equal((await call(settlements.POST, body)).status, 200);
      const doc = await Order.findById(oldId);
      assert.equal(doc.settlements.length, 1); assert.equal(doc.settlements[0].delta, 500); assert.equal(doc.settlements[0].changeAmount, 500);
      assert.equal(doc.totalAmount, 1000); assert.equal(doc.receivedAmount, 1000); assert.equal(doc.changeAmount, 500); assert.equal(doc.settlementLock, null);
    });
    await t.test('full cancellation is reserved before refund and records current total exactly once', async () => {
      const id = randomUUID(); const doc = await Order.findById(oldId);
      assert.equal((await call(settlements.POST, { action: 'prepare', kind: 'cancel', operationId: id, orderId: String(oldId), expectedRevision: doc.revision, cancelPassword: 'isolated-password' })).status, 200);
      await call(settlements.POST, { action: 'start', operationId: id, orderId: String(oldId) });
      const body = { action: 'commit', operationId: id, orderId: String(oldId), confirmed: true };
      await Promise.all([call(settlements.POST, body), call(settlements.POST, body)]);
      const cancelled = await Order.findById(oldId);
      assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.settlements.length, 2); assert.equal(cancelled.settlements.reduce((sum, e) => sum + e.delta, 0), -500);
    });
    await t.test('active/pending unique ticket and reuse leave old cancellation untouched', async () => {
      const current = await Order.create({ ownerId: userId, storeId, requestId: randomUUID(), ticketNumber: '1', items: [], totalAmount: 0, status: 'active' });
      await assert.rejects(() => Order.create({ ownerId: userId, storeId, requestId: randomUUID(), ticketNumber: '1', items: [], totalAmount: 0, status: 'pending' }), e => e.code === 11000);
      assert.equal((await call(tickets.PUT, { orderId: String(current._id), expectedRevision: 0, status: 'completed' })).status, 200);
      assert.equal((await Order.findById(oldId)).status, 'cancelled');
      await Order.create({ ownerId: userId, storeId, requestId: randomUUID(), ticketNumber: '1', items: [], totalAmount: 0, status: 'active' });
      assert.equal((await call(tickets.PUT, { orderId: String(current._id), expectedRevision: 1, status: 'active' })).status, 409);
    });
    await t.test('server quote guarantees price; concurrent new-order retries create one order', async () => {
      const requestId = randomUUID();
      const quoteResponse = await call(quotes.POST, { requestId, items: [{ productId: String(product._id), quantity: 1, detail: '', selectedOptionNames: [] }], note: '見積' });
      assert.equal(quoteResponse.status, 200); assert.equal((await quoteResponse.json()).totalAmount, 800);
      await Product.updateOne({ _id: product._id }, { $set: { price: 1200, isAvailable: false } });
      const payload = { requestId, expectedTotal: 800, paymentMethod: '現金', receivedAmount: 1000 };
      const responses = await Promise.all([call(orders.POST, payload), call(orders.POST, payload)]);
      assert.ok(responses.every(r => [200, 201].includes(r.status)), 'both retries must succeed');
      assert.equal(await Order.countDocuments({ storeId, requestId }), 1);
      const doc = await Order.findOne({ storeId, requestId }); assert.equal(doc.totalAmount, 800); assert.equal(doc.changeAmount, 200);
      const lookup = await orders.GET(new Request('http://localhost/api/orders?requestId=' + requestId)); assert.equal((await lookup.json()).order.requestId, requestId);
      assert.equal((await call(quotes.POST, { requestId: randomUUID(), items: [{ productId: String(product._id), quantity: 1, detail: '', selectedOptionNames: [] }] })).status, 400);
    });
    await t.test('history filters JST day, ticket and status and supplies server aggregate', async () => {
      const response = await orders.GET(new Request('http://localhost/api/orders?date=2026-09-12&ticket=1&status=cancelled'));
      assert.equal(response.status, 200); const data = await response.json(); assert.equal(data.total, 1); assert.equal(data.orders[0]._id, String(oldId));
    });
  } catch (error) {
    if (error?.name?.startsWith('Mongo')) throw new Error('Isolated MongoDB test failed: ' + error.name + ' code=' + (error.code || 'unknown') + ' (connection details suppressed)');
    throw error;
  } finally {
    if (isolated && connection.name === testDbName && /^casher_presentation_test_[a-f0-9]{32}$/.test(connection.name)) {
      // This exact database was verified empty before this run. No configured application DB is dropped.
      await connection.dropDatabase();
    }
    await connection.close();
  }
});
