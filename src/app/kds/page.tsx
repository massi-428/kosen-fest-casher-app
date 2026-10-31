"use client";

import { useRef, useState, useEffect, useCallback } from 'react';
import { summarizeKitchenOrders, wrapKitchenText } from '@/lib/kds-display';
import { startBrowserPolling } from '@/lib/polling';
import styles from './kds.module.css';

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  } catch {
    return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response;
  }
};

type CustomOption = { name: string; price: number; };
type OrderItem = { productId?: string; productName: string; price: number; quantity: number; amount: number; detail?: string; selectedOptions?: CustomOption[]; };
type Order = { revision?: number; _id: string; ticketNumber: string; items: OrderItem[]; totalAmount: number; status: 'active' | 'completed' | 'pending'; createdAt: string; note?: string; };
type OrderStatus = Order['status'];
type OrderTicketProps = {
  order: Order;
  onComplete: (orderId: string, ticketNumber: string) => void;
  onPending: (orderId: string, ticketNumber: string) => void;
  busy?: boolean;
};

function Pager({ page, count, onChange, label }: { page: number; count: number; onChange: (page: number) => void; label: string }) {
  return <div className="flex items-center justify-center gap-2 text-xs shrink-0">
    <button type="button" aria-label={`${label}の前ページ`} disabled={page === 0} onClick={() => onChange(page - 1)} className="ui-button ui-button--secondary px-2 py-1 disabled:opacity-25">←</button>
    <span className="tabular-nums">{page + 1} / {count}</span>
    <button type="button" aria-label={`${label}の次ページ`} disabled={page + 1 >= count} onClick={() => onChange(page + 1)} className="ui-button ui-button--secondary px-2 py-1 disabled:opacity-25">→</button>
  </div>;
}

const OrderTicket = ({ order, onComplete, onPending, busy = false }: OrderTicketProps) => {
  const [seconds, setSeconds] = useState(0);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState({ columns: 12, rows: 3 });
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [order.createdAt]);
  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const fontSize = parseFloat(style.fontSize);
      const lineHeight = parseFloat(style.lineHeight);
      setSize({ columns: Math.max(1, Math.floor((element.clientWidth - 4) / (fontSize * 1.06))), rows: Math.max(1, Math.floor(element.clientHeight / lineHeight)) });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const lines = order.items.flatMap(item => [
    ...wrapKitchenText(`${item.productName} ×${item.quantity}`, size.columns).map(text => ({ text, kind: 'product' })),
    ...(item.selectedOptions?.length ? wrapKitchenText(item.selectedOptions.map(option => option.name).join(' / '), size.columns).map(text => ({ text, kind: 'option' })) : []),
    ...(item.detail ? wrapKitchenText(`メモ: ${item.detail}`, size.columns).map(text => ({ text, kind: 'note' })) : []),
  ]);
  if (order.note) lines.push(...wrapKitchenText(`注文メモ: ${order.note}`, size.columns).map(text => ({ text, kind: 'note' })));
  const count = Math.max(1, Math.ceil(lines.length / size.rows));
  const current = Math.min(page, count - 1);
  const color = seconds > 600 ? 'bg-red-600' : seconds > 300 ? 'bg-amber-500' : 'bg-blue-600';
  return <article className="relative h-full min-h-0 min-w-0 flex flex-col overflow-hidden rounded-xl bg-white text-gray-900 border border-white/15 shadow-sm">
    <button type="button" disabled={busy} aria-busy={busy} aria-label={`整理券${order.ticketNumber}番を提供済みにする`} onClick={() => onComplete(order._id, order.ticketNumber)} className="absolute inset-0 z-10 rounded-xl cursor-pointer hover:bg-amber-500/10 active:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-amber-400 disabled:cursor-wait disabled:bg-gray-500/20" />
    <header className={`${color} text-white flex items-center justify-between px-3 py-1.5 shrink-0 gap-2`}>
      <span className={`${styles.ticketNumber} font-black leading-none tabular-nums`}>{order.ticketNumber}</span>
      <span className={`${styles.timer} font-mono font-bold`}>{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</span>
    </header>
    <div ref={bodyRef} className={`${styles.ticketBody} flex-1 min-h-0 overflow-hidden mx-3 mt-1.5`} aria-label={`整理券${order.ticketNumber}番の商品内容`}>
      {lines.slice(current * size.rows, (current + 1) * size.rows).map((line, i) => <p key={`${current}-${i}`} className={`whitespace-pre ${line.kind === 'product' ? 'font-bold text-gray-900' : line.kind === 'option' ? 'text-orange-800' : 'text-blue-800'}`}>{line.text || '\u00a0'}</p>)}
    </div>
    <div className="h-12 flex items-center justify-center shrink-0 text-gray-500">{count > 1 ? <div className="relative z-20"><Pager page={current} count={count} onChange={setPage} label={`整理券${order.ticketNumber}番の内容`} /></div> : <span className="text-xs">{order.items.reduce((sum, item) => sum + item.quantity, 0)}点</span>}</div>
    <footer className="grid grid-cols-[1fr_2fr] gap-1.5 p-1.5 pt-0 shrink-0">
      <button type="button" disabled={busy} onClick={() => onPending(order._id, order.ticketNumber)} className="ui-button ui-button--secondary relative z-20 py-1.5 text-xs disabled:opacity-40">保留</button>
      <span className="ui-button ui-button--primary text-xs">{busy ? '更新中…' : '押して提供済みにする'}</span>
    </footer>
  </article>;
};
export default function KitchenDisplaySystem() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderPage, setOrderPage] = useState(0);
  const [summaryPage, setSummaryPage] = useState(0);
  const [pendingPage, setPendingPage] = useState(0);
  const [pendingOpen, setPendingOpen] = useState(false);
  const pendingButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pendingOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPendingOpen(false); pendingButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pendingOpen]);

  const [lastUpdated, setLastUpdated] = useState('');
  const [fetchError, setFetchError] = useState('');
  const [operationError, setOperationError] = useState('');
  const busyRef = useRef(new Set<string>());
  const [busy, setBusy] = useState<string[]>([]);

  const pollerRef = useRef<ReturnType<typeof startBrowserPolling> | null>(null);
  const loadOrders = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) controller.abort();
    const timeout = setTimeout(cancel, 15000);
    try {
      const res = await apiFetch('/api/orders?scope=open', { cache: 'no-store', signal: controller.signal });
      if (signal.aborted) return false;
      if (!res.ok) throw new Error('注文を取得できません。最後に取得した内容を表示しています。');
      if (res.ok) {
        const data: Order[] = await res.json();
        if (signal.aborted) return false;
        if (!Array.isArray(data) || !data.every(order => order && typeof order._id === 'string' && Array.isArray(order.items) && Number.isFinite(new Date(order.createdAt).getTime()) && order.items.every(item => item && typeof item.productName === 'string' && Number.isFinite(item.quantity)))) throw new Error('注文の形式が正しくありません。');
        setLastUpdated(new Date().toLocaleTimeString()); setFetchError('');
        const uniqueOrdersMap = new Map<string, Order>();
        data.forEach(order => { if (order._id) uniqueOrdersMap.set(String(order._id), order); });
        const uniqueOrders = Array.from(uniqueOrdersMap.values()) as Order[];
        setOrders(uniqueOrders.filter(o => o.status === 'active' || o.status === 'pending').sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      }
      return true;
    } catch (error) {
      if (!signal.aborted) setFetchError(error instanceof Error ? error.message : '通信エラー');
      return false;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const poller = startBrowserPolling(loadOrders);
    pollerRef.current = poller;
    return () => { poller.stop(); pollerRef.current = null; };
  }, [loadOrders]);
  const fetchOrders = useCallback(() => pollerRef.current?.refresh(true) ?? Promise.resolve(), []);

  const updateStatus = async (orderId: string, ticketNumber: string, newStatus: OrderStatus) => {
    if (busyRef.current.has(orderId)) return;
    const order = orders.find(o => o._id === orderId);
    if (!order) return;
    busyRef.current.add(orderId); setBusy([...busyRef.current]); setOperationError('');
    try {
      const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber, status: newStatus, orderId, expectedRevision: order.revision || 0 }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || '更新結果を確認できません。'); }
    } catch (error) { setOperationError((error instanceof Error ? error.message : '通信エラー') + ' 最新状態を確認し、必要なら再試行してください。'); }
    finally { await fetchOrders(); busyRef.current.delete(orderId); setBusy([...busyRef.current]); }
  };

  const activeOrders = orders.filter(o => o.status === 'active');
  const pendingOrders = orders.filter(o => o.status === 'pending');
  const orderPages = Math.max(1, Math.ceil(activeOrders.length / 6));
  const currentOrderPage = Math.min(orderPage, orderPages - 1);
  const summary = summarizeKitchenOrders(orders);
  const summaryPages = Math.max(1, Math.ceil(summary.length / 6));
  const currentSummaryPage = Math.min(summaryPage, summaryPages - 1);
  const pendingPages = Math.max(1, Math.ceil(pendingOrders.length / 9));
  const currentPendingPage = Math.min(pendingPage, pendingPages - 1);

  return (
    <div className={`${styles.screen} terminal-screen fixed inset-0 w-full h-dvh bg-gray-800 p-2 font-sans text-gray-100 flex gap-2 overflow-hidden overscroll-none`}>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div className="flex justify-between items-center mb-2 px-2">
          <h1 className="text-xl font-bold flex items-center gap-3">調理画面<span className="bg-gray-700 px-2 py-0.5 rounded-full text-sm">調理中 {activeOrders.length}件</span></h1>
        </div>
        <div className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded bg-gray-900 px-2 py-1 text-xs">
          <div role="status" className="min-w-0">
            <p>最終更新: {lastUpdated || '未取得'}{loading && ' ／更新中…'}</p>
            {(fetchError || operationError) && <p className="text-red-300">{fetchError || operationError}</p>}
          </div>
          <button type="button" onClick={() => void pollerRef.current?.refresh()} disabled={loading} aria-busy={loading} aria-label="注文を再読み込み" title="再読み込み" className="ui-button ui-button--secondary h-11 w-11 p-0 shrink-0">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.55-1.65L20 8M4 16l2.35 2.65A7 7 0 0 0 17.9 17" /></svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeOrders.length === 0 ? <div className="flex flex-col justify-center items-center h-full text-gray-600"><p className="text-3xl font-black opacity-20 tracking-widest">{loading ? '読み込み中…' : fetchError ? '取得できません' : '調理中の注文はありません'}</p></div> :
            <div className="h-full min-h-0 grid grid-cols-2 grid-rows-3 lg:grid-cols-3 lg:grid-rows-2 gap-2">{activeOrders.slice(currentOrderPage * 6, currentOrderPage * 6 + 6).map((order) => <OrderTicket key={order._id} busy={busy.includes(order._id)} order={order} onComplete={(id: string, num: string) => updateStatus(id, num, 'completed')} onPending={(id: string, num: string) => updateStatus(id, num, 'pending')} />)}</div>
          }
        </div>
        <div className="pt-2 shrink-0"><Pager page={currentOrderPage} count={orderPages} onChange={setOrderPage} label="調理中の注文" /></div>
      </div>
      <aside className={`${styles.summary} w-48 xl:w-64 shrink-0 min-h-0 rounded-xl bg-gray-900 border border-gray-700 flex flex-col p-3 gap-2`} aria-label="商品別注文数量">
        <h2 className="font-bold text-lg">商品別注文数</h2>
        <p className="text-xs text-gray-400">全ページの未完了注文を集計</p>
        <div className="grid grid-cols-3 gap-1 text-center text-[10px] text-gray-400"><span>調理中</span><span>保留</span><span>合計</span></div>
        <div className="flex-1 min-h-0 grid grid-rows-6 gap-1">
          {summary.slice(currentSummaryPage * 6, currentSummaryPage * 6 + 6).map(row => <div key={row.key} className="min-h-0 rounded-lg bg-gray-800 px-2 py-1 flex flex-col justify-center">
            <p className="truncate text-sm font-bold" title={row.name}>{row.name}</p>
            <div className="grid grid-cols-3 text-center font-black tabular-nums text-xl leading-tight"><span className="text-blue-300">{row.active}</span><span className="text-orange-300">{row.pending}</span><span>{row.active + row.pending}</span></div>
          </div>)}
          {summary.length === 0 && <p className="text-xs text-gray-400">{fetchError ? '取得できません' : loading ? '読み込み中…' : '未完了の注文はありません'}</p>}
        </div>
        <Pager page={currentSummaryPage} count={summaryPages} onChange={setSummaryPage} label="商品別注文数" />
        <button ref={pendingButton} type="button" aria-expanded={pendingOpen} aria-controls="pending-orders" onClick={() => setPendingOpen(open => !open)} className="ui-button ui-button--secondary shrink-0 flex justify-between items-center gap-2 px-3 py-2 focus-visible:ring-4 focus-visible:ring-orange-200"><span>保留注文</span><span className="text-2xl tabular-nums" aria-live="polite">{pendingOrders.length}</span></button>
      </aside>
      {pendingOpen && <section id="pending-orders" aria-labelledby="pending-orders-heading" className="fixed bottom-24 right-4 z-40 w-[min(24rem,calc(100vw-2rem))] max-h-[calc(100dvh-7rem)] flex flex-col rounded-2xl border border-orange-400/50 bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-gray-700 p-3">
          <h2 id="pending-orders-heading" className="font-bold text-orange-300">保留中の注文（{pendingOrders.length}件）</h2>
          <button type="button" aria-label="保留中の注文を閉じる" className="ui-button ui-button--secondary px-3 py-2 focus-visible:ring-2 focus-visible:ring-orange-300" onClick={() => { setPendingOpen(false); pendingButton.current?.focus(); }}>✕</button>
        </div>
        <div className="overflow-hidden p-3 space-y-3">
          <p className="text-xs text-gray-400">整理券番号を押すと調理中に復帰します。</p>
          {(fetchError || operationError) && <p role="alert" className="text-sm text-red-300">{fetchError || operationError}</p>}
          {pendingOrders.length === 0 ? <p className="py-6 text-center text-gray-400">保留中の注文はありません。</p> : <div className="grid grid-cols-3 gap-2">
            {pendingOrders.slice(currentPendingPage * 9, currentPendingPage * 9 + 9).map(order => <button key={order._id} type="button" disabled={busy.includes(order._id)} aria-label={`整理券${order.ticketNumber}番を調理中に復帰`} aria-busy={busy.includes(order._id)} onClick={() => void updateStatus(order._id, order.ticketNumber, 'active')} className="ui-button ui-button--secondary min-h-16 min-w-0 px-2 py-3 text-4xl tabular-nums tracking-tight text-orange-950 disabled:opacity-40 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400 break-all">{order.ticketNumber}</button>)}
          </div>}
          <Pager page={currentPendingPage} count={pendingPages} onChange={setPendingPage} label="保留注文" />
        </div>
      </section>}
    </div>
  );
}
