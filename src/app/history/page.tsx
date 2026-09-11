"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ConfirmModal as SharedConfirmModal, ResultModal as SharedResultModal } from '@/components/order/OrderModals';
import { BaseModal } from '@/components/BaseModal';
import { EditOrderModal, type EditableOrderItem, type EditSettlement } from '@/components/order/EditOrderModal';

import { jstToday } from '@/lib/history-query';
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
type Order = { cancelledAt?: string | null; settlementLock?: string | null; settlementOperations?: SettlementOperation[]; revision?: number; settlements?: Settlement[]; _id: string; ticketNumber: string; items: OrderItem[]; totalAmount: number; status: 'active' | 'pending' | 'completed' | 'cancelled'; paymentMethod?: string; receivedAmount?: number | null; changeAmount?: number | null; note?: string; createdAt: string; completedAt?: string | null; };
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
  const historyInFlight = useRef(false);
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
  const queryKey = date + ' / 整理番号 ' + (ticket || '全て') + ' / ' + ({ all: '全状態', active: '調理中', pending: '保留中', completed: '完了', cancelled: '取消' }[filterStatus]) + ' / ' + (page + 1) + 'ページ';
  const currentQuery = useRef(queryKey); currentQuery.current = queryKey;
  const pendingSequence = useRef(0);
  const fetchPending = useCallback(async () => {
    const sequence = ++pendingSequence.current;
    try { const data = await requestJson('/api/settlements'); if (!Array.isArray(data)) throw new Error('精算状況が不正です。'); if (sequence !== pendingSequence.current) return; setPendingSettlements(data); setPendingError(''); }
    catch { if (sequence === pendingSequence.current) setPendingError('未完了の精算を取得できません。再取得してください。'); }
  }, []);
  const fetchOrders = useCallback(async () => {
    const sequence = ++fetchSequence.current;
    historyInFlight.current = true; setLoading(true);
    try {
      const data = await requestJson('/api/orders?' + new URLSearchParams({ date, ticket, status: filterStatus, page: String(page) }));
      if (sequence !== fetchSequence.current || currentQuery.current !== queryKey) return;
      if (!data || !Array.isArray(data.orders) || !Number.isInteger(data.total) || !Array.isArray(data.hourly) || !data.orders.every((o: Order) => o && typeof o._id === 'string' && Array.isArray(o.items) && Number.isFinite(o.totalAmount) && Number.isFinite(new Date(o.createdAt).getTime()) && o.items.every(i => i && typeof i.productName === 'string' && Number.isFinite(i.quantity) && Number.isFinite(i.amount)))) throw new Error('注文履歴の応答形式が正しくありません。');
      setOrders(data.orders); setTotal(data.total); setLoadedQuery(queryKey); setLastUpdated(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })); setFetchError('');
      const counts = new Array(24).fill(0); for (const row of data.hourly) { if (Number.isInteger(row._id) && row._id >= 0 && row._id < 24) counts[row._id] = row.count; } setHourlyStats(counts);
    } catch (error) { if (sequence === fetchSequence.current && currentQuery.current === queryKey) setFetchError(error instanceof Error ? error.message : '通信エラー'); }
    finally { if (sequence === fetchSequence.current && currentQuery.current === queryKey) { historyInFlight.current = false; setLoading(false); } }
  }, [date, ticket, filterStatus, page, queryKey]);
  useEffect(() => { void fetchOrders(); void fetchPending(); const interval = setInterval(() => { if (!historyInFlight.current) void fetchOrders(); void fetchPending(); }, 5000); return () => clearInterval(interval); }, [fetchOrders, fetchPending]);

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
      if (!data.operation) throw new Error('精算対象を確認できません。');
      showOperation(editTarget, data.operation);
    } catch (error) {
      setEditError((error instanceof Error ? error.message : '通信エラー') + ' まだ受け渡しを行わないでください。');
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
    <div className="min-h-screen bg-gray-100 p-6 font-sans text-gray-900">
      
      {settlementTarget && <SettlementModal key={settlementTarget.operation.operationId} {...settlementTarget} onClose={() => { setSettlementTarget(null); void fetchOrders(); void fetchPending(); }} onUpdate={operation => { setSettlementTarget({ ...settlementTarget, operation }); void fetchOrders(); void fetchPending(); }} />}
      <BaseModal isOpen={detailTarget !== null} onClose={() => setDetailTarget(null)} size="xl">
        {detailTarget && <><h3 className="mb-3 text-xl font-bold">注文詳細：{detailTarget.ticketNumber}番</h3><p>受付 {formatTime(detailTarget.createdAt)} ／ 提供 {formatTime(detailTarget.completedAt)} ／ 取消 {formatTime(detailTarget.cancelledAt)}</p>
          <div className="my-4 space-y-3">{detailTarget.items.map((item, i) => <div key={i} className="rounded border p-3"><b>{item.productName} × {item.quantity} ／ ¥{item.amount.toLocaleString()}</b><p>オプション: {(item.selectedOptions || []).map(o => o.name + '（' + o.price + '円）').join('、') || 'なし'}</p><p>商品メモ: {item.detail || 'なし'}</p></div>)}</div>
          <p>注文備考: {detailTarget.note || 'なし'}</p><p>支払方法: {detailTarget.paymentMethod || '未記録'} ／ 合計 ¥{detailTarget.totalAmount.toLocaleString()}</p><p>初回預り: {detailTarget.receivedAmount ?? '未記録'} ／ 初回釣銭: {detailTarget.changeAmount ?? '未記録'}</p>
          <h4 className="mt-4 font-bold">精算履歴</h4>{!(detailTarget.settlements || []).length && <p>精算履歴なし</p>}{(detailTarget.settlements || []).map(op => <p key={op.requestId}>{formatTime(op.createdAt)} {op.kind === 'cancel' ? '全取消' : '差額精算'} {op.delta}円（{op.paymentMethod}）変更前 {op.beforeAmount}円 → 変更後 {op.afterAmount}円 ／ 預り {op.receivedAmount ?? '—'} ／ 釣銭 {op.changeAmount ?? '—'}</p>)}<button className="mt-4 rounded bg-gray-100 p-3" onClick={() => setDetailTarget(null)}>閉じる</button></>}
      </BaseModal>
      {/* モーダル */}
      <SharedResultModal isOpen={modals.result} title={modalData.title || ''} message={modalData.message || ''} type={modalData.type || 'success'} onClose={() => toggleModal('result', false)} />
      <SharedConfirmModal isOpen={modals.confirm} message={modalData.message || ''} onConfirm={modalData.onConfirm || (() => {})} onCancel={() => toggleModal('confirm', false)} confirmLabel={modalData.confirmLabel} cancelLabel={modalData.cancelLabel} />
      <BaseModal isOpen={cancelTarget !== null} onClose={closeCancelModal} closeOnOverlayClick={!isCancelling}>
        <h3 className="text-xl font-bold text-gray-800 text-center mb-3">注文のキャンセル</h3>
        <p className="text-gray-600 text-center mb-4">{cancelTarget?.ticketNumber}番の注文をキャンセル（返金）扱いにします。<br />今回の返金額は ¥{cancelTarget?.totalAmount.toLocaleString()} です。過去の差額返金は含めません。まだ返金しないでください。先に返金対象を確定します。</p>
        <label className="block text-sm font-bold text-gray-700 mb-2" htmlFor="cancel-password">キャンセル用パスワード</label>
        <input id="cancel-password" type="password" value={cancelPassword} onChange={(event) => { setCancelPassword(event.target.value); setCancelError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') void submitCancelOrder(); }} autoFocus disabled={isCancelling} className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
        {cancelError && <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{cancelError}</p>}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={closeCancelModal} disabled={isCancelling} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold disabled:opacity-50">戻る</button>
          <button type="button" onClick={() => void submitCancelOrder()} disabled={isCancelling || !cancelPassword.trim()} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold disabled:opacity-50">{isCancelling ? '処理中...' : '返金対象を確定'}</button>
        </div>
      </BaseModal>
      <EditOrderModal {...cashSettings} order={editTarget} products={products} customizations={customizations} saving={isSavingEdit} error={editError} onClose={() => { if (!isSavingEdit) { setEditTarget(null); setEditError(''); } }} onSave={(items, note, settlement) => void saveOrderEdit(items, note, settlement)} />

      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-800">注文履歴と管理</h1>
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={() => router.push('/order')} className="text-gray-500 hover:text-gray-700 font-bold px-4 py-2 bg-gray-100 rounded-lg transition mr-2">← 注文画面へ</button>
          <input aria-label="履歴の日付（日本時間）" type="date" value={date} onChange={e => { setPage(0); setDate(e.target.value); }} className="rounded border p-2" /><input aria-label="整理番号で検索" placeholder="整理番号" value={ticket} onChange={e => { setPage(0); setTicket(e.target.value); }} className="w-24 rounded border p-2" />
          <select value={filterStatus} onChange={(e) => (setPage(0), setFilterStatus(e.target.value as OrderStatusFilter))} className="border border-gray-300 p-2 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]">
            <option value="all">全て表示</option>
            <option value="active">調理中</option>
            <option value="pending">保留中</option>
            <option value="completed">完了済み</option>
            <option value="cancelled">キャンセル済み</option>
          </select>
          <button onClick={fetchOrders} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"><span className="text-xl">↻</span></button>
        </div>
      </div>
      
      <div className="mb-4 rounded-xl bg-white p-3" role="status"><p>最終成功: {lastUpdated || '未取得'} {loading && '／読み込み中…'}</p>{loadedQuery && <p>表示データ: {loadedQuery}</p>}{(fetchError || (loadedQuery && loadedQuery !== queryKey)) && <p className="font-bold text-red-600">{fetchError} {loadedQuery ? '最後に取得したデータです。最新の検索結果ではありません。' : '注文は未取得です。'}</p>}{pendingError && <p className="text-red-600">{pendingError}</p>}{operationError && <p className="text-red-600">{operationError}</p>}<button onClick={() => { void fetchOrders(); void fetchPending(); }} className="text-blue-700">再取得・再試行</button>{!loading && !fetchError && loadedQuery === queryKey && orders.length === 0 && <p>検索結果はありません。</p>}</div>
      {pendingSettlements.length > 0 && <div className="mb-4 rounded-xl bg-yellow-50 p-4"><h2 className="font-bold">未完了の精算（日付検索の対象外も表示）</h2>{pendingSettlements.map(order => <button key={order._id} className="m-2 rounded border p-2" onClick={() => { const operation = order.settlementOperations?.find(op => op.operationId === order.settlementLock); if (operation) showOperation(order, operation); }}>{formatTime(order.createdAt)} ／ {order.ticketNumber}番：精算を確認・再開</button>)}</div>}
      <div className="mb-4 flex gap-3"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>前の100件</button><span>{page + 1}ページ ／ {total}件</span><button disabled={(page + 1) * 100 >= total} onClick={() => setPage(p => p + 1)}>次の100件</button></div>
      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span>📊</span> 時間帯別注文数 <span className="text-xs text-gray-500 font-normal">(日本時間・キャンセル除外・検索条件の全件)</span><span className="text-xs">{loadedQuery || queryKey}</span>
        </h2>
        {!loadedQuery ? <p>{loading ? '集計を読み込み中…' : '集計は未取得です。再取得してください。'}</p> : <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {hourlyStats.map((count, hour) => (
            <div key={hour} className={`flex flex-col items-center justify-center p-2 rounded border ${count > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
              <span className="text-xs text-gray-500">{hour}:00</span>
              <span className={`text-lg font-bold ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{count}</span>
            </div>
          ))}
        </div>}
      </div>

      <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
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
                  {typeof order.receivedAmount === 'number' && typeof order.changeAmount === 'number' && <div className="mt-1 text-xs font-medium text-gray-500">初回預り ¥{order.receivedAmount.toLocaleString()} / 初回釣銭 ¥{order.changeAmount.toLocaleString()}</div>}
                  {(order.settlements || []).map(entry => <div key={entry.requestId} className="mt-2 text-xs font-medium text-blue-700">{new Date(entry.createdAt).toLocaleString()} {entry.kind === 'cancel' ? '全取消返金' : entry.delta > 0 ? '追加徴収' : '差額返金'} ¥{Math.abs(entry.delta).toLocaleString()}（{entry.paymentMethod}）変更前 ¥{entry.beforeAmount.toLocaleString()} → 変更後 ¥{entry.afterAmount.toLocaleString()}{typeof entry.receivedAmount === 'number' && <span> 預り ¥{entry.receivedAmount} / 釣銭 ¥{entry.changeAmount}</span>}</div>)}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-3 py-1 text-xs rounded-full font-bold shadow-sm ${
                    order.status === 'active' ? 'bg-red-100 text-red-800 border border-red-200' : 
                    order.status === 'pending' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                    order.status === 'completed' ? 'bg-green-100 text-green-800 border border-green-200' : 
                    'bg-gray-200 text-gray-600 border border-gray-300'
                  }`}>
                    {order.status === 'active' ? '調理中' : order.status === 'pending' ? '保留中' : order.status === 'completed' ? '完了済み' : 'キャンセル'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="mb-2 text-blue-700" onClick={() => setDetailTarget(order)}>詳細</button>
                  <fieldset disabled={!!order.settlementLock || busy.includes(order._id) || isCancelling || isSavingEdit} className="flex justify-end gap-2">
                    {order.status === 'completed' && <button onClick={() => handleToggleStatus(order)} className="rounded-lg bg-blue-50 px-3 py-1.5 font-bold text-blue-700">完了を取り消す</button>}
                    {(order.status === 'active' || order.status === 'pending') && <button onClick={() => { setEditTarget(order); setEditError(''); void fetchEditReferences(); }} className="text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-100 font-bold transition shadow-sm">内容編集</button>}
                    {order.status === 'active' && <button onClick={() => handleToggleStatus(order)} className="text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-100 font-bold transition shadow-sm">完了</button>}
                    {order.status !== 'cancelled' && <button onClick={() => handleCancelOrder(order)} className="text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 font-bold transition shadow-sm">キャンセル</button>}
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
