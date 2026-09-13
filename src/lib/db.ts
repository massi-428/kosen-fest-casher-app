import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('環境変数 MONGODB_URI が定義されていません。');
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
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
  if (mongooseCache.conn && mongoose.connection.readyState === 1) {
    return mongooseCache.conn;
  }

  // Atlasの一時的なDNS・ネットワーク切断後は、解決済み／失敗済みの
  // Promiseを使い回さず、次のAPIリクエストで接続を作り直す。
  if (mongooseCache.conn || (mongooseCache.promise && mongoose.connection.readyState === 0)) {
    mongooseCache.conn = null;
    mongooseCache.promise = null;
  }

  if (!mongooseCache.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 10,
      minPoolSize: 0,
      ...(process.env.MONGODB_DB ? { dbName: process.env.MONGODB_DB } : {}),
    };
    mongooseCache.promise = mongoose.connect(MONGODB_URI!, opts).catch((error) => {
      mongooseCache.promise = null;
      throw error;
    });
  }
  mongooseCache.conn = await mongooseCache.promise;
  return mongooseCache.conn;
}

export default connectToDatabase;
