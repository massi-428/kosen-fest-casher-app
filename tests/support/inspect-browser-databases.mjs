import mongoose from 'mongoose';
import env from '@next/env';
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const connection = mongoose.createConnection(process.env.MONGODB_URI, { autoCreate: false, autoIndex: false, serverSelectionTimeoutMS: 12000 });
try {
  await connection.asPromise();
  const { databases } = await connection.db.admin().listDatabases({ nameOnly: true });
  for (const { name } of databases.filter(d => /^casher_browser_test_[a-f0-9]{32}$/.test(d.name))) {
    const db = connection.useDb(name).db;
    const orders = await db.collection('orders').find({}, { projection: { ownerId: 1, createdAt: 1 } }).toArray();
    console.log(JSON.stringify({ name, orders: orders.length, allFixtureOwned: orders.every(o => o.ownerId === 'browser-test-user'), created: orders.map(o => o.createdAt) }));
  }
} catch (error) { console.log('Test DB inspection failed: ' + error.name); process.exitCode = 1; }
finally { await connection.close(); }
