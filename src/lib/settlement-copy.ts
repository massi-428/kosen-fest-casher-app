import type { SettlementOperation } from './settlement-types';

// Keep the next action and its effect together throughout the payment flow.
export function settlementCopy(operation: Pick<SettlementOperation, 'kind' | 'phase' | 'delta'>, startedHere = false) {
  const cancel = operation.kind === 'cancel';
  const refund = operation.delta < 0;
  const money = refund ? '返金' : '追加のお支払い';
  const complete = cancel ? '注文のキャンセルを確定する' : '注文の変更を確定する';
  const title = cancel ? '注文をキャンセルする' : '注文内容を変更する';
  if (operation.phase === 'completed') return { title, step: 3, heading: cancel ? '注文をキャンセルしました' : '注文内容を変更しました', description: cancel ? '調理中の一覧と売上集計から除外しました。注文履歴には「キャンセル済み」として残ります。' : '変更した内容と金額を保存しました。注文履歴で確認できます。', next: complete };
  if (operation.phase === 'aborted') return { title, step: 0, heading: cancel ? 'キャンセルの手続きをやめました' : '変更の手続きをやめました', description: '注文は元のまま残っています。注文内容や売上は変わっていません。', next: complete };
  if (operation.delta === 0) return { title, step: 2, heading: '内容を確認して確定してください', description: `お金のやり取りは不要です。「${complete}」を押すと完了します。`, next: complete };
  if (operation.phase === 'handling') return { title, step: 2, heading: `${money}が済んだら、下のチェックを入れて確定してください`, description: startedHere ? `${money}を一度だけ行ってください。すでに済んでいる場合は繰り返さないでください。カード・電子決済は、このアプリでは返金や支払いを実行しません。決済端末などで手続きしてください。` : `${money}の手続きは開始済みです。担当者に完了したか確認してください。済んでいる場合は、もう一度お金をやり取りせず、下のチェックを入れて確定してください。`, next: complete };
  return { title, step: 1, heading: cancel ? 'まだ注文はキャンセルされていません' : 'まだ注文内容は変更されていません', description: `金額を確認し、「${money}の手続きへ進む」を押してください。${money}が済んだら、次の画面で確定すると完了します。`, next: `${money}の手続きへ進む` };
}
