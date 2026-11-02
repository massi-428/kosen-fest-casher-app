import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';

const { summarizeSalesByPayment } = createLoader()('src/lib/payment-sales.ts');
const item = (productName, quantity, amount) => ({ productName, quantity, amount });
const sale = (paymentMethod, items, status = 'completed') => ({ paymentMethod, items, status, totalAmount: items.reduce((sum, row) => sum + row.amount, 0) });

test('payment totals include quantities across orders and option variants, separately for each method', () => {
  const rows = summarizeSalesByPayment([
    sale('現金', [item('コーヒー', 2, 600), item('コーヒー', 1, 350), item('お茶', 1, 200)], 'active'),
    sale('現金', [item('コーヒー', 3, 900)], 'pending'),
    sale('PayPay', [item('お茶', 4, 800), item('コーヒー', 1, 300)]),
    sale('現金', [item('コーヒー', 100, 30000)], 'cancelled'),
  ]);
  assert.deepEqual(rows, [
    { name: '現金', count: 2, quantity: 7, amount: 2050, products: [
      { name: 'コーヒー', quantity: 6, amount: 1850 }, { name: 'お茶', quantity: 1, amount: 200 },
    ] },
    { name: 'PayPay', count: 1, quantity: 5, amount: 1100, products: [
      { name: 'お茶', quantity: 4, amount: 800 }, { name: 'コーヒー', quantity: 1, amount: 300 },
    ] },
  ]);
});

test('changed orders use final items once; settlement records are not counted as additional sales', () => {
  const order = { ...sale('現金', [item('お茶', 2, 400)]), settlements: [{ delta: -200, paymentMethod: '現金' }] };
  const [result] = summarizeSalesByPayment([order]);
  assert.equal(result.quantity, 2);
  assert.equal(result.amount, 400);
  assert.equal(result.count, 1);
});

test('missing payment names, free items and special names remain countable; empty days remain empty', () => {
  const rows = summarizeSalesByPayment([
    sale(undefined, [item('__proto__', 2, 0)]),
    sale('', [item('__proto__', 1, 0)]),
    sale('constructor', [item('toString', 1, 100)]),
  ]);
  assert.equal(rows.find(row => row.name === '未設定').quantity, 3);
  assert.equal(rows.find(row => row.name === '未設定').products[0].quantity, 3);
  assert.equal(rows.find(row => row.name === 'constructor').amount, 100);
  assert.deepEqual(summarizeSalesByPayment([]), []);
  assert.deepEqual(summarizeSalesByPayment([sale('現金', [item('お茶', 1, 200)], 'cancelled')]), []);
});
