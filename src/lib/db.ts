import mongoose from 'mongoose';
import { attachDatabasePool } from '@vercel/functions';

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  attachedClients?: WeakSet<object>;
  failures?: number;
  retryAfter?: number;
};

const globalWithMongoose = global as typeof globalThis & {
  mongoose?: MongooseCache;
};

let cached = globalWithMongoose.mongoose;

if (!cached) {
  cached = globalWithMongoose.mongoose = { conn: null, promise: null };
}
const mongooseCache = cached;

async function connectToDatabase() {
  // Validate on use so builds and route imports do not require database secrets.
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri?.trim()) {
    throw new Error('環境変数 MONGODB_URI が定義されていません。');
  }

  // Initial connection and reconnect attempts must be shared, even while disconnected.
  if (mongooseCache.promise) return mongooseCache.promise;

  if (mongooseCache.conn && mongoose.connection.readyState === 1) {
    return mongooseCache.conn;
  }

  if (Date.now() < (mongooseCache.retryAfter ?? 0)) {
    throw new Error('データベース接続の再試行を待っています。少し待って再取得してください。');
  }

  mongooseCache.conn = null;

  if (!mongooseCache.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 10000,
      waitQueueTimeoutMS: 5000,
      maxConnecting: 1,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 10000,
      ...(process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {}),
    };
    mongooseCache.promise = (async () => {
      // readyState=0 can mean a temporary outage: the old client may still be
      // monitoring servers. Close it before Mongoose replaces it with a new one.
      // Include cleanup in the shared promise, and do not reconnect if it fails.
      const previousClient = mongoose.connection.getClient();
      if (previousClient) {
        await previousClient.close();
        // Also reset Mongoose's state, including recovery during client.close().
        // Closing the client directly first makes failed cleanup retryable even
        // when Mongoose has already marked its own close operation as called.
        await mongoose.connection.close();
      }

      const connection = await mongoose.connect(mongodbUri, opts);
      // Register once per client, not once per request. Local development needs no hook.
      if (process.env.VERCEL === '1') {
        const client = connection.connection.getClient();
        const attached = mongooseCache.attachedClients ??= new WeakSet<object>();
        if (!attached.has(client)) {
          attachDatabasePool(client);
          attached.add(client);
        }
      }
      mongooseCache.conn = connection;
      mongooseCache.failures = 0;
      mongooseCache.retryAfter = 0;
      return connection;
    })().catch(error => {
      const failures = Math.min((mongooseCache.failures ?? 0) + 1, 6);
      mongooseCache.failures = failures;
      mongooseCache.retryAfter = Date.now() + Math.min(30000, 1000 * 2 ** (failures - 1));
      throw error;
    }).finally(() => {
      mongooseCache.promise = null;
    });
  }
  return mongooseCache.promise;
}

export default connectToDatabase;
