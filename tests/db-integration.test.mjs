import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

const shouldRun = process.env.RUN_DB_TESTS === '1' && Boolean(process.env.MONGODB_URI);
const uniqueDbName = `rootine_integration_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const withDatabaseName = (uri, dbName) => {
  const parsed = new URL(uri);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const skipReason = 'Set RUN_DB_TESTS=1 and MONGODB_URI to run MongoDB integration tests';

test('MongoDB integration: store-scoped data is isolated by storeId', { skip: shouldRun ? false : skipReason }, async () => {
  const uri = withDatabaseName(process.env.MONGODB_URI, uniqueDbName);
  await mongoose.connect(uri, { bufferCommands: false });

  try {
    const db = mongoose.connection.db;
    assert.ok(db, 'database connection should be available');

    const stores = db.collection('stores');
    const orders = db.collection('orders');
    const products = db.collection('products');
    const settings = db.collection('settings');

    const storeA = new mongoose.Types.ObjectId().toString();
    const storeB = new mongoose.Types.ObjectId().toString();

    await stores.insertMany([
      { _id: new mongoose.Types.ObjectId(storeA), name: 'Store A', ownerUserId: 'user-a', memberUserIds: ['user-a'] },
      { _id: new mongoose.Types.ObjectId(storeB), name: 'Store B', ownerUserId: 'user-b', memberUserIds: ['user-b'] },
    ]);

    await orders.insertMany([
      { ownerId: 'user-a', storeId: storeA, ticketNumber: '1', items: [], totalAmount: 100, status: 'active' },
      { ownerId: 'user-b', storeId: storeB, ticketNumber: '2', items: [], totalAmount: 200, status: 'active' },
    ]);
    await products.insertMany([
      { ownerId: 'user-a', storeId: storeA, name: 'Coffee', price: 450 },
      { ownerId: 'user-b', storeId: storeB, name: 'Tea', price: 400 },
    ]);
    await settings.insertMany([
      { ownerId: 'user-a', storeId: storeA, key: 'app_config', paymentMethods: ['Cash'] },
      { ownerId: 'user-b', storeId: storeB, key: 'app_config', paymentMethods: ['Card'] },
    ]);

    assert.equal(await orders.countDocuments({ storeId: storeA }), 1);
    assert.equal(await orders.countDocuments({ storeId: storeB }), 1);
    assert.equal((await orders.findOne({ storeId: storeA })).ticketNumber, '1');
    assert.equal((await products.findOne({ storeId: storeA })).name, 'Coffee');
    assert.deepEqual((await settings.findOne({ storeId: storeB })).paymentMethods, ['Card']);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('MongoDB integration: duplicate stores can be consolidated into the oldest store', { skip: shouldRun ? false : skipReason }, async () => {
  const uri = withDatabaseName(process.env.MONGODB_URI, `${uniqueDbName}_cleanup`);
  await mongoose.connect(uri, { bufferCommands: false });

  try {
    const db = mongoose.connection.db;
    assert.ok(db, 'database connection should be available');

    const stores = db.collection('stores');
    const users = db.collection('accounts');
    const orders = db.collection('orders');
    const products = db.collection('products');
    const settings = db.collection('settings');

    const keepStoreId = new mongoose.Types.ObjectId().toString();
    const duplicateStoreId = new mongoose.Types.ObjectId().toString();

    await users.insertOne({ userId: 'shop-1', password: 'hashed', storeIds: [keepStoreId, duplicateStoreId], activeStoreId: duplicateStoreId });
    await stores.insertMany([
      { _id: new mongoose.Types.ObjectId(keepStoreId), name: 'Old Store', ownerUserId: 'shop-1', memberUserIds: ['shop-1'], createdAt: new Date('2026-01-01') },
      { _id: new mongoose.Types.ObjectId(duplicateStoreId), name: 'Duplicate Store', ownerUserId: 'shop-1', memberUserIds: ['shop-1'], createdAt: new Date('2026-02-01') },
    ]);
    await orders.insertOne({ ownerId: 'shop-1', storeId: duplicateStoreId, ticketNumber: '9', items: [], totalAmount: 900, status: 'active' });
    await products.insertOne({ ownerId: 'shop-1', storeId: duplicateStoreId, name: 'Cake', price: 500 });
    await settings.insertOne({ ownerId: 'shop-1', storeId: duplicateStoreId, key: 'app_config' });

    await Promise.all([
      orders.updateMany({ storeId: duplicateStoreId }, { $set: { storeId: keepStoreId, ownerId: 'shop-1' } }),
      products.updateMany({ storeId: duplicateStoreId }, { $set: { storeId: keepStoreId, ownerId: 'shop-1' } }),
      settings.updateMany({ storeId: duplicateStoreId }, { $set: { storeId: keepStoreId, ownerId: 'shop-1' } }),
    ]);
    await stores.deleteMany({ _id: { $in: [new mongoose.Types.ObjectId(duplicateStoreId)] } });
    await users.updateOne({ userId: 'shop-1' }, { $set: { storeIds: [keepStoreId], activeStoreId: keepStoreId } });

    assert.equal(await stores.countDocuments({ ownerUserId: 'shop-1' }), 1);
    assert.equal(await orders.countDocuments({ storeId: keepStoreId }), 1);
    assert.equal(await products.countDocuments({ storeId: keepStoreId }), 1);
    assert.equal(await settings.countDocuments({ storeId: keepStoreId }), 1);
    assert.deepEqual((await users.findOne({ userId: 'shop-1' })).storeIds, [keepStoreId]);
    assert.equal((await users.findOne({ userId: 'shop-1' })).activeStoreId, keepStoreId);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});