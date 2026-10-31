"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ConfirmModal as SharedConfirmModal, ResultModal as SharedResultModal } from '@/components/order/OrderModals';
import { BaseModal } from '@/components/BaseModal';
import { EditOrderModal, type EditableOrderItem, type EditSettlement } from '@/components/order/EditOrderModal';

import { jstToday } from '@/lib/history-query';
import { startBrowserPolling } from '@/lib/polling';
import { requestJson, postJson } from '@/lib/client-api';
import { SettlementModal } from '@/components/order/SettlementModal';
import type { SettlementOperation } from '@/lib/settlement-types';
import type { Settlement } from '@/lib/order-accounting';

// --- ユーティリティ ---
const useRouter = () => ({ push: (path: string) => { if (typeof window !== 'undefined') window.location.href = path; } });

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  } catch { return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response; }
};

// --- 型定義 ---
type CustomOption = { name: string; price: number; };
type OrderItem = { _id?: string; productId: string; productName: string; quantity: number; amount: number; detail?: string; selectedOptions?: CustomOption[]; };
type Order = { paymentCorrections?: { beforeMethod: string; afterMethod: string; createdAt: string; previousReceivedAmount?: number | null; previousChangeAmount?: number | null }[]; cancelledAt?: string | null; settlementLock?: string | null; settlementOperations?: SettlementOperation[]; revision?: number; settlements?: Settlement[]; _id: string; ticketNumber: string; items: OrderItem[]; totalAmount: number; status: 'active' | 'pending' | 'completed' | 'cancelled'; paymentMethod?: string; receivedAmount?: number | null; changeAmount?: number | null; note?: string; createdAt: string; completedAt?: string | null; };
type Product = { _id: string; name: string; price: number; isAvailable?: boolean };
type OrderStatusFilter = 'all' | Order['status'];
type ModalData = Partial<
  React.ComponentProps<typeof SharedResultModal> &
  React.ComponentProps<typeof SharedConfirmModal>
>;


// --- メインコンポーネント ---
export default function HistoryPage() {
  const router = useRouter();
  const [date, setDate] = useState(jstToday);
  const [ticket, setTicket] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hourlyStats, setHourlyStats] = useState<number[]>(new Array(24).fill(0));
  const [loadedQuery, setLoadedQuery] = useState('');
  const [paymentTarget, setPaymentTarget] = useState<Order | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const paymentLock = useRef(false);
  const openPaymentEdit = async (order: Order) => {
    setPaymentTarget(order); setPaymentMethod(''); setPaymentMethods([]); setPaymentError('');
    try {
      const settings = await requestJson('/api/settings');
      if (!Array.isArray(settings.paymentMethods)) throw new Error('決済方法を取得できません。');
      setPaymentMethods(settings.paymentMethods);
    } catch { setPaymentError('決済方法を取得できません。閉じて開き直してください。'); }
  };
  const savePayment = async () => {
    if (!paymentTarget || !paymentMethod || paymentLock.current) return;
    paymentLock.current = true; setPaymentSaving(true); setPaymentError('');
    try {
      await postJson('/api/orders/payment', { orderId: paymentTarget._id, expectedRevision: paymentTarget.revision || 0, paymentMethod });
      setPaymentTarget(null);
    } catch (error) { setPaymentError((error instanceof Error ? error.message : '通信エラー') + ' 保存結果は履歴を確認してください。'); }
    finally { await fetchOrders(); paymentLock.current = false; setPaymentSaving(false); }
  };
  const [detailTarget, setDetailTarget] = useState<Order | null>(null);
  const [pendingSettlements, setPendingSettlements] = useState<Order[]>([]);
  const [settlementTarget, setSettlementTarget] = useState<{ orderId: string; ticketNumber: string; operation: SettlementOperation } | null>(null);
  const cancelOperationId = useRef('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<OrderStatusFilter>('all');
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [fetchError, setFetchError] = useState('');
  const [pendingError, setPendingError] = useState('');
  const [operationError, setOperationError] = useState('');
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState<string[]>([]);
  const [cashSettings, setCashSettings] = useState({ cashCalculationEnabled: false, cashPaymentMethod: '現金' });
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customizations, setCustomizations] = useState<CustomOption[]>([]);
  const [editTarget, setEditTarget] = useState<Order | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // モーダル管理ステート
  const [modals, setModals] = useState({ result: false, confirm: false });
  const [modalData, setModalData] = useState<ModalData>({});

  const toggleModal = (key: keyof typeof modals, val: boolean, data: ModalData = {}) => {
    setModals(prev => ({ ...prev, [key]: val }));
    if (val) setModalData(data);
  };

  const fetchSequence = useRef(0);
  const queryKey = date + ' / 整理券番号 ' + (ticket || '全て') + ' / ' + ({ all: '全状態', active: '調理中', pending: '保留中', completed: '提供済み', cancelled: 'キャンセル済み' }[filterStatus]) + ' / ' + (page + 1) + 'ページ';
  const currentQuery = useRef(queryKey); currentQuery.current = queryKey;
  const pendingSequence = useRef(0);
  const fetchPending = useCallback(async () => {
    const sequence = ++pendingSequence.current;
    try { const data = await requestJson('/api/settlements'); if (!Array.isArray(data)) throw new Error('支払い・返金の状況が不正です。'); if (sequence !== pendingSequence.current) return false; setPendingSettlements(data); setPendingError(''); return true; }
    catch { if (sequence === pendingSequence.current) setPendingError('手続きが未完了の注文を取得できません。再読み込みしてください。'); return false; }
  }, []);
  const fetchOrders = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    setLoading(true);
    try {
      const data = await requestJson('/api/orders?' + new URLSearchParams({ date, ticket, status: filterStatus, page: String(page) }));
      if (sequence !== fetchSequence.current || currentQuery.current !== queryKey) return;
      if (!data || !Array.isArray(data.orders) || !Number.isInteger(data.total) || !Array.isArray(data.hourly) || !data.orders.every((o: Order) => o && typeof o._id === 'string' && Array.isArray(o.items) && Number.isFinite(o.totalAmount) && Number.isFinite(new Date(o.createdAt).getTime()) && o.items.every(i => i && typeof i.productName === 'string' && Number.isFinite(i.quantity) && Number.isFinite(i.amount)))) throw new Error('注文履歴の応答形式が正しくありません。');
      setOrders(data.orders); setTotal(data.total); setLoadedQuery(queryKey); setLastUpdated(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })); setFetchError('');
      const counts = new Array(24).fill(0); for (const row of data.hourly) { if (Number.isInteger(row._id) && row._id >= 0 && row._id < 24) counts[row._id] = row.count; } setHourlyStats(counts);
      return true;
    } catch (error) { if (sequence === fetchSequence.current && currentQuery.current === queryKey) setFetchError(error instanceof Error ? error.message : '通信エラー'); return false; }
    finally { if (sequence === fetchSequence.current && currentQuery.current === queryKey) setLoading(false); }
  }, [date, ticket, filterStatus, page, queryKey]);
  useEffect(() => {
    const poller = startBrowserPolling(async () => {
      const results = await Promise.all([fetchOrders(), fetchPending()]);
      return results.every(result => result === true);
    });
    return () => poller.stop();
  }, [fetchOrders, fetchPending]);

  const fetchEditReferences = useCallback(async () => {
    try {
      const [productsResponse, settingsResponse] = await Promise.all([apiFetch('/api/products'), apiFetch('/api/settings')]);
      if (!productsResponse.ok || !settingsResponse.ok) throw new Error();
      if (productsResponse.ok) setProducts(await productsResponse.json());
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json();
        setCashSettings({ cashCalculationEnabled: settings.cashCalculationEnabled === true, cashPaymentMethod: settings.cashPaymentMethod || '現金' });
        setCustomizations(Array.isArray(settings.customizations) ? settings.customizations : []);
      }
    } catch { setEditError('商品情報を取得できません。編集を開き直して再試行してください。'); }
  }, []);
  useEffect(() => { void fetchEditReferences(); }, [fetchEditReferences]);

  const editLock = useRef(false);
  const cancelLock = useRef(false);
  const showOperation = (order: Order, operation: SettlementOperation) => {
    setSettlementTarget({ orderId: order._id, ticketNumber: order.ticketNumber, operation }); setEditTarget(null); setCancelTarget(null);
    void fetchOrders(); void fetchPending();
  };
  const saveOrderEdit = async (items: EditableOrderItem[], note: string, settlement: EditSettlement) => {
    if (!editTarget || editLock.current) return;
    editLock.current = true; setIsSavingEdit(true); setEditError('');
    try {
      const data = await postJson('/api/settlements', { action: 'prepare', kind: 'edit', operationId: settlement.requestId, orderId: editTarget._id, expectedRevision: editTarget.revision || 0, expectedTotal: settlement.expectedTotal, items: items.map(item => ({ lineId: item._id, productId: item.productId, quantity: item.quantity, detail: item.detail || '', selectedOptionNames: (item.selectedOptions || []).map(option => option.name) })), note });
      if (!data.operation) throw new Error('変更する注文を確認できません。注文履歴から開き直してください。');
      showOperation(editTarget, data.operation);
    } catch (error) {
      setEditError((error instanceof Error ? error.message : '通信エラー') + ' まだ支払いや返金を行わないでください。');
      try { const data = await requestJson('/api/settlements?operationId=' + settlement.requestId); if (data.operation) showOperation(editTarget, data.operation); } catch { /* Keep the same operation ID for retry. */ }
      await fetchOrders(); await fetchPending();
    } finally { editLock.current = false; setIsSavingEdit(false); }
  };

  const handleToggleStatus = (order: Order) => {
    const newStatus = order.status === 'active' ? 'completed' : 'active';
    const action = newStatus === 'completed' ? '返却（完了）' : '完了を取り消して調理中に戻す';
    
    toggleModal('confirm', true, {
      message: `${order.ticketNumber}番の注文を【${action}】しますか？`,
      onConfirm: async () => {
        toggleModal('confirm', false);
        if (busyRef.current.has(order._id)) return;
        busyRef.current.add(order._id); setBusy([...busyRef.current]); setOperationError('');
        try {
          const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order._id, status: newStatus, expectedRevision: order.revision || 0 }) });
          if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || '更新結果を確認できません。'); }
        } catch (error) { setOperationError((error instanceof Error ? error.message : '通信エラー') + ' 最新状態を確認し、必要なら再試行してください。'); }
        finally { await fetchOrders(); busyRef.current.delete(order._id); setBusy([...busyRef.current]); }

      }
    });
  };

  const handleCancelOrder = (order: Order) => {
    cancelOperationId.current = crypto.randomUUID();
    setCancelTarget(order);
    setCancelPassword('');
    setCancelError('');
  };

  const closeCancelModal = () => {
    if (isCancelling) return;
    setCancelTarget(null);
    setCancelPassword('');
    setCancelError('');
  };

  const submitCancelOrder = async () => {
    if (!cancelTarget || cancelLock.current) return;
    if (!cancelPassword.trim()) { setCancelError('キャンセル用パスワードを入力してください。'); return; }
    cancelLock.current = true; setIsCancelling(true); setCancelError('');
    try {
      const data = await postJson('/api/settlements', { action: 'prepare', kind: 'cancel', operationId: cancelOperationId.current, orderId: cancelTarget._id, expectedRevision: cancelTarget.revision || 0, cancelPassword });
      if (!data.operation) throw new Error('返金対象を確認できません。');
      showOperation(cancelTarget, data.operation);
    } catch (error) {
      setCancelError((error instanceof Error ? error.message : '通信エラー') + ' まだ返金しないでください。');
      try { const data = await requestJson('/api/settlements?operationId=' + cancelOperationId.current); if (data.operation) showOperation(cancelTarget, data.operation); } catch { /* Result can be retried or resumed from pending operations. */ }
      await fetchOrders(); await fetchPending();
    } finally { cancelLock.current = false; setIsCancelling(false); }
  };
  const filteredOrders = useMemo(() => orders, [orders]);
  const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '記録なし';

  return (
    <div className="min-h-dvh bg-gray-100 p-6 font-sans text-gray-900">
      
      {settlementTarget && <SettlementModal key={settlementTarget.operation.operationId} {...settlementTarget} onClose={() => { setSettlementTarget(null); void fetchOrders(); void fetchPending(); }} onUpdate={operation => { setSettlementTarget({ ...settlementTarget, operation }); void fetchOrders(); void fetchPending(); }} />}
      <BaseModal isOpen={detailTarget !== null} onClose={() => setDetailTarget(null)} size="xl">
        {detailTarget && <><h3 className="mb-3 text-xl font-bold">注文詳細：{detailTarget.ticketNumber}番</h3><p>受付 {formatTime(detailTarget.createdAt)} ／ 提供 {formatTime(detailTarget.completedAt)} ／ キャンセル {formatTime(detailTarget.cancelledAt)}</p>
          <div className="my-4 space-y-3">{detailTarget.items.map((item, i) => <div key={i} className="rounded border p-3"><b>{item.productName} × {item.quantity} ／ ¥{item.amount.toLocaleString()}</b><p>オプション: {(item.selectedOptions || []).map(o => o.name + '（' + o.price + '円）').join('、') || 'なし'}</p><p>商品メモ: {item.detail || 'なし'}</p></div>)}</div>
          <p>注文備考: {detailTarget.note || 'なし'}</p><p>支払い方法: {detailTarget.paymentMethod || '未記録'} ／ 合計 ¥{detailTarget.totalAmount.toLocaleString()}</p><p>最初のお預かり: {detailTarget.receivedAmount ?? '未記録'} ／ 最初のお釣り: {detailTarget.changeAmount ?? '未記録'}</p>
          {!!detailTarget.paymentCorrections?.length && <><h4 className="mt-4 font-bold">決済方法の変更履歴</h4>{detailTarget.paymentCorrections.map((entry, index) => <p key={index}>{formatTime(entry.createdAt)} {entry.beforeMethod || '未記録'} → {entry.afterMethod} ／ 変更前のお預かり {entry.previousReceivedAmount ?? '未記録'} ／ お釣り {entry.previousChangeAmount ?? '未記録'}</p>)}</>}
          <h4 className="mt-4 font-bold">追加支払い・返金の履歴</h4>{!(detailTarget.settlements || []).length && <p>追加支払い・返金の履歴なし</p>}{(detailTarget.settlements || []).map(op => <p key={op.requestId}>{formatTime(op.createdAt)} {op.kind === 'cancel' ? '注文キャンセル' : '追加支払い・返金'} {op.delta}円（{op.paymentMethod}）変更前 {op.beforeAmount}円 → 変更後 {op.afterAmount}円 ／ お預かり {op.receivedAmount ?? '—'} ／ お釣り {op.changeAmount ?? '—'}</p>)}<button className="ui-button ui-button--secondary mt-4 p-3" onClick={() => setDetailTarget(null)}>閉じる</button></>}
      </BaseModal>
      <BaseModal isOpen={paymentTarget !== null} onClose={() => { if (!paymentSaving) setPaymentTarget(null); }} closeOnOverlayClick={!paymentSaving}>
        <h3 className="ui-title mb-3">決済方法を修正</h3>
        <p className="mb-3">整理券 {paymentTarget?.ticketNumber}番 ／ 受付時の決済方法：{paymentTarget?.paymentMethod || '未記録'}</p>
        <p className="ui-help mb-4">実際に受け取った決済方法に訂正します。追加決済・返金は行いません。追加精算の決済方法は変わりません。以前のお預かり・お釣りは変更履歴に保存し、現在の記録から外します。</p>
        <label htmlFor="correct-payment-method" className="block mb-2 font-bold">正しい決済方法</label>
        <select id="correct-payment-method" value={paymentMethod} disabled={paymentSaving} onChange={e => setPaymentMethod(e.target.value)} className="w-full rounded border p-3">
          <option value="">選択してください</option>
          {paymentMethods.map(method => <option key={method} value={method} disabled={method === paymentTarget?.paymentMethod}>{method}</option>)}
        </select>
        {paymentError && <p role="alert" className="mt-3 text-red-700">{paymentError}</p>}
        <div className="mt-5 flex gap-3">
          <button className="ui-button ui-button--secondary" disabled={paymentSaving} onClick={() => setPaymentTarget(null)}>戻る</button>
          <button className="ui-button ui-button--primary" disabled={paymentSaving || !paymentMethod} onClick={() => void savePayment()}>{paymentSaving ? '保存中…' : '決済方法を修正する'}</button>
        </div>
      </BaseModal>
      {/* モーダル */}
      <SharedResultModal isOpen={modals.result} title={modalData.title || ''} message={modalData.message || ''} type={modalData.type || 'success'} onClose={() => toggleModal('result', false)} />
      <SharedConfirmModal isOpen={modals.confirm} message={modalData.message || ''} onConfirm={modalData.onConfirm || (() => {})} onCancel={() => toggleModal('confirm', false)} confirmLabel={modalData.confirmLabel} cancelLabel={modalData.cancelLabel} />
      <BaseModal isOpen={cancelTarget !== null} onClose={closeCancelModal} closeOnOverlayClick={!isCancelling}>
        <h3 className="ui-title mb-3">注文をキャンセルする</h3>
        <p className="mb-3">整理券 {cancelTarget?.ticketNumber}番 ／ 返金する金額 ¥{cancelTarget?.totalAmount.toLocaleString()}</p>
        <div className="ui-notice mb-4"><p className="font-bold">この画面では、まだキャンセルは完了しません。</p><p className="mt-2">パスワードを入力すると、返金と最終確認の画面に進みます。返金が済んでから「注文のキャンセルを確定する」を押してください。完了後も履歴は残ります。</p></div>
        <label className="block text-sm font-bold text-gray-700 mb-2" htmlFor="cancel-password">キャンセル用パスワード</label>
        <input id="cancel-password" type="password" value={cancelPassword} onChange={(event) => { setCancelPassword(event.target.value); setCancelError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') void submitCancelOrder(); }} autoFocus disabled={isCancelling} className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
        {cancelError && <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{cancelError}</p>}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={closeCancelModal} disabled={isCancelling} className="ui-button ui-button--secondary flex-1 py-3 disabled:opacity-50">戻る</button>
          <button type="button" onClick={() => void submitCancelOrder()} disabled={isCancelling || !cancelPassword.trim()} className="ui-button ui-button--primary flex-1">{isCancelling ? '確認中…' : '返金・確認画面へ進む'}</button>
        </div>
      </BaseModal>
      <EditOrderModal {...cashSettings} order={editTarget} products={products} customizations={customizations} saving={isSavingEdit} error={editError} onClose={() => { if (!isSavingEdit) { setEditTarget(null); setEditError(''); } }} onSave={(items, note, settlement) => void saveOrderEdit(items, note, settlement)} />

      <div className="flex flex-wrap justify-between items-center gap-4 mb-6 bg-white p-4 rounded-xl border border-gray-200">
        <div><h1 className="ui-title">注文履歴</h1><p className="ui-help mt-1">注文の確認・変更・キャンセルができます。</p></div>
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => router.push('/order')} className="ui-button ui-button--secondary px-4 py-2 mr-2">← 注文画面へ</button>
          <input aria-label="履歴の日付（日本時間）" type="date" value={date} onChange={e => { setPage(0); setDate(e.target.value); }} className="rounded border p-2" /><input aria-label="整理券番号で検索" placeholder="整理券番号" value={ticket} onChange={e => { setPage(0); setTicket(e.target.value); }} className="w-24 rounded border p-2" />
          <select value={filterStatus} onChange={(e) => (setPage(0), setFilterStatus(e.target.value as OrderStatusFilter))} className="border border-gray-300 p-2 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]">
            <option value="all">全て表示</option>
            <option value="active">調理中</option>
            <option value="pending">保留中</option>
            <option value="completed">提供済み</option>
            <option value="cancelled">キャンセル済み</option>
          </select>
        </div>
      </div>
      
      <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-white p-3">
        <div role="status" className="min-w-0">
          <p>最終更新: {lastUpdated || 'まだ読み込んでいません'} {loading && '／読み込み中…'}</p>
          {loadedQuery && <p>表示データ: {loadedQuery}</p>}
          {(fetchError || (loadedQuery && loadedQuery !== queryKey)) && <p className="font-bold text-red-600">{fetchError} {loadedQuery ? '最後に取得したデータです。最新の検索結果ではありません。' : '注文をまだ読み込めていません。'}</p>}
          {pendingError && <p className="text-red-600">{pendingError}</p>}
          {operationError && <p className="text-red-600">{operationError}</p>}
          {!loading && !fetchError && loadedQuery === queryKey && orders.length === 0 && <p>検索結果はありません。</p>}
        </div>
        <button type="button" onClick={() => { void fetchOrders(); void fetchPending(); }} aria-label="履歴と手続きが未完了の注文を再読み込み" title="再読み込み" className="ui-button ui-button--secondary flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.55-1.65L20 8M4 16l2.35 2.65A7 7 0 0 0 17.9 17" /></svg>
        </button>
      </div>
      {pendingSettlements.length > 0 && <div className="ui-notice mb-4"><h2 className="font-bold">手続きが未完了の注文</h2><p className="mt-1">注文の変更・キャンセルが途中です。番号を選んで続きを行ってください。検索した日付以外の注文も表示しています。</p>{pendingSettlements.map(order => <button key={order._id} className="ui-button ui-button--secondary m-2" onClick={() => { const operation = order.settlementOperations?.find(op => op.operationId === order.settlementLock); if (operation) showOperation(order, operation); }}>{formatTime(order.createdAt)} ／ {order.ticketNumber}番：手続きを続ける</button>)}</div>}
      <div className="mb-4 flex gap-3"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>前の100件</button><span>{page + 1}ページ ／ {total}件</span><button disabled={(page + 1) * 100 >= total} onClick={() => setPage(p => p + 1)}>次の100件</button></div>
      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span>📊</span> 時間帯別注文数 <span className="text-xs text-gray-500 font-normal">(日本時間・キャンセル除外・検索条件の全件)</span><span className="text-xs">{loadedQuery || queryKey}</span>
        </h2>
        {!loadedQuery ? <p>{loading ? '集計を読み込み中…' : '集計は未取得です。再読み込みしてください。'}</p> : <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {hourlyStats.map((count, hour) => (
            <div key={hour} className={`flex flex-col items-center justify-center p-2 rounded border ${count > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
              <span className="text-xs text-gray-500">{hour}:00</span>
              <span className={`text-lg font-bold ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{count}</span>
            </div>
          ))}
        </div>}
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-x-auto overflow-y-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">番号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">注文日時</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">商品名</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">金額</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">ステータス</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredOrders.map((order) => (
              <tr key={order._id} className={order.status === 'active' ? 'bg-yellow-50' : order.status === 'pending' ? 'bg-orange-50' : order.status === 'cancelled' ? 'bg-gray-100 opacity-70' : 'hover:bg-gray-50 transition-colors'}>
                <td className="px-6 py-4 font-bold text-xl">{order.ticketNumber}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  <div>受付: {new Date(order.createdAt).toLocaleString()}</div>
                  {order.status === 'completed' && <div>提供: {order.completedAt ? new Date(order.completedAt).toLocaleString() : '記録なし'}</div>}
                  {order.status === 'completed' && order.completedAt && <div className="font-bold text-blue-700">所要: {Math.max(1, Math.round((new Date(order.completedAt).getTime() - new Date(order.createdAt).getTime()) / 60000))}分</div>}
                </td>
                <td className="px-6 py-4 text-sm">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {order.items.map((item, idx) => <li key={idx} className={order.status === 'cancelled' ? 'text-gray-400' : ''}>{item.productName} × {item.quantity}</li>)}
                  </ul>
                </td>
                <td className={`px-6 py-4 text-right font-bold ${order.status === 'cancelled' ? 'line-through text-gray-400' : ''}`}>
                  <div>¥{order.totalAmount.toLocaleString()}</div>
                  {order.paymentMethod && <div className="text-xs font-medium text-gray-500">{order.paymentMethod}</div>}
                  {typeof order.receivedAmount === 'number' && typeof order.changeAmount === 'number' && <div className="mt-1 text-xs font-medium text-gray-500">最初のお預かり ¥{order.receivedAmount.toLocaleString()} / 最初のお釣り ¥{order.changeAmount.toLocaleString()}</div>}
                  {(order.settlements || []).map(entry => <div key={entry.requestId} className="mt-2 text-xs font-medium text-blue-700">{new Date(entry.createdAt).toLocaleString()} {entry.kind === 'cancel' ? 'キャンセルによる返金' : entry.delta > 0 ? '追加のお支払い' : '差額の返金'} ¥{Math.abs(entry.delta).toLocaleString()}（{entry.paymentMethod}）変更前 ¥{entry.beforeAmount.toLocaleString()} → 変更後 ¥{entry.afterAmount.toLocaleString()}{typeof entry.receivedAmount === 'number' && <span> お預かり ¥{entry.receivedAmount} / お釣り ¥{entry.changeAmount}</span>}</div>)}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-3 py-1 text-xs rounded-full font-bold shadow-sm ${
                    order.status === 'active' ? 'bg-red-100 text-red-800 border border-red-200' : 
                    order.status === 'pending' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                    order.status === 'completed' ? 'bg-green-100 text-green-800 border border-green-200' : 
                    'bg-gray-200 text-gray-600 border border-gray-300'
                  }`}>
                    {order.status === 'active' ? '調理中' : order.status === 'pending' ? '保留中' : order.status === 'completed' ? '提供済み' : 'キャンセル済み'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="ui-button ui-button--secondary mb-2" onClick={() => setDetailTarget(order)}>詳細</button>
                  <fieldset disabled={!!order.settlementLock || busy.includes(order._id) || isCancelling || isSavingEdit || paymentSaving} className="flex justify-end gap-2">
                    {order.status !== 'cancelled' && <button onClick={() => void openPaymentEdit(order)} className="ui-button ui-button--secondary px-3 py-1.5">決済方法を修正</button>}
                    {order.status === 'completed' && <button onClick={() => handleToggleStatus(order)} className="ui-button ui-button--secondary px-3 py-1.5">調理中に戻す</button>}
                    {(order.status === 'active' || order.status === 'pending') && <button onClick={() => { setEditTarget(order); setEditError(''); void fetchEditReferences(); }} className="ui-button ui-button--secondary px-3 py-1.5">内容編集</button>}
                    {order.status === 'active' && <button onClick={() => handleToggleStatus(order)} className="ui-button ui-button--secondary px-3 py-1.5">提供済みにする</button>}
                    {order.status !== 'cancelled' && <button onClick={() => handleCancelOrder(order)} className="ui-button ui-button--danger px-3 py-1.5">注文をキャンセル</button>}
                  </fieldset>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
