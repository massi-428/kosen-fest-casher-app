"use client";

import { useState, useEffect, useCallback } from 'react';

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    if (typeof window !== 'undefined') {
      const userId = localStorage.getItem('currentUserId');
      if (userId) headers.set('x-user-id', userId);
    }
    return await fetch(absoluteUrl, { ...options, headers });
  } catch (e) {
    return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response;
  }
};

type CustomOption = { name: string; price: number; };
type OrderItem = { productName: string; price: number; quantity: number; amount: number; detail?: string; selectedOptions?: CustomOption[]; };
type Order = { _id: string; ticketNumber: string; items: OrderItem[]; totalAmount: number; status: 'active' | 'completed' | 'pending'; createdAt: string; note?: string; };

const OrderTicket = ({ order, onComplete, onPending, isPendingMode = false }: any) => {
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

  const headerStyles = {
    normal: "bg-gradient-to-br from-blue-600 to-blue-500 shadow-md shadow-blue-200 text-white",
    warning: "bg-gradient-to-br from-yellow-500 to-amber-500 shadow-md shadow-yellow-200 text-white",
    critical: "bg-gradient-to-br from-red-600 to-rose-600 shadow-md shadow-red-200 animate-pulse text-white",
    pending: "bg-gradient-to-br from-gray-500 to-gray-600 shadow-md shadow-gray-200 text-white",
  };
  const headerStyle = isPendingMode ? headerStyles.pending : headerStyles[alertLevel];

  return (
    <div className={`flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden border-2 h-full transition-all duration-300 hover:shadow-2xl ${isPendingMode ? 'border-gray-300 opacity-90 scale-[0.98]' : 'border-gray-100'}`}>
      <div className={`${headerStyle} p-2 flex justify-between items-center relative overflow-hidden`}>
        <div className="absolute -top-4 -right-4 w-16 h-16 bg-white opacity-10 rounded-full blur-xl pointer-events-none"></div>
        <div className="flex items-center gap-2 z-10 pl-1">
          <span className="text-[10px] font-bold uppercase tracking-widest border border-white/30 px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm h-fit self-start mt-1 opacity-90">No.</span>
          <span className="text-5xl font-black leading-none tracking-tighter drop-shadow-sm">{order.ticketNumber}</span>
        </div>
        <div className="flex flex-col items-end justify-center z-10 pl-3 border-l border-white/20 ml-2 pr-1">
          <span className="text-[9px] font-bold uppercase tracking-widest opacity-80 mb-0.5">{isPendingMode ? 'PENDING' : 'TIME'}</span>
          <span className="text-3xl font-mono font-bold leading-none tracking-tight drop-shadow-sm">{elapsedTime}</span>
        </div>
      </div>
      <div className="flex-1 p-3 bg-gray-50/50 flex flex-col">
        <ul className="space-y-3 mb-2">
          {order.items.map((item: any, idx: number) => (
            <li key={idx} className="border-b-2 border-dashed border-gray-200 pb-2 last:border-0">
              <div className="flex justify-between items-start">
                <span className="text-3xl font-bold text-gray-800 leading-tight w-3/4 break-words">{item.productName}</span>
                <span className="bg-gray-800 text-white px-3 py-1 rounded-lg text-3xl font-black min-w-[3.5rem] text-center shadow-sm">{item.quantity}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {item.selectedOptions && item.selectedOptions.map((opt: any, i: number) => (
                  <span key={i} className="text-sm bg-orange-50 text-orange-800 px-2 py-1 rounded border border-orange-200 font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>{opt.name}</span>
                ))}
                {item.detail && <div className="text-sm text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-200 font-bold w-full break-words flex items-start gap-1"><span className="text-blue-400 mt-0.5">✎</span>{item.detail}</div>}
              </div>
            </li>
          ))}
        </ul>
        {order.note && <div className="mt-auto pt-3"><div className="p-2 bg-yellow-50 border-2 border-yellow-200 rounded-lg text-gray-800 shadow-sm"><span className="block text-[9px] text-yellow-600 font-black mb-0.5 uppercase tracking-widest">NOTE</span><span className="text-base font-bold">{order.note}</span></div></div>}
      </div>
      <div className="p-2 bg-white border-t-2 border-gray-100 flex gap-2 h-20 items-center">
        {/* ★変更: 保留ボタンをシンプルな棒線二本（一時停止マーク）に変更 */}
        <button onClick={() => onPending(order._id, order.ticketNumber)} className={`h-full rounded-xl shadow-sm transition-all transform active:scale-95 text-white font-bold flex-1 flex flex-col justify-center items-center gap-0.5 ${isPendingMode ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 hover:bg-gray-500'}`}>
          {isPendingMode ? (
            // 復帰: 再生マーク風
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor">
               <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            // 保留: 棒線二本
            <div className="flex gap-1.5 h-6 items-center justify-center">
               <div className="w-2.5 h-6 bg-white rounded-sm"></div>
               <div className="w-2.5 h-6 bg-white rounded-sm"></div>
            </div>
          )}
          <span className="text-[10px]">{isPendingMode ? '復帰' : '保留'}</span>
        </button>

        <button onClick={() => onComplete(order._id, order.ticketNumber)} className="h-full flex-[3] bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-xl shadow-md transition-all transform active:scale-95 flex items-center justify-center gap-2 group"><span className="text-2xl font-black tracking-wider">DONE</span></button>
      </div>
    </div>
  );
};

export default function KitchenDisplaySystem() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch('/api/orders', { cache: 'no-store' });
      if (res.ok) {
        const data: Order[] = await res.json();
        const uniqueOrdersMap = new Map();
        data.forEach(order => { if (order._id) uniqueOrdersMap.set(String(order._id), order); });
        const uniqueOrders = Array.from(uniqueOrdersMap.values()) as Order[];
        setOrders(uniqueOrders.filter(o => o.status === 'active' || o.status === 'pending').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      }
    } catch (error) { console.error(error); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrders(); const interval = setInterval(fetchOrders, 5000); return () => clearInterval(interval); }, [fetchOrders]);

  const updateStatus = async (orderId: string, ticketNumber: string, newStatus: string) => {
    setOrders(prev => { if (newStatus === 'completed') return prev.filter(o => o._id !== orderId); return prev.map(o => o._id === orderId ? { ...o, status: newStatus as any } : o); });
    try { await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: String(ticketNumber), status: newStatus, orderId: orderId }), cache: 'no-store' }); setTimeout(fetchOrders, 500); } catch (e) { fetchOrders(); }
  };

  const activeOrders = orders.filter(o => o.status === 'active');
  const pendingOrders = orders.filter(o => o.status === 'pending');

  return (
    <div className="h-screen bg-gray-800 p-2 font-sans text-gray-100 flex gap-2 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex justify-between items-center mb-2 px-2">
          <h1 className="text-xl font-bold tracking-wider flex items-center gap-3"><span className="bg-blue-600 px-3 py-0.5 rounded text-white shadow-lg border border-blue-400 text-sm">KDS</span><span className="text-gray-300">COOKING</span><span className="bg-gray-700 px-2 py-0.5 rounded-full text-lg font-mono">{activeOrders.length}</span></h1>
          <button onClick={fetchOrders} className="bg-gray-700 hover:bg-gray-600 px-3 py-0.5 rounded border border-gray-500 ml-1 transition active:scale-95 text-[10px]">REFRESH</button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 pb-1">
          {activeOrders.length === 0 ? <div className="flex flex-col justify-center items-center h-full text-gray-600"><p className="text-3xl font-black opacity-20 tracking-widest">NO ACTIVE ORDERS</p></div> : 
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 pb-20">{activeOrders.map((order) => <div key={order._id} className="min-h-[350px] h-auto"><OrderTicket order={order} onComplete={(id: string, num: string) => updateStatus(id, num, 'completed')} onPending={(id: string, num: string) => updateStatus(id, num, 'pending')} /></div>)}</div>
          }
        </div>
      </div>
      <div className="w-72 bg-gray-900 border-l border-gray-700 flex flex-col shadow-2xl h-full">
        <div className="p-3 bg-gray-900 border-b border-gray-700"><h2 className="text-lg font-bold text-orange-400 flex items-center gap-2"><span>⚠️</span> PENDING ({pendingOrders.length})</h2></div>
        <div className="flex-1 overflow-y-auto p-2 space-y-3 bg-gray-900/50">{pendingOrders.map((order) => <div key={order._id} className="min-h-[250px] h-auto"><OrderTicket order={order} onComplete={(id: string, num: string) => updateStatus(id, num, 'completed')} onPending={(id: string, num: string) => updateStatus(id, num, 'active')} isPendingMode={true} /></div>)}</div>
      </div>
    </div>
  );
}