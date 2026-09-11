import mongoose from 'mongoose';
import env from '@next/env';
import { randomUUID } from 'node:crypto';
import { createLoader } from './load-ts.mjs';

export async function createBrowserDatabase() {
  env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  if (!process.env.MONGODB_URI) throw new Error('DB configuration missing');
  const name = 'casher_browser_test_' + randomUUID().replaceAll('-', '');
  const connection = mongoose.createConnection(process.env.MONGODB_URI, { dbName: name, autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 12000 });
  await connection.asPromise();
  if (connection.name !== name || (await connection.db.listCollections().toArray()).length !== 0) { await connection.close(); throw new Error('Test database isolation check failed'); }
  const storeId = new mongoose.Types.ObjectId().toString();
  const userId = 'browser-test-user';
  const context = request => request.headers.get('x-fixture-account') === 'b' ? { userId: userId + '-b', storeId: storeId + '-b' } : { userId, storeId };
  const load = createLoader({ mongoose: { ...mongoose, models: connection.models, model: (key, schema, collection) => connection.model(key, schema, collection) }, '@/lib/db': async () => {}, '@/lib/store': { getActiveStoreContext: async request => context(request) }, '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) }, '@/lib/systemSettings': { getCancelPassword: async () => 'test-only' } });
  const Order = load('src/models/Order.ts').default;
  const Product = load('src/models/Product.ts').default;
  const Setting = load('src/models/Setting.ts').default;
  const Quote = load('src/models/CheckoutQuote.ts').default;
  const Counter = load('src/models/TicketCounter.ts').default;
  for (const Model of [Order, Product, Setting, Quote, Counter]) { if (Model.db.name !== name) throw new Error('Model isolation check failed'); await Model.createCollection(); await Model.createIndexes(); }
  await Setting.create({ ownerId: userId, storeId, key: 'app_config', cashCalculationEnabled: true, cashPaymentMethod: '現金', paymentMethods: ['現金', 'カード'], customizations: [{ name: 'ミルク', price: 50 }] });
  const product = await Product.create({ ownerId: userId, storeId, name: 'コーヒー', price: 800, isAvailable: true });
  const items = [{ productId: String(product._id), productName: product.name, quantity: 1, amount: 500, detail: '商品メモの確認', selectedOptions: [] }];
  await Order.create({ ownerId: userId, storeId, requestId: randomUUID(), ticketNumber: '1', items, totalAmount: 500, paymentMethod: '現金', receivedAmount: 1000, changeAmount: 500, note: 'テスト用の注文備考', status: 'active' });
  await Order.collection.insertOne({ ownerId: userId, storeId, requestId: randomUUID(), ticketNumber: '1', items, totalAmount: 500, status: 'cancelled', createdAt: new Date(Date.now() - 86400000), cancelledAt: new Date(Date.now() - 86000000) });
  const routes = Object.fromEntries(['orders', 'tickets', 'settlements', 'order-quotes', 'report'].map(route => ['/api/' + route, load('src/app/api/' + route + '/route.ts')]));
  return {
    async handle(request) {
      const pathname = new URL(request.url).pathname;
      const ctx = context(request);
      if (pathname === '/api/me') return Response.json({ authenticated: true, userId: ctx.userId, activeStoreId: ctx.storeId });
      if (pathname === '/api/products' && request.method === 'GET') return Response.json(await Product.find({ storeId: ctx.storeId }));
      if (pathname === '/api/settings' && request.method === 'GET') return Response.json(await Setting.findOne({ storeId: ctx.storeId }) || {});
      if (pathname === '/api/wait-time') return Response.json({ estimatedWaitLabel: '約5分', isEstimateReliable: false });
      if (pathname === '/fixture/price' && request.method === 'POST') { await Product.updateOne({ _id: product._id }, { $inc: { price: 100 } }); return Response.json({ changed: true }); }
      const handler = routes[pathname]?.[request.method];
      return handler ? handler(request) : Response.json({ message: 'テスト環境の未対応APIです。' }, { status: 404 });
    },
    async close() {
      if (connection.name === name && /^casher_browser_test_[a-f0-9]{32}$/.test(name)) await connection.dropDatabase();
      await connection.close();
      console.log('Isolated browser test database cleaned up');
    },
  };
}
