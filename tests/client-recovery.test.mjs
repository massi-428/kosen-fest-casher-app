import assert from 'node:assert/strict';
import test from 'node:test';
import { createLoader } from './support/load-ts.mjs';
const load = createLoader();
const cart = load('src/lib/cart-draft.ts');
const api = load('src/lib/client-api.ts');
const history = load('src/lib/history-query.ts');
const item = { productId: 'one', productName: '商品', price: 500, quantity: 2, detail: 'メモ', selectedOptions: [{ name: '追加', price: 50 }] };
const draft = { version: 1, userId: 'user-a', storeId: 'store-a', requestId: 'operation-a', items: [item], note: '注文備考', phase: 'editing', quote: null, submission: null };

test('cart preserves notes/options and isolates users and stores', () => {
  assert.deepEqual(cart.parseCartDraft(JSON.stringify(draft), 'user-a', 'store-a'), draft);
  assert.notEqual(cart.cartKey('user-a', 'store-a'), cart.cartKey('user-b', 'store-a'));
  assert.notEqual(cart.cartKey('user-a', 'store-a'), cart.cartKey('user-a', 'store-b'));
  assert.throws(() => cart.parseCartDraft(JSON.stringify(draft), 'user-b', 'store-a'));
});
test('corrupt drafts and unavailable storage fail explicitly rather than crashing rendering', () => {
  assert.throws(() => cart.parseCartDraft('{invalid', 'user-a', 'store-a'));
  assert.throws(() => cart.parseCartDraft(JSON.stringify({ ...draft, items: [{ ...item, quantity: -1 }] }), 'user-a', 'store-a'));
  assert.throws(() => cart.parseCartDraft(JSON.stringify({ ...draft, phase: 'unknown' }), 'user-a', 'store-a'));
  const savedWindow = globalThis.window;
  globalThis.window = { localStorage: { setItem() { throw new Error('storage denied'); } } };
  try { assert.throws(() => cart.writeDraft(draft), /storage denied/); }
  finally { globalThis.window = savedWindow; }
});
test('restored cart identifies catalog deletion, sold-out items, option deletion and changed prices', () => {
  const changes = cart.cartChanges([item], [{ _id: 'one', name: '商品', price: 800, isAvailable: false }], []);
  assert.ok(changes.some(s => s.includes('売り切れ'))); assert.ok(changes.some(s => s.includes('500円 → 800円'))); assert.ok(changes.some(s => s.includes('オプションが削除')));
  assert.ok(cart.cartChanges([item], [], []).some(s => s.includes('商品が削除')));
});
test('unknown registration retains quote, request ID and original tender on reload', () => {
  const pending = { ...draft, phase: 'unknown', quote: { requestId: draft.requestId, totalAmount: 1100, items: [], paymentMethods: ['現金'] }, submission: { paymentMethod: '現金', receivedAmount: 2000 } };
  const restored = cart.parseCartDraft(JSON.stringify(pending), draft.userId, draft.storeId);
  assert.equal(restored.requestId, draft.requestId); assert.equal(restored.phase, 'unknown'); assert.equal(restored.submission.receivedAmount, 2000);
});
test('history date is JST and combines exact ticket and status filters', () => {
  const filter = history.historyQuery(new URLSearchParams('date=2026-09-12&ticket=001&status=pending'), 'store');
  assert.equal(filter.createdAt.$gte.toISOString(), '2026-09-11T15:00:00.000Z'); assert.equal(filter.createdAt.$lt.toISOString(), '2026-09-12T15:00:00.000Z'); assert.equal(filter.ticketNumber, '1'); assert.equal(filter.status, 'pending');
  assert.throws(() => history.historyQuery(new URLSearchParams('date=invalid'), 'store'));
  assert.throws(() => history.historyQuery(new URLSearchParams('date=2026-02-30'), 'store'));
});
test('HTTP 503, network disconnect, timeout and malformed JSON remain errors; retry succeeds', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ message: '取得失敗' }, { status: 503 });
    await assert.rejects(() => api.requestJson('/api/orders'), e => e.status === 503 && e.message === '取得失敗');
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(() => api.requestJson('/api/orders'), /ネットワーク/);
    globalThis.fetch = async () => { throw new DOMException('timeout', 'TimeoutError'); };
    await assert.rejects(() => api.requestJson('/api/orders'), /タイムアウト/);
    globalThis.fetch = async () => new Response('not json');
    await assert.rejects(() => api.requestJson('/api/orders'), /不正な応答/);
    globalThis.fetch = async () => Response.json({ orders: [], total: 0, hourly: [] });
    assert.deepEqual(await api.requestJson('/api/orders'), { orders: [], total: 0, hourly: [] });
  } finally { globalThis.fetch = original; }
});
