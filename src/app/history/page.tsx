"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfirmModal as SharedConfirmModal, ResultModal as SharedResultModal } from '@/components/order/OrderModals';
import { BaseModal } from '@/components/BaseModal';

// --- ユーティリティ ---
const useRouter = () => ({ push: (path: string) => { if (typeof window !== 'undefined') window.location.href = path; } });

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers });
  } catch { return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response; }
};

// --- 型定義 ---
type CustomOption = { name: string; price: number; };
type OrderItem = { productName: string; quantity: number; amount: number; detail?: string; selectedOptions?: CustomOption[]; };
type Order = { _id: string; ticketNumber: string; items: OrderItem[]; totalAmount: number; status: 'active' | 'completed' | 'cancelled'; paymentMethod?: string; note?: string; createdAt: string; completedAt?: string | null; };
type OrderStatusFilter = 'all' | Order['status'];
type ModalData = Partial<
  React.ComponentProps<typeof SharedResultModal> &
  React.ComponentProps<typeof SharedConfirmModal>
>;


// --- メインコンポーネント ---
export default function HistoryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<OrderStatusFilter>('all');
  const [, setLastUpdated] = useState<string>("");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelPassword, setCancelPassword] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // モーダル管理ステート
  const [modals, setModals] = useState({ result: false, confirm: false });
  const [modalData, setModalData] = useState<ModalData>({});

  const toggleModal = (key: keyof typeof modals, val: boolean, data: ModalData = {}) => {
    setModals(prev => ({ ...prev, [key]: val }));
    if (val) setModalData(data);
  };

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders', { cache: 'no-store' }); 
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) { setOrders(data); setLastUpdated(new Date().toLocaleTimeString()); } else { setOrders([]); }
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); const interval = setInterval(fetchOrders, 5000); return () => clearInterval(interval); }, [fetchOrders]);

  const handleToggleStatus = (order: Order) => {
    const newStatus = order.status === 'active' ? 'completed' : 'active';
    const action = newStatus === 'completed' ? '返却（完了）' : 'アクティブ化';
    
    toggleModal('confirm', true, {
      message: `${order.ticketNumber}番の注文を【${action}】しますか？`,
      onConfirm: async () => {
        toggleModal('confirm', false);
        setOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: newStatus } : o));
        try {
          await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: order.ticketNumber, orderId: order._id, status: newStatus }) });
          setTimeout(fetchOrders, 500); 
        } catch { fetchOrders(); }
      }
    });
  };

  const handleCancelOrder = (order: Order) => {
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
    if (!cancelTarget || isCancelling) return;
    if (!cancelPassword.trim()) {
      setCancelError('キャンセル用パスワードを入力してください。');
      return;
    }
    setIsCancelling(true);
    setCancelError('');
    try {
      const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: cancelTarget.ticketNumber, orderId: cancelTarget._id, status: 'cancelled', cancelPassword }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCancelError(data.message || '注文をキャンセルできませんでした。');
        await fetchOrders();
        return;
      }
      const completedTicketNumber = cancelTarget.ticketNumber;
      setOrders(prev => prev.map(o => o._id === cancelTarget._id ? { ...o, status: 'cancelled' } : o));
      setCancelTarget(null);
      setCancelPassword('');
      toggleModal('result', true, { title: 'キャンセル完了', message: `${completedTicketNumber}番の注文をキャンセルしました。`, type: 'success' });
      await fetchOrders();
    } catch (error) {
      console.error('注文キャンセルエラー:', error);
      setCancelError('通信エラーが発生しました。再度お試しください。');
      await fetchOrders();
    } finally {
      setIsCancelling(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    return orders.filter(order => filterStatus === 'all' ? true : order.status === filterStatus).sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0)); 
  }, [orders, filterStatus]);

  const hourlyStats = useMemo(() => {
    const stats = new Array(24).fill(0);
    if (!Array.isArray(filteredOrders)) return stats;
    filteredOrders.forEach(order => { 
      if (order.status === 'cancelled') return; // キャンセル分はカウントから除外
      if (!order.createdAt) return; 
      const date = new Date(order.createdAt); 
      if (isNaN(date.getTime())) return; 
      const hour = date.getHours(); 
      stats[hour]++; 
    });
    return stats;
  }, [filteredOrders]);

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans text-gray-900">
      
      {/* モーダル */}
      <SharedResultModal isOpen={modals.result} title={modalData.title || ''} message={modalData.message || ''} type={modalData.type || 'success'} onClose={() => toggleModal('result', false)} />
      <SharedConfirmModal isOpen={modals.confirm} message={modalData.message || ''} onConfirm={modalData.onConfirm || (() => {})} onCancel={() => toggleModal('confirm', false)} confirmLabel={modalData.confirmLabel} cancelLabel={modalData.cancelLabel} />
      <BaseModal isOpen={cancelTarget !== null} onClose={closeCancelModal} closeOnOverlayClick={!isCancelling}>
        <h3 className="text-xl font-bold text-gray-800 text-center mb-3">注文のキャンセル</h3>
        <p className="text-gray-600 text-center mb-4">{cancelTarget?.ticketNumber}番の注文をキャンセル（返金）扱いにします。<br />この操作は取り消せません。</p>
        <label className="block text-sm font-bold text-gray-700 mb-2" htmlFor="cancel-password">キャンセル用パスワード</label>
        <input id="cancel-password" type="password" value={cancelPassword} onChange={(event) => { setCancelPassword(event.target.value); setCancelError(''); }} onKeyDown={(event) => { if (event.key === 'Enter') void submitCancelOrder(); }} autoFocus disabled={isCancelling} className="w-full border-2 border-gray-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-red-400" />
        {cancelError && <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{cancelError}</p>}
        <div className="flex gap-3 mt-6">
          <button type="button" onClick={closeCancelModal} disabled={isCancelling} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold disabled:opacity-50">戻る</button>
          <button type="button" onClick={() => void submitCancelOrder()} disabled={isCancelling || !cancelPassword.trim()} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold disabled:opacity-50">{isCancelling ? '処理中...' : 'キャンセルする'}</button>
        </div>
      </BaseModal>

      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-800">注文履歴と管理</h1>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/order')} className="text-gray-500 hover:text-gray-700 font-bold px-4 py-2 bg-gray-100 rounded-lg transition mr-2">← 注文画面へ</button>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as OrderStatusFilter)} className="border border-gray-300 p-2 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]">
            <option value="all">全て表示</option>
            <option value="active">調理中</option>
            <option value="completed">完了済み</option>
            <option value="cancelled">キャンセル済み</option>
          </select>
          <button onClick={fetchOrders} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 shadow-sm"><span className="text-xl">↻</span></button>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span>📊</span> 時間帯別注文数 <span className="text-xs text-gray-500 font-normal">(キャンセル分を除く)</span>
        </h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {hourlyStats.map((count, hour) => (
            <div key={hour} className={`flex flex-col items-center justify-center p-2 rounded border ${count > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
              <span className="text-xs text-gray-500">{hour}:00</span>
              <span className={`text-lg font-bold ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{count}</span>
            </div>
          ))}
        </div>
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
              <tr key={order._id} className={order.status === 'active' ? 'bg-yellow-50' : order.status === 'cancelled' ? 'bg-gray-100 opacity-70' : 'hover:bg-gray-50 transition-colors'}>
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
                  ¥{order.totalAmount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`px-3 py-1 text-xs rounded-full font-bold shadow-sm ${
                    order.status === 'active' ? 'bg-red-100 text-red-800 border border-red-200' : 
                    order.status === 'completed' ? 'bg-green-100 text-green-800 border border-green-200' : 
                    'bg-gray-200 text-gray-600 border border-gray-300'
                  }`}>
                    {order.status === 'active' ? '調理中' : order.status === 'completed' ? '完了済み' : 'キャンセル'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    {order.status === 'active' && <button onClick={() => handleToggleStatus(order)} className="text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 hover:bg-green-100 font-bold transition shadow-sm">完了</button>}
                    {order.status !== 'cancelled' && <button onClick={() => handleCancelOrder(order)} className="text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100 font-bold transition shadow-sm">キャンセル</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
