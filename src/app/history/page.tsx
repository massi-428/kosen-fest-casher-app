"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';

type CustomOption = {
  name: string;
  price: number;
};

// 型定義
type OrderItem = {
  productName: string;
  quantity: number;
  amount: number;
  detail?: string;
  selectedOptions?: CustomOption[];
};

type Order = {
  _id: string;
  ticketNumber: string;
  items: OrderItem[];
  totalAmount: number;
  status: 'active' | 'completed';
  paymentMethod?: string;
  note?: string; 
  createdAt: string;
};

export default function HistoryPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all');
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchOrders = useCallback(async () => {
    try {
      setErrorMsg("");
      const res = await fetch('/api/orders', { cache: 'no-store' }); 
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOrders(data);
          setLastUpdated(new Date().toLocaleTimeString());
        } else {
          setOrders([]); 
          setErrorMsg("システムエラー: APIが正しいデータを返していません。管理者に連絡してください。");
        }
      } else {
        setErrorMsg(`データの取得に失敗しました (${res.status})`);
      }
    } catch (error) {
      setErrorMsg("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const toggleStatus = async (order: Order) => {
    const newStatus = order.status === 'active' ? 'completed' : 'active';
    const action = newStatus === 'completed' ? '返却' : 'アクティブ化';
    if (!confirm(`${order.ticketNumber}番の注文を【${action}】しますか？`)) return;
    
    setOrders(prev => prev.map(o => o._id === order._id ? { ...o, status: newStatus } : o));
    
    try {
      if (newStatus === 'completed') {
        await fetch('/api/tickets', { 
          method: 'PUT', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ ticketNumber: order.ticketNumber, orderId: order._id })
        });
      }
      setTimeout(fetchOrders, 500); 
    } catch (error) { 
      alert("更新に失敗しました"); 
      fetchOrders(); 
    }
  };

  const filteredOrders = useMemo(() => {
    if (!Array.isArray(orders)) return [];
    return orders
      .filter(order => {
        if (filterStatus === 'all') return true;
        return order.status === filterStatus;
      })
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return (dateB || 0) - (dateA || 0);
      }); 
  }, [orders, filterStatus]);

  const hourlyStats = useMemo(() => {
    const stats = new Array(24).fill(0);
    if (!Array.isArray(filteredOrders)) return stats;
    filteredOrders.forEach(order => {
      if (!order.createdAt) return;
      const date = new Date(order.createdAt);
      if (isNaN(date.getTime())) return;
      const hour = date.getHours();
      stats[hour]++;
    });
    return stats;
  }, [filteredOrders]);

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans">
      
      <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-md">
        <h1 className="text-3xl font-bold text-gray-800">注文履歴と管理</h1>
        <div className="flex items-center gap-4">
          {/* 注文画面へ戻るボタンを追加 */}
          <button 
            onClick={() => router.push('/order')}
            className="text-gray-500 hover:text-gray-700 font-bold px-4 py-2 bg-gray-100 rounded-lg transition mr-2"
          >
            ← 注文画面へ
          </button>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'completed')} className="border border-gray-300 p-2 rounded-lg">
            <option value="all">全て表示</option>
            <option value="active">調理中 (未完了)</option>
            <option value="completed">完了済み (返却済み)</option>
          </select>
          <button onClick={fetchOrders} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2"><span className="text-xl">↻</span></button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">エラーが発生しました</p>
          <p>{errorMsg}</p>
        </div>
      )}

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">
        <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2"><span>📊</span> 時間帯別注文数 (現在表示中のデータ)</h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {hourlyStats.map((count, hour) => (
            <div key={hour} className={`flex flex-col items-center justify-center p-2 rounded border ${count > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100 opacity-50'}`}>
              <span className="text-xs text-gray-500">{hour}:00</span>
              <span className={`text-lg font-bold ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-4">表示件数: {filteredOrders.length} 件 (最終更新: {lastUpdated})</p>

      <div className="bg-white rounded-xl shadow-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">番号</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">注文日時</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品名と品数</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">決済</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading && orders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">データを読み込み中...</td></tr>
            ) : filteredOrders.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-500">該当する注文履歴はありません</td></tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order._id} className={order.status === 'active' ? 'bg-yellow-50 hover:bg-yellow-100' : 'hover:bg-gray-50'}>
                  <td className="px-6 py-4 whitespace-nowrap text-xl font-bold text-gray-900">{order.ticketNumber}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    {order.createdAt ? new Date(order.createdAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    <ul className="list-disc pl-4 space-y-0.5">
                      {order.items && order.items.map((item, idx) => (
                        <li key={idx} className="text-xs">
                          {item.productName} × {item.quantity}
                          {/* 詳細表示 */}
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {item.selectedOptions && item.selectedOptions.map((opt, i) => (
                              <span key={i} className="bg-orange-50 text-orange-800 px-1 rounded text-[10px] border border-orange-200">
                                {opt.name}{opt.price > 0 && `(+${opt.price})`}
                              </span>
                            ))}
                            {item.detail && <span className="text-[10px] text-blue-600 font-bold ml-1">({item.detail})</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                    {order.note && (
                      <div className="mt-2 text-xs bg-yellow-50 text-yellow-700 p-1 rounded border border-yellow-200 inline-block">
                        📝 {order.note}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-base font-bold text-gray-800">¥{order.totalAmount.toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-600">{order.paymentMethod || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${order.status === 'active' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{order.status === 'active' ? '調理中' : '完了済'}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      {order.status === 'active' && (
                        <button onClick={() => toggleStatus(order)} className="text-green-600 hover:text-green-900 bg-green-50 px-3 py-1 rounded-lg border border-green-200 transition">完了/返却</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}