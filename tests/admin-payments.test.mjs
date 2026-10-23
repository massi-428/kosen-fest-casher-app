import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const storeId = '111111111111111111111111';
const request = (body) => new Request(`http://localhost/api/admin/payment-methods?storeId=${storeId}`, body === undefined ? {} : {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

function fixture(admin = true) {
  const saved = { paymentMethods: ['現金', 'PayPay'], cancelPassword: 'keep', cashCalculationEnabled: true };
  const api = createLoader({
    '@/lib/db': async () => {},
    '@/lib/authorization': { isAdminRequest: async () => admin },
    '@/lib/store': { migrateLegacyOwnerDataToStore: async () => {} },
    '@/models/Store': { findById: async id => {
      assert.ok(admin);
      assert.equal(id, storeId);
      return { ownerUserId: 'owner' };
    } },
    '@/models/Setting': {
      findOne: async filter => {
        assert.deepEqual(filter, { storeId, key: 'app_config' });
        return saved;
      },
      findOneAndUpdate: async (filter, update) => {
        assert.deepEqual(filter, { storeId, key: 'app_config' });
        Object.assign(saved, update.$set);
        return saved;
      },
    },
  })('src/app/api/admin/payment-methods/route.ts');
  return { api, saved };
}

test('admin can read saved payment methods and save changes without changing other settings', async () => {
  const { api, saved } = fixture();
  assert.deepEqual(await (await api.GET(request())).json(), { paymentMethods: ['現金', 'PayPay'] });
  const res = await api.POST(request({ paymentMethods: [' 現金 ', 'd払い', 'd払い'] }));
  assert.equal(res.status, 200);
  assert.deepEqual(await (await api.GET(request())).json(), { paymentMethods: ['現金', 'd払い'] });
  assert.equal(saved.cancelPassword, 'keep');
  assert.equal(saved.cashCalculationEnabled, true);
});

test('non-admin cannot read or save store payment methods', async () => {
  const { api } = fixture(false);
  assert.equal((await api.GET(request())).status, 403);
  assert.equal((await api.POST(request({ paymentMethods: ['現金'] }))).status, 403);
});

test('invalid payment methods are rejected and an empty list persists', async () => {
  const { api, saved } = fixture();
  assert.equal((await api.POST(request({ paymentMethods: [' '] }))).status, 400);
  assert.deepEqual(saved.paymentMethods, ['現金', 'PayPay']);
  assert.equal((await api.POST(request({ paymentMethods: [] }))).status, 200);
  assert.deepEqual(await (await api.GET(request())).json(), { paymentMethods: [] });
});
