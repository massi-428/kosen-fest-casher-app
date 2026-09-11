import mongoose from 'mongoose';
import env from '@next/env';
env.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const uri = process.env.MONGODB_URI;
if (!uri) { console.log('DB configuration: missing'); process.exitCode = 1; }
else {
  const connection = mongoose.createConnection(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 12000 });
  try {
    await connection.asPromise();
    await connection.db.command({ ping: 1 });
    console.log('DB read-only connection: OK; model auto-create and index writes disabled');
    const indexes = await connection.db.collection('orders').indexes();
    console.log(JSON.stringify({ orderIndexes: indexes.map(({ key, unique, partialFilterExpression }) => ({ key, unique: !!unique, partialFilterExpression })) }));
  } catch (error) {
    const message = String(error?.message || '');
    console.log(JSON.stringify({ connected: false, category: /ENOTFOUND|EAI_AGAIN|querySrv|ECONNREFUSED|ETIMEDOUT|selection timed out/i.test(message) ? 'network-or-server-selection' : /auth/i.test(message) ? 'authentication' : 'database-error', name: error?.name, code: error?.code }));
    process.exitCode = 1;
  } finally { await connection.close().catch(() => {}); }
}
