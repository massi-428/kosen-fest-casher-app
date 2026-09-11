"use client";
import { useRef, useState } from 'react';
import { BaseModal } from '@/components/BaseModal';
import type { SettlementOperation } from '@/lib/settlement-types';
import { postJson, requestJson } from '@/lib/client-api';

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
      if (!data.operation?.phase) throw new Error('精算結果の応答が正しくありません。');
      if (action === 'start' && data.startedNow) setStartedHere(true);
      onUpdate(data.operation);
    } catch (error) { setError((error instanceof Error ? error.message : '通信結果が不明です。') + ' 受け渡しを繰り返さず「結果確認」を押してください。'); }
    finally { lock.current = false; setBusy(false); }
  };
  const cash = operation.delta > 0 && operation.cashCalculation;
  const final = operation.phase === 'completed' || operation.phase === 'aborted';
  return <BaseModal isOpen onClose={() => { if (!busy) onClose(); }} closeOnOverlayClick={false}>
    <h3 className="text-xl font-bold">{operation.kind === 'cancel' ? '全取消の返金' : '注文変更の精算'}：{ticketNumber}番</h3>
    <p className="my-3">変更前 ¥{operation.beforeAmount.toLocaleString()} → 変更後 ¥{operation.afterAmount.toLocaleString()}</p>
    <p className="text-xl font-black">{operation.delta > 0 ? '追加徴収' : operation.delta < 0 ? '返金' : '精算不要'} ¥{Math.abs(operation.delta).toLocaleString()}（{operation.paymentMethod}）</p>
    <p className="mt-2 break-all text-xs text-gray-500">操作ID: {operation.operationId}</p>
    {operation.phase === 'prepared' && <p className="my-4 rounded bg-yellow-50 p-3">対象を確定しました。他端末からの変更は停止しています。まだお金を受け渡さないでください。</p>}
    {operation.phase === 'handling' && <p className="my-4 rounded bg-yellow-50 p-3">{startedHere ? 'この画面で受け渡しを開始しました。担当者一人で、一度だけ徴収・返金してください。' : '受け渡し開始済み・記録待ちです。この画面から改めて受け渡さず、開始した担当者に実施状況を確認してください。'}受け渡し済みなら記録だけを確定します。外部決済は自動実行されません。</p>}
    {final && <p className="my-4 font-bold text-green-700">{operation.phase === 'completed' ? '精算と注文変更は記録済みです。' : '受け渡し前に中止しました。'}</p>}
    {operation.phase === 'handling' && <fieldset disabled={busy}>
      {cash && <label className="block">今回の預かり金<input type="number" className="my-2 w-full rounded border p-2" value={received} onChange={e => setReceived(e.target.value)} /><span>今回のお釣り: {received && Number(received) >= operation.delta ? '¥' + (Number(received) - operation.delta).toLocaleString() : '—'}</span></label>}
      <label className="my-4 block"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> 実際の徴収・返金が済んだことを確認しました</label>
    </fieldset>}
    {error && <p role="alert" className="my-3 text-red-600">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <button disabled={busy} onClick={() => void run('status')} className="rounded bg-blue-50 p-3 font-bold text-blue-700">結果確認</button>
      {operation.phase === 'prepared' && <><button disabled={busy} onClick={() => void run('abort')} className="rounded bg-gray-100 p-3">受け渡し前に中止</button><button disabled={busy} onClick={() => void run(operation.delta === 0 ? 'commit' : 'start')} className="rounded bg-[#f3b928] p-3 font-bold">{operation.delta === 0 ? '変更を確定' : '受け渡しへ進む'}</button></>}
      {operation.phase === 'handling' && <button disabled={busy || !confirmed || (cash && (!received || !Number.isInteger(Number(received)) || Number(received) < operation.delta))} onClick={() => void run('commit')} className="rounded bg-green-600 p-3 font-bold text-white disabled:bg-gray-300">受け渡し済み・記録を確定</button>}
      <button disabled={busy} onClick={onClose} className="rounded bg-gray-100 p-3">{final ? '閉じる' : '閉じる（履歴から再開）'}</button>
    </div>
  </BaseModal>;
}
