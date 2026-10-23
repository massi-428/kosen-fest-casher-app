import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';

const { summarizeKitchenOrders, wrapKitchenText } = createLoader()('src/lib/kds-display.ts');

test('kitchen totals count quantities across all orders and separate pending from active', () => {
  const orders = Array.from({ length: 7 }, () => ({ status: 'active', items: [{ productId: 'a', productName: 'たこ焼き', quantity: 2 }] }));
  orders.push({ status: 'pending', items: [{ productId: 'a', productName: 'たこ焼き', quantity: 3 }] });
  orders.push({ status: 'completed', items: [{ productId: 'a', productName: 'たこ焼き', quantity: 100 }] });
  orders.push({ status: 'cancelled', items: [{ productId: 'a', productName: 'たこ焼き', quantity: 100 }] });
  assert.deepEqual(summarizeKitchenOrders(orders), [{ key: 'a', name: 'たこ焼き', active: 14, pending: 3 }]);
});

test('different products with the same name remain separate; legacy product names aggregate', () => {
  assert.deepEqual(summarizeKitchenOrders([{ status: 'active', items: [
    { productId: 'a', productName: 'ドリンク', quantity: 1 },
    { productId: 'b', productName: 'ドリンク', quantity: 2 },
    { productName: 'ポテト', quantity: 3 }, { productName: 'ポテト', quantity: 4 },
  ] }]).map(row => row.active), [1, 2, 7]);
});

test('long Japanese notes and emoji remain intact across compact content pages', () => {
  const text = 'たこ焼き🍴ネギ抜きソース少なめ'.repeat(30);
  const lines = wrapKitchenText(text, 12);
  assert.equal(lines.join(''), text);
  assert.ok(lines.every(line => Array.from(line).length <= 12));
  assert.deepEqual(wrapKitchenText('a\n\nb', 0), ['a', '', 'b']);
});
