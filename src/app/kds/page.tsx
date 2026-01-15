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

  // スタイリッシュなグラデーションとシャドウ
  const headerStyles = {
    normal: "bg-gradient-to-br from-blue-600 to-blue-500 shadow-md shadow-blue-200",
    warning: "bg-gradient-to-br from-yellow-500 to-amber-500 shadow-md shadow-yellow-200",
    critical: "bg-gradient-to-br from-red-600 to-rose-600 shadow-md shadow-red-200 animate-pulse",
    pending: "bg-gradient-to-br from-gray-500 to-gray-600 shadow-md shadow-gray-200",
  };

  const headerStyle = isPendingMode ? headerStyles.pending : headerStyles[alertLevel];

  return (
    <div className={`flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border-2 h-full transition-all duration-300 hover:shadow-2xl ${isPendingMode ? 'border-gray-300 opacity-90 scale-[0.98]' : 'border-gray-100'}`}>
      
      {/* ヘッダー: コンパクト化 (p-4 -> p-2, text-size縮小) */}
      <div className={`${headerStyle} text-white p-2 flex justify-between items-center relative overflow-hidden`}>
        {/* 背景装飾 */}
        <div className="absolute -top-4 -right-4 w-16 h-16 bg-white opacity-10 rounded-full blur-xl pointer-events-none"></div>

        {/* 番号部分 */}
        <div className="flex items-center gap-2 z-10 pl-1">
          <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm h-fit self-start mt-1">No.</span>
          <span className="text-5xl font-black leading-none tracking-tighter drop-shadow-md">
            {order.ticketNumber}
          </span>
        </div>

        {/* 時間部分 */}
        <div className="flex flex-col items-end justify-center z-10 pl-3 border-l border-white/20 ml-2 pr-1">
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-90 mb-0.5 flex items-center gap-1">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             {isPendingMode ? 'PENDING' : 'TIME'}
          </span>
          <span className="text-3xl font-mono font-bold leading-none tracking-tight drop-shadow-sm">
            {elapsedTime}
          </span>
        </div>
      </div>

      {/* 注文内容: 全件表示 */}
      <div className="flex-1 p-3 bg-gray-50/50 flex flex-col">
        <ul className="space-y-3 mb-2">
          {order.items.map((item, idx) => (
            <li key={idx} className="border-b-2 border-dashed border-gray-200 pb-2 last:border-0">
              <div className="flex justify-between items-start">
                <span className="text-3xl font-bold text-gray-800 leading-tight w-3/4 break-words">
                  {item.productName}
                </span>
                <span className="bg-gray-800 text-white px-3 py-1 rounded-lg text-3xl font-black min-w-[3.5rem] text-center shadow-sm">
                  {item.quantity}
                </span>
              </div>
              
              {/* オプション・詳細表示 */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {item.selectedOptions && item.selectedOptions.map((opt, i) => (
                  <span key={i} className="text-sm bg-orange-50 text-orange-800 px-2 py-1 rounded border border-orange-200 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                    {opt.name}
                  </span>
                ))}
                {item.detail && (
                  <div className="text-sm text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200 font-bold w-full break-words flex items-start gap-1">
                    <span className="text-blue-400 mt-0.5">✎</span>
                    {item.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* 備考欄 */}
        {order.note && (
          <div className="mt-auto pt-3">
            <div className="p-2 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-gray-800 shadow-sm">
              <span className="block text-[9px] text-yellow-600 font-black mb-0.5 uppercase tracking-widest flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                Note
              </span>
              <span className="text-base font-bold">{order.note}</span>
            </div>
          </div>
        )}
      </div>

      {/* フッター操作ボタン */}
      <div className="p-2 bg-white border-t-2 border-gray-100 flex gap-2 h-20 items-center">
        <button
          onClick={() => onPending(order._id, order.ticketNumber)}
          className={`h-full rounded-xl shadow-sm transition-all transform active:scale-95 text-white font-bold flex-1 flex flex-col justify-center items-center gap-0.5 ${isPendingMode ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 hover:bg-gray-500'}`}
          title={isPendingMode ? "調理列に戻す" : "保留（不在）にする"}
        >
          {isPendingMode ? (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="text-[10px]">復帰</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[10px]">保留</span>
            </>
          )}
        </button>

        <button
          onClick={() => onComplete(order._id, order.ticketNumber)}
          className="h-full flex-[3] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl shadow-md transition-all transform active:scale-95 flex items-center justify-center gap-2 group"
        >
          <span className="text-2xl font-black tracking-wider">DONE</span>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    <div className="h-screen bg-gray-800 p-2 font-sans text-gray-100 flex gap-2 overflow-hidden">
      
      {/* --- メインエリア (調理中) --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex justify-between items-center mb-2 px-2">
          <h1 className="text-xl font-bold tracking-wider flex items-center gap-3">
            <span className="bg-blue-600 px-3 py-0.5 rounded text-white shadow-lg border border-blue-400 text-sm">KDS</span>
            <span className="text-gray-300">COOKING</span>
            <span className="bg-gray-700 px-2 py-0.5 rounded-full text-lg font-mono">{activeOrders.length}</span>
          </h1>
          <div className="flex gap-4 text-xs font-mono font-bold bg-gray-900/50 p-1.5 rounded-lg border border-gray-700">
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-600 rounded-full border border-white/50"></span><span>Normal</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-yellow-500 rounded-full border border-white/50"></span><span>&gt; 5m</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse border border-white/50"></span><span>&gt; 10m</span></div>
            <button onClick={fetchOrders} className="bg-gray-700 hover:bg-gray-600 px-3 py-0.5 rounded border border-gray-500 ml-1 transition active:scale-95 text-[10px]">REFRESH</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 pb-1 custom-scrollbar">
          {loading && activeOrders.length === 0 ? (
            <div className="flex justify-center items-center h-full"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-500"></div></div>
          ) : activeOrders.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-full text-gray-600">
              <p className="text-3xl font-black opacity-20 tracking-widest">NO ACTIVE ORDERS</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 pb-20">
              {activeOrders.map((order) => (
                <div key={order._id} className="min-h-[350px] h-auto">
                  <OrderTicket order={order} onComplete={handleComplete} onPending={handlePending} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --- サブエリア (保留/不在) --- */}
      <div className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col shadow-2xl h-full">
        <div className="p-3 bg-gray-900 border-b border-gray-700">
          <h2 className="text-lg font-bold text-orange-400 flex items-center gap-2">
            <span>⚠️</span> PENDING ({pendingOrders.length})
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5 font-bold">不在・保留中の注文</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-3 bg-gray-900/50">
          {pendingOrders.length === 0 ? (
            <p className="text-center text-gray-600 mt-20 text-sm font-bold opacity-50">保留中の注文はありません</p>
          ) : (
            pendingOrders.map((order) => (
              <div key={order._id} className="min-h-[250px] h-auto">
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