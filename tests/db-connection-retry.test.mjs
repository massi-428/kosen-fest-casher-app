import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

test('Atlas connection failure is retryable on the next request', async () => {
  const previousUri = process.env.MONGODB_URI;
  const previousDb = process.env.MONGODB_DB;
  const previousCache = globalThis.mongoose;
  process.env.MONGODB_URI = 'mongodb+srv://example.invalid/';
  process.env.MONGODB_DB = 'atlas-test-db';
  delete globalThis.mongoose;

  let calls = 0;
  let lastOptions;
  const fake = {
    connection: { readyState: 0 },
    connect: async (_uri, options) => {
      calls += 1;
      lastOptions = options;
      if (calls === 1) throw new Error('temporary DNS failure');
      fake.connection.readyState = 1;
      return fake;
    },
  };

  try {
    const connect = createLoader({ mongoose: fake })('src/lib/db.ts').default;
    await assert.rejects(connect, /temporary DNS failure/);
    assert.equal(await connect(), fake);
    assert.equal(await connect(), fake);
    assert.equal(calls, 2, 'successful connection should remain cached');
    assert.equal(lastOptions.dbName, 'atlas-test-db');
    assert.equal(lastOptions.bufferCommands, false);
    assert.equal(lastOptions.serverSelectionTimeoutMS, 15000);
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    if (previousDb === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = previousDb;
    if (previousCache === undefined) delete globalThis.mongoose; else globalThis.mongoose = previousCache;
  }
});
