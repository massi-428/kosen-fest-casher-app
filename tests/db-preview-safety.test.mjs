import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const savedEnvironments = new WeakMap();
function setEnv(t, name, value) {
  if (!savedEnvironments.has(t)) savedEnvironments.set(t, new Set());
  const saved = savedEnvironments.get(t);
  if (!saved.has(name)) {
    const previous = process.env[name];
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
    saved.add(name);
  }
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test('missing DB configuration permits imports and rejects connection without touching the driver', async t => {
  const oldCache = globalThis.mongoose;
  t.after(() => { if (oldCache === undefined) delete globalThis.mongoose; else globalThis.mongoose = oldCache; });
  delete globalThis.mongoose;
  setEnv(t, 'MONGODB_URI', undefined);
  const fake = { connect: () => assert.fail('must not connect'), connection: { getClient: () => assert.fail('must not touch client') } };
  const load = createLoader({ mongoose: fake });
  const connect = load('src/lib/db.ts').default;
  await assert.rejects(connect(), /環境変数 MONGODB_URI が定義されていません/);
  assert.equal(globalThis.mongoose.promise, null);
  setEnv(t, 'MONGODB_URI', '   ');
  await assert.rejects(connect(), /MONGODB_URI/);

  const products = createLoader({
    '@/lib/db': connect,
    '@/models/Product': {}, '@/models/Store': {},
    '@/lib/auth': {}, '@/lib/store': {},
  })('src/app/api/products/route.ts');
  const response = await products.GET(new Request('http://localhost/api/products'));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { message: '商品情報の取得に失敗しました' });
});

test('debug reset is denied before DB/auth/deletion outside local development', async t => {
  const fail = () => assert.fail('blocked requests must not touch DB, auth, or orders');
  const route = createLoader({
    '@/lib/db': fail, '@/lib/store': { getActiveStoreContext: fail },
    '@/models/Order': { deleteMany: fail }, '@/lib/auth': {},
  })('src/app/api/debug/reset/route.ts');
  for (const [nodeEnv, vercel, vercelEnv] of [
    ['production', undefined, undefined], ['production', '1', 'production'],
    ['production', '1', 'preview'], ['development', '1', 'preview'],
    ['development', undefined, 'preview'], ['development', '1', undefined],
    ['test', undefined, undefined], [undefined, undefined, undefined],
  ]) {
    setEnv(t, 'NODE_ENV', nodeEnv);
    setEnv(t, 'VERCEL', vercel);
    setEnv(t, 'VERCEL_ENV', vercelEnv);
    assert.equal((await route.DELETE(new Request('http://localhost/api/debug/reset', { method: 'DELETE' }))).status, 404);
  }
});

test('local reset retains authentication, store scope, and connection failure handling', async t => {
  setEnv(t, 'NODE_ENV', 'development');
  setEnv(t, 'VERCEL', undefined);
  setEnv(t, 'VERCEL_ENV', undefined);
  let context = null;
  let failure = false;
  const deleted = [];
  const route = createLoader({
    '@/lib/db': async () => { if (failure) throw new Error('connection failed'); },
    '@/lib/store': { getActiveStoreContext: async () => context },
    '@/models/Order': { deleteMany: async filter => deleted.push(filter) },
    '@/lib/auth': { unauthorizedResponse: () => Response.json({}, { status: 401 }) },
  })('src/app/api/debug/reset/route.ts');
  const request = new Request('http://localhost/api/debug/reset', { method: 'DELETE' });
  assert.equal((await route.DELETE(request)).status, 401);
  assert.equal(deleted.length, 0);
  context = { storeId: 'local-store' };
  assert.equal((await route.DELETE(request)).status, 200);
  assert.deepEqual(deleted, [{ storeId: 'local-store' }]);
  failure = true;
  assert.equal((await route.DELETE(request)).status, 500);
  assert.equal(deleted.length, 1);
});
