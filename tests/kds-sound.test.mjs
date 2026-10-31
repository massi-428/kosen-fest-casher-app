import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createLoader } from './support/load-ts.mjs';
const { selectKitchenSound, createKitchenOrderTracker, KDS_SOUNDS } = createLoader()('src/lib/kds-sound.ts');

test('sound lottery allocates 98%, 1%, 1% and all assets exist', () => {
  const counts = [0, 0, 0];
  for (let i = 0; i < 10000; i++) counts[KDS_SOUNDS.indexOf(selectKitchenSound(i / 10000))]++;
  assert.deepEqual(counts, [9800, 100, 100]);
  for (const path of KDS_SOUNDS) assert.ok(existsSync('public' + path));
});

test('only new orders notify: initial load, repeated polling and restored old orders stay quiet', () => {
  const track = createKitchenOrderTracker();
  const order = (id, time) => ({ _id: id, createdAt: new Date(time).toISOString() });
  const old = order('old', 500);
  const first = order('new', 1100);
  const second = order('new2', 1200);
  assert.deepEqual(track([old], 1000), []);
  assert.deepEqual(track([old, first, second]), [first, second]);
  assert.deepEqual(track([old, first, second]), []);
  assert.deepEqual(track([]), []);
  assert.deepEqual(track([old, first, order('restored', 900)]), []);
});
