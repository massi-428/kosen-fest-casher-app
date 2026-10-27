import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

test('Atlas connection failure backs off concurrent retries then recovers', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const previousUri = process.env.MONGODB_URI;
  const previousDb = process.env.MONGODB_DB;
  const previousVercel = process.env.VERCEL;
  const previousCache = globalThis.mongoose;
  process.env.MONGODB_URI = 'mongodb+srv://example.invalid/';
  process.env.MONGODB_DB = 'atlas-test-db';
  delete process.env.VERCEL;
  delete globalThis.mongoose;

  let calls = 0;
  let lastOptions;
  const fake = {
    connection: { readyState: 0, getClient: () => undefined },
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
    const rejected = await Promise.allSettled(Array.from({ length: 20 }, () => connect()));
    assert.ok(rejected.every(result => result.status === 'rejected'));
    assert.equal(calls, 1, 'cooldown must prevent a connection storm');
    now += 1000;
    assert.equal(await connect(), fake);
    assert.equal(await connect(), fake);
    assert.equal(calls, 2, 'successful connection should remain cached');
    assert.equal(lastOptions.dbName, 'atlas-test-db');
    assert.equal(lastOptions.bufferCommands, false);
    assert.equal(lastOptions.serverSelectionTimeoutMS, 15000);
    assert.equal(lastOptions.maxPoolSize, 5);
    assert.equal(lastOptions.minPoolSize, 0);
    assert.equal(lastOptions.maxIdleTimeMS, 10000);
    assert.equal(lastOptions.maxConnecting, 1);
    assert.equal(lastOptions.waitQueueTimeoutMS, 5000);
    assert.equal(lastOptions.connectTimeoutMS, 10000);
    assert.equal(globalThis.mongoose.failures, 0);
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    if (previousDb === undefined) delete process.env.MONGODB_DB; else process.env.MONGODB_DB = previousDb;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousCache === undefined) delete globalThis.mongoose; else globalThis.mongoose = previousCache;
  }
});

test('replacement waits for old client cleanup, including concurrent recovery and failed retries', async (t) => {
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const previousUri = process.env.MONGODB_URI;
  const previousVercel = process.env.VERCEL;
  const previousCache = globalThis.mongoose;
  process.env.MONGODB_URI = 'mongodb://example.invalid/test';
  delete process.env.VERCEL;
  delete globalThis.mongoose;
  const clients = [];
  const liveClients = new Set();
  let currentClient;
  let connectCalls = 0;
  let failConnect = false;
  let finishClose;
  let closeAttempts = 0;
  let mongooseCloseCalled = false;
  const fake = {
    connection: {
      readyState: 0,
      getClient: () => currentClient,
      close: async () => {
        mongooseCloseCalled = true;
        fake.connection.readyState = 0;
      },
    },
    connect: async () => {
      // Mongoose short-circuits openUri if recovery changed the state to connected.
      if (fake.connection.readyState === 1) return fake;
      assert.equal(liveClients.size, 0, 'old monitoring client must be closed before replacement');
      connectCalls++;
      const client = { close: async () => { liveClients.delete(client); } };
      currentClient = client;
      clients.push(client);
      liveClients.add(client);
      if (failConnect) throw new Error('reconnect failed');
      fake.connection.readyState = 1;
      return fake;
    },
  };
  try {
    const connect = createLoader({ mongoose: fake })('src/lib/db.ts').default;
    await connect();
    const original = currentClient;
    original.close = () => {
      closeAttempts++;
      return new Promise(resolve => { finishClose = () => { liveClients.delete(original); resolve(); }; });
    };
    fake.connection.readyState = 0;
    const requests = Array.from({ length: 20 }, () => connect());
    assert.equal(closeAttempts, 1, 'cleanup is shared by all requests');
    assert.equal(connectCalls, 1, 'no replacement while cleanup is pending');
    // The old client's monitoring may report recovery while cleanup is pending.
    fake.connection.readyState = 1;
    const recoveredRequest = connect();
    finishClose();
    await Promise.all([...requests, recoveredRequest]);
    assert.equal(mongooseCloseCalled, true);
    assert.equal(connectCalls, 2);
    assert.equal(liveClients.size, 1);

    const second = currentClient;
    let failClose = true;
    second.close = async () => {
      if (failClose) throw new Error('cleanup failed');
      liveClients.delete(second);
    };
    fake.connection.readyState = 0;
    const failures = await Promise.allSettled(Array.from({ length: 20 }, () => connect()));
    assert.ok(failures.every(result => result.status === 'rejected' && result.reason.message === 'cleanup failed'));
    assert.equal(connectCalls, 2, 'failed cleanup must not create a new client');
    assert.equal(globalThis.mongoose.promise, null);

    failClose = false;
    failConnect = true;
    now += 1000;
    await assert.rejects(connect, /reconnect failed/);
    assert.equal(connectCalls, 3);
    assert.equal(globalThis.mongoose.promise, null);
    assert.equal(globalThis.mongoose.conn, null);
    failConnect = false;
    now += 2000;
    await connect();
    assert.equal(connectCalls, 4);
    assert.equal(liveClients.size, 1, 'failed connection client must also be cleaned up');
    assert.ok(clients.slice(0, -1).every(client => !liveClients.has(client)));
    await connect();
    assert.equal(connectCalls, 4, 'healthy connections are reused');
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousCache === undefined) delete globalThis.mongoose; else globalThis.mongoose = previousCache;
  }
});

test('concurrent requests share a pending connection and attach the Vercel hook once per client', async () => {
  const previousUri = process.env.MONGODB_URI;
  const previousVercel = process.env.VERCEL;
  const previousCache = globalThis.mongoose;
  process.env.MONGODB_URI = 'mongodb://example.invalid/test';
  process.env.VERCEL = '1';
  delete globalThis.mongoose;
  let calls = 0;
  let resolveConnection;
  let client;
  const attached = [];
  const fake = {
    connection: { readyState: 0, getClient: () => client, close: async () => { fake.connection.readyState = 0; } },
    connect: () => {
      calls++;
      client ??= { close: async () => {} };
      return new Promise(resolve => { resolveConnection = () => { fake.connection.readyState = 1; resolve(fake); }; });
    },
  };
  try {
    const connect = createLoader({ mongoose: fake, '@vercel/functions': { attachDatabasePool: value => attached.push(value) } })('src/lib/db.ts').default;
    const requests = Array.from({ length: 20 }, () => connect());
    assert.equal(calls, 1, 'disconnected state must not discard an in-flight promise');
    resolveConnection();
    await Promise.all(requests);
    await connect();
    assert.deepEqual(attached, [client]);

    fake.connection.readyState = 0;
    const reconnect = connect();
    const concurrent = connect();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 2);
    resolveConnection();
    await Promise.all([reconnect, concurrent]);
    assert.equal(attached.length, 1, 'same client must not get duplicate listeners');

    fake.connection.readyState = 0;
    client = { close: async () => {} };
    const replacement = connect();
    await new Promise(resolve => setImmediate(resolve));
    resolveConnection();
    await replacement;
    assert.equal(attached.length, 2);
    assert.equal(attached[1], client);
  } finally {
    if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
    if (previousCache === undefined) delete globalThis.mongoose; else globalThis.mongoose = previousCache;
  }
});
