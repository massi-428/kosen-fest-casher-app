import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './support/load-ts.mjs';
const { settlementCopy } = createLoader()('src/lib/settlement-copy.ts');

test('cancellation instructions distinguish leaving an order unchanged from completing cancellation', () => {
  const cancelled = { kind: 'cancel', delta: -500 };
  const prepared = settlementCopy({ ...cancelled, phase: 'prepared' });
  assert.match(prepared.heading, /まだ注文はキャンセルされていません/);
  assert.equal(prepared.next, '返金の手続きへ進む');
  const aborted = settlementCopy({ ...cancelled, phase: 'aborted' });
  assert.match(aborted.description, /注文は元のまま残っています/);
  const completed = settlementCopy({ ...cancelled, phase: 'completed' });
  assert.match(completed.description, /履歴には「キャンセル済み」として残ります/);
});

test('resuming payment explains how to avoid paying twice and zero-value orders need no refund', () => {
  const handling = settlementCopy({ kind: 'cancel', phase: 'handling', delta: -500 });
  assert.match(handling.description, /担当者に完了したか確認/);
  assert.match(handling.description, /もう一度お金をやり取りせず/);
  const free = settlementCopy({ kind: 'cancel', phase: 'prepared', delta: 0 });
  assert.match(free.description, /お金のやり取りは不要/);
  assert.equal(free.next, '注文のキャンセルを確定する');
  const edit = settlementCopy({ kind: 'edit', phase: 'prepared', delta: 500 });
  assert.equal(edit.next, '追加のお支払いの手続きへ進む');
});
