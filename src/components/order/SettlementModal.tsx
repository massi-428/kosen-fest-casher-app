"use client";
import { useRef, useState } from 'react';
import { BaseModal } from '@/components/BaseModal';
import type { SettlementOperation } from '@/lib/settlement-types';
import { postJson, requestJson } from '@/lib/client-api';
import { settlementCopy } from '@/lib/settlement-copy';

export function SettlementModal({ orderId, ticketNumber, operation, onUpdate, onClose }: { orderId: string; ticketNumber: string; operation: SettlementOperation; onUpdate: (op: SettlementOperation) => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [received, setReceived] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [startedHere, setStartedHere] = useState(false);
  const run = async (action: string) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const data = action === 'status' ? await requestJson('/api/settlements?operationId=' + encodeURIComponent(operation.operationId)) : await postJson('/api/settlements', { orderId, operationId: operation.operationId, action, confirmed, receivedAmount: received === '' ? undefined : Number(received) });
      if (!data.operation?.phase) throw new Error('保存結果を読み取れませんでした。');
      if (action === 'start' && data.startedNow) setStartedHere(true);
      onUpdate(data.operation);
    } catch (error) { setError((error instanceof Error ? error.message : '処理が完了したか確認できません。') + ' 支払いや返金は繰り返さず「最新の状態を確認する」を押してください。'); }
    finally { lock.current = false; setBusy(false); }
  };
  const cash = operation.delta > 0 && operation.cashCalculation;
  const final = operation.phase === 'completed' || operation.phase === 'aborted';
  const copy = settlementCopy(operation, startedHere);
  const cancelling = operation.kind === 'cancel';
  const refund = operation.delta < 0;
  return <BaseModal isOpen onClose={() => { if (!busy) onClose(); }} closeOnOverlayClick={false}>
    <p className="ui-eyebrow">整理券 {ticketNumber}番</p>
    <h3 className="ui-title">{copy.title}</h3>
    {operation.phase !== 'aborted' && <ol aria-label="手続きの進み具合" className="ui-steps">
      {['内容の確認', operation.delta === 0 ? '最終確認' : refund ? '返金' : '追加のお支払い', '完了'].map((label, index) => <li key={label} aria-current={copy.step === index + 1 ? 'step' : undefined} className={copy.step >= index + 1 ? 'is-current' : ''}><span>{index + 1}</span>{label}</li>)}
    </ol>}
    <p className="my-3">変更前 ¥{operation.beforeAmount.toLocaleString()} → 変更後 ¥{operation.afterAmount.toLocaleString()}</p>
    <p className="text-xl font-bold">{operation.delta > 0 ? '追加でいただく金額' : refund ? 'お返しする金額' : 'お金のやり取りは不要です'}{operation.delta !== 0 && <> ¥{Math.abs(operation.delta).toLocaleString()}（{operation.paymentMethod}）</>}</p>
    <div role="status" className={`ui-notice my-4 ${final ? 'ui-notice--success' : ''}`}><p className="font-bold">{copy.heading}</p><p className="mt-2">{copy.description}</p></div>
    {operation.phase === 'handling' && operation.delta !== 0 && <fieldset disabled={busy}>
      {cash && <label className="block">今回の預かり金<input type="number" className="my-2 w-full rounded border p-2" value={received} onChange={e => setReceived(e.target.value)} /><span>今回のお釣り: {received && Number(received) >= operation.delta ? '¥' + (Number(received) - operation.delta).toLocaleString() : '—'}</span></label>}
      <label className="my-4 flex items-start gap-3"><input className="mt-1" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> {refund ? 'お客様への返金が済んでいることを確認しました' : 'お客様から追加のお支払いを受け取りました'}</label>
    </fieldset>}
    {error && <p role="alert" className="ui-notice ui-notice--error my-3">{error}</p>}
    <div className="mt-4 flex flex-col gap-3">
      {operation.phase === 'prepared' && <button disabled={busy} onClick={() => void run(operation.delta === 0 ? 'commit' : 'start')} className="ui-button ui-button--primary">{busy ? '処理中…' : copy.next}</button>}
      {operation.phase === 'handling' && <button disabled={busy || (operation.delta !== 0 && !confirmed) || (cash && (!received || !Number.isInteger(Number(received)) || Number(received) < operation.delta))} onClick={() => void run('commit')} className={`ui-button ${cancelling ? 'ui-button--danger' : 'ui-button--primary'}`}>{busy ? '保存中…' : copy.next}</button>}
      {!final && <button disabled={busy} onClick={() => void run('status')} className="ui-button ui-button--secondary">最新の状態を確認する</button>}
      {operation.phase === 'prepared' && <div className="border-t border-gray-200 pt-3"><button disabled={busy} onClick={() => void run('abort')} className="ui-button ui-button--secondary w-full">{cancelling ? 'キャンセルをやめて注文を残す' : '変更をやめて元の注文を残す'}</button><p className="ui-help mt-2">このボタンでは注文を削除しません。</p></div>}
      <button disabled={busy} onClick={onClose} className="ui-button ui-button--secondary">{final ? '注文履歴に戻る' : 'あとで続ける（注文履歴に戻る）'}</button>
    </div>
    {!final && <p className="ui-help mt-3">途中で閉じた場合は、注文履歴の「手続きが未完了の注文」から再開できます。</p>}
    <details className="mt-4 text-xs text-gray-500"><summary>問い合わせ用の番号</summary><p className="mt-2 break-all">{operation.operationId}</p></details>
  </BaseModal>;
}
