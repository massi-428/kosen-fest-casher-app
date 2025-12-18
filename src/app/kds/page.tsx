"use client";

import { useState, useEffect, useCallback } from 'react';

type CustomOption = {
  name: string;
  price: number;
};

type OrderItem = {
  productName: string;
  price: number;
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
  status: 'active' | 'completed' | 'pending';
  createdAt: string;
  note?: string; 
};

// 注文カードコンポーネント
const OrderTicket = ({ 
  order, 
  onComplete,
  onPending,
  isPendingMode = false
}: { 
  order: Order; 
  onComplete: (id: string, ticketNum: string) => void;
  onPending: (id: string, ticketNum: string) => void;
  isPendingMode?: boolean;
}) => {
  const [elapsedTime, setElapsedTime] = useState("");
  const [alertLevel, setAlertLevel] = useState<"normal" | "warning" | "critical">("normal");

  useEffect(() => {
    const updateTimer = () => {
      const start = new Date(order.createdAt).getTime();
      const now = new Date().getTime();
      const diff = Math.floor((now - start) / 1000);

      const mm = Math.floor(diff / 60).toString().padStart(2, '0');
      const ss = (diff % 60).toString().padStart(2, '0');
      setElapsedTime(`${mm}:${ss}`);

      if (!isPendingMode) {
        if (diff > 600) setAlertLevel("critical");
        else if (diff > 300) setAlertLevel("warning");
        else setAlertLevel("normal");
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order.createdAt, isPendingMode]);

  const headerColors = {
    normal: "bg-blue-600",
    warning: "bg-yellow-500",
    critical: "bg-red-600 animate-pulse",
  };

  const headerColor = isPendingMode ? "bg-gray-500" : headerColors[alertLevel];

  return (
    <div className={`flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border-4 h-full ${isPendingMode ? 'border-gray-400 opacity-90' : 'border-gray-200'}`}>
      {/* ヘッダー */}
      <div className={`${headerColor} text-white p-3 flex justify-between items-center transition-colors duration-500`}>
        <div className="flex flex-col leading-none">
          <span className="text-sm opacity-90 font-bold tracking-wider">CALL NO.</span>
          <span className="text-6xl font-black tracking-tighter">{order.ticketNumber}</span>
        </div>
        <div className="text-right">
          <span className="text-sm opacity-90 block font-bold">{isPendingMode ? 'PENDING' : 'ELAPSED'}</span>
          <span className="text-4xl font-mono font-bold">{elapsedTime}</span>
        </div>
      </div>

      {/* 注文内容: 全件表示 */}
      <div className="flex-1 p-4 bg-gray-50 flex flex-col">
        <ul className="space-y-4 mb-2">
          {order.items.map((item, idx) => (
            <li key={idx} className="border-b-2 border-gray-200 pb-2 last:border-0">
              <div className="flex justify-between items-start">
                <span className="text-3xl font-bold text-gray-800 leading-tight w-3/4 break-words">
                  {item.productName}
                </span>
                <span className="bg-gray-800 text-white px-3 py-1 rounded-lg text-3xl font-black min-w-[3.5rem] text-center shadow-sm">
                  {item.quantity}
                </span>
              </div>
              
              {/* オプション・詳細表示 */}
              <div className="flex flex-wrap gap-2 mt-2">
                {item.selectedOptions && item.selectedOptions.map((opt, i) => (
                  <span key={i} className="text-lg bg-orange-100 text-orange-900 px-2 py-0.5 rounded border border-orange-300 font-bold">
                    {opt.name}
                  </span>
                ))}
                {item.detail && (
                  <div className="text-lg text-blue-800 bg-blue-100 px-2 py-0.5 rounded border border-blue-200 font-bold w-full break-words">
                    {item.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* 備考欄 */}
        {order.note && (
          <div className="mt-auto pt-4">
            <div className="p-2 bg-yellow-100 border-2 border-yellow-400 rounded-lg text-gray-900 text-lg font-bold shadow-sm">
              <span className="block text-xs text-yellow-800 font-black mb-1 uppercase">Memo</span>
              {order.note}
            </div>
          </div>
        )}
      </div>

      {/* フッター操作ボタン */}
      <div className="p-3 bg-white border-t-2 border-gray-200 flex gap-3 h-24">
        <button
          onClick={() => onPending(order._id, order.ticketNumber)}
          className={`rounded-xl shadow-md transition-transform transform active:scale-95 text-white font-bold flex-1 flex justify-center items-center ${isPendingMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-500 hover:bg-orange-600'}`}
          title={isPendingMode ? "調理列に戻す" : "保留（不在）にする"}
        >
          {isPendingMode ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </button>

        <button
          onClick={() => onComplete(order._id, order.ticketNumber)}
          className="flex-[3] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-4xl font-black rounded-xl shadow-md transition-transform transform active:scale-95 flex justify-center items-center gap-3"
        >
          <span>DONE</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default function KitchenDisplaySystem() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/orders', { cache: 'no-store' });
      if (res.ok) {
        const data: Order[] = await res.json();
        
        // 重複IDを除去
        const uniqueOrdersMap = new Map();
        data.forEach(order => {
          if (order._id) uniqueOrdersMap.set(String(order._id), order);
        });
        const uniqueOrders = Array.from(uniqueOrdersMap.values()) as Order[];

        // activeとpendingのみ取得し、古い順に並べる
        const relevantOrders = uniqueOrders
          .filter(o => o.status === 'active' || o.status === 'pending')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        setOrders(relevantOrders);
      }
    } catch (error) {
      console.error("注文取得エラー", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); 
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const updateStatus = async (orderId: string, ticketNumber: string, newStatus: string) => {
    setOrders(prev => {
      if (newStatus === 'completed') return prev.filter(o => o._id !== orderId);
      return prev.map(o => o._id === orderId ? { ...o, status: newStatus as any } : o);
    });

    try {
      const res = await fetch('/api/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ticketNumber: String(ticketNumber), 
          status: newStatus,
          orderId: orderId 
        }),
        cache: 'no-store'
      });

      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      setTimeout(fetchOrders, 500);

    } catch (error) {
      console.error("更新エラー:", error);
      alert("更新に失敗しました。再読み込みします。");
      fetchOrders();
    }
  };

  const handleComplete = (id: string, ticketNum: string) => updateStatus(id, ticketNum, 'completed');
  const handlePending = (id: string, ticketNum: string) => updateStatus(id, ticketNum, 'pending');
  const handleRestore = (id: string, ticketNum: string) => updateStatus(id, ticketNum, 'active');

  const activeOrders = orders.filter(o => o.status === 'active');
  const pendingOrders = orders.filter(o => o.status === 'pending');

  return (
    <div className="h-screen bg-gray-800 p-4 font-sans text-gray-100 flex gap-4 overflow-hidden">
      
      {/* --- メインエリア (調理中) --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex justify-between items-center mb-4 px-2">
          <h1 className="text-3xl font-bold tracking-wider flex items-center gap-4">
            <span className="bg-blue-600 px-4 py-1 rounded text-white shadow-lg">KDS</span>
            COOKING ({activeOrders.length})
          </h1>
          <div className="flex gap-6 text-base font-mono font-bold">
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-blue-600 rounded-full border border-white"></span><span>Normal</span></div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-500 rounded-full border border-white"></span><span>&gt; 5m</span></div>
            <div className="flex items-center gap-2"><span className="w-4 h-4 bg-red-600 rounded-full animate-pulse border border-white"></span><span>&gt; 10m</span></div>
            <button onClick={fetchOrders} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg border-2 border-gray-500 ml-4 transition active:scale-95">REFRESH</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 pb-2">
          {loading && activeOrders.length === 0 ? (
            <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-blue-500"></div></div>
          ) : activeOrders.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-full text-gray-500">
              <p className="text-3xl font-bold opacity-30">NO ACTIVE ORDERS</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
              {activeOrders.map((order) => (
                // ★高さ変更: 固定高さを廃止し、内容に合わせて伸びるように変更 (min-h-[400px])
                <div key={order._id} className="min-h-[400px] h-auto">
                  <OrderTicket order={order} onComplete={handleComplete} onPending={handlePending} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --- サブエリア (保留/不在) --- */}
      <div className="w-96 bg-gray-900 border-l-2 border-gray-700 flex flex-col shadow-2xl h-full">
        <div className="p-5 bg-gray-900 border-b-2 border-gray-700">
          <h2 className="text-2xl font-bold text-orange-400 flex items-center gap-3">
            <span>⚠️</span> PENDING ({pendingOrders.length})
          </h2>
          <p className="text-sm text-gray-500 mt-1 font-bold">不在・保留中の注文</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-gray-900/50">
          {pendingOrders.length === 0 ? (
            <p className="text-center text-gray-600 mt-20 text-lg font-bold">保留中の注文はありません</p>
          ) : (
            pendingOrders.map((order) => (
              <div key={order._id} className="min-h-[300px] h-auto">
                <OrderTicket 
                  order={order} 
                  onComplete={handleComplete} 
                  onPending={handleRestore} 
                  isPendingMode={true} 
                />
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}