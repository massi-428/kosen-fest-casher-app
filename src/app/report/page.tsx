"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';

import { isSalesOrder, type Settlement } from '@/lib/order-accounting';
import { BusinessDayPanel } from '@/components/common/BusinessDayPanel';

// --- ユーティリティ ---
const useRouter = () => ({
  push: (path: string) => {
    if (typeof window !== 'undefined') window.location.href = path;
  },
});

// 認証ヘッダー付きのFetch関数
const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' 
      ? window.location.origin 
      : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    
    const headers = new Headers(options.headers || {});
    
    return await fetch(absoluteUrl, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  } catch (e) {
    console.error("Fetch error:", e);
    return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response;
  }
};

type CustomOption = {
  name: string;
  price: number;
};

type OrderItem = {
  productName: string;
  quantity: number;
  amount: number;
  detail?: string;
  selectedOptions?: CustomOption[];
};

type Order = {
  settlements?: Settlement[];
  _id: string;
  ticketNumber: string;
  items: OrderItem[];
  totalAmount: number;
  paymentMethod?: string;
  receivedAmount?: number | null;
  changeAmount?: number | null;
  status?: string;
  note?: string;
  createdAt: string;
};

// 今日の日付を YYYY-MM-DD 形式で取得するヘルパー
const getTodayString = () => {
  return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
};

export default function ReportPage() {
  const router = useRouter();
  const [date, setDate] = useState(getTodayString());
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedDate, setLoadedDate] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const fetchSequence = useRef(0);
  const [isExporting, setIsExporting] = useState(false);

  // ログインチェック
  useEffect(() => {
    const checkSession = async () => {
      const res = await apiFetch('/api/me', { cache: 'no-store' });
      if (!res.ok) router.push('/login');
    };
    checkSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // データ取得
  const fetchReport = useCallback(async (targetDate: string) => {
    const sequence = ++fetchSequence.current;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/report?date=${targetDate}`, { cache: 'no-store' });
      if (sequence !== fetchSequence.current) return;
      if (!res.ok) throw new Error('日報の取得に失敗しました。');
      const data = await res.json();
      if (sequence !== fetchSequence.current) return;
      if (!Array.isArray(data)) throw new Error('日報の形式が正しくありません。');
      setOrders(data.filter(isSalesOrder)); setLoadedDate(targetDate); setLastUpdated(new Date().toLocaleString('ja-JP'));
    } catch (error) {
      if (sequence === fetchSequence.current) setError(error instanceof Error ? error.message : '通信エラーが発生しました。');
    } finally {
      if (sequence === fetchSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(date);
  }, [date, fetchReport]);

  // --- 集計ロジック ---

  // 1. 基本サマリー
  const summary = useMemo(() => {
    const totalSales = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const totalCustomers = orders.length;
    const averageSales = totalCustomers > 0 ? Math.round(totalSales / totalCustomers) : 0;
    return { totalSales, totalCustomers, averageSales };
  }, [orders]);

  // 2. 商品別集計
  const productSummary = useMemo(() => {
    const summary: { [key: string]: { quantity: number; amount: number } } = {};
    
    orders.forEach(order => {
      order.items.forEach(item => {
        if (!summary[item.productName]) {
          summary[item.productName] = { quantity: 0, amount: 0 };
        }
        summary[item.productName].quantity += item.quantity;
        summary[item.productName].amount += item.amount;
      });
    });

    return Object.entries(summary)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount);
  }, [orders]);

  // 3. 支払い方法別集計
  const paymentSummary = useMemo(() => {
    const summary: { [key: string]: { count: number; amount: number } } = {};

    orders.forEach(order => {
      const method = order.paymentMethod || '未設定';
      if (!summary[method]) {
        summary[method] = { count: 0, amount: 0 };
      }
      summary[method].count += 1;
      summary[method].amount += order.totalAmount;
    });

    return Object.entries(summary)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount);
  }, [orders]);

  // 4. 時間帯別売上
  const hourlySales = useMemo(() => {
    const stats = new Array(24).fill(0);
    orders.forEach(order => {
      const d = new Date(order.createdAt);
      const hour = d.getHours();
      stats[hour] += order.totalAmount;
    });
    return stats;
  }, [orders]);
  
  const maxHourlySales = Math.max(...hourlySales, 1);

  // 5. オプション別集計
  const optionSummary = useMemo(() => {
    const summary: { [key: string]: { count: number; amount: number } } = {};

    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.selectedOptions && Array.isArray(item.selectedOptions)) {
          item.selectedOptions.forEach(opt => {
            if (!summary[opt.name]) {
              summary[opt.name] = { count: 0, amount: 0 };
            }
            summary[opt.name].count += item.quantity;
            summary[opt.name].amount += (opt.price * item.quantity);
          });
        }
      });
    });

    return Object.entries(summary)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount || b.count - a.count);
  }, [orders]);

  // 日付操作
  const changeDate = (diff: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + diff);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    setDate(`${year}-${month}-${day}`);
  };

  const exportCsv = async () => {
    setIsExporting(true);
    try {
    const response = await apiFetch(`/api/report?date=${date}&scope=all`, { cache: 'no-store' });
    if (!response.ok) {
      setIsExporting(false);
      window.alert('CSV用データの取得に失敗しました。');
      return;
    }
    const exportedOrders: Order[] = await response.json();
    if (!Array.isArray(exportedOrders)) throw new Error('CSVデータの形式が正しくありません。');
    const escapeCell = (value: unknown) => {
      const text = String(value ?? '').replaceAll('"', '""');
      return `"${text}"`;
    };
    const statusLabel = (status?: string) => ({ active: '調理中', pending: '保留中', completed: '完了', cancelled: 'キャンセル' }[status || ''] || status || '');
    const rows = [
      ['注文日時', '整理券番号', '状態', '売上扱い', '支払い方法', '商品名', '数量', '商品金額', 'オプション', '商品メモ', '注文合計', '預かり金', 'お釣り', '注文備考', '売上計上額（明細）', '追加支払い・返金履歴（参考・加算不要）'],
      ...exportedOrders.flatMap((order) => order.items.map((item) => [
        new Date(order.createdAt).toLocaleString('ja-JP'),
        order.ticketNumber,
        statusLabel(order.status),
        isSalesOrder(order) ? '対象' : '対象外（キャンセル）',
        order.paymentMethod || '',
        item.productName,
        item.quantity,
        item.amount,
        (item.selectedOptions || []).map((option) => `${option.name}${option.price !== 0 ? `(${option.price})` : ''}`).join(' / '),
        item.detail || '',
        order.totalAmount,
        order.receivedAmount ?? '',
        order.changeAmount ?? '',
        order.note || '',
        isSalesOrder(order) ? item.amount : 0,
        (order.settlements || []).map(entry => new Date(entry.createdAt).toLocaleString('ja-JP') + ' ' + (entry.kind === 'cancel' ? '注文キャンセル' : '追加支払い・返金') + ' ' + entry.delta + '円 ' + entry.paymentMethod + (entry.receivedAmount != null ? ' お預かり' + entry.receivedAmount + ' お釣り' + entry.changeAmount : '')).join(' / '),
      ])),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `rootine-sales-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    } catch { window.alert('CSVの取得・出力に失敗しました。再試行してください。'); } finally { setIsExporting(false); }
  };

  return (
    <div className="min-h-dvh bg-gray-100 p-6 font-sans text-gray-900">
      
      {/* ヘッダー */}
      <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            売上・営業終了
        </h1>
        <button 
          onClick={() => router.push('/order')}
          className="ui-button ui-button--secondary px-4 py-2"
        >
          ← 注文画面へ戻る
        </button>
      </div>

      {date === getTodayString() ? <BusinessDayPanel /> : <button className="ui-button ui-button--secondary mb-6 p-3" onClick={() => setDate(getTodayString())}>本日の売上・営業終了へ戻る</button>}
      {/* 日付選択エリア */}
      <div className="flex justify-center items-center gap-4 mb-8">
        <button 
          onClick={() => changeDate(-1)}
          className="ui-button ui-button--secondary px-4 py-2"
        >
          ◀ 前日
        </button>
        <input 
          type="date" 
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-2xl font-bold text-gray-800 bg-transparent border-b-2 border-gray-300 focus:border-[#f3b928] outline-none px-2 text-center"
        />
        <button 
          onClick={() => changeDate(1)}
          className="ui-button ui-button--secondary px-4 py-2"
        >
          翌日 ▶
        </button>
        <button onClick={() => void exportCsv()} disabled={isExporting} className="ui-button ui-button--primary px-4 py-2 disabled:cursor-not-allowed">{isExporting ? '出力中...' : '注文一覧をCSVで保存'}</button>
      </div>

      <div role="status" className="mb-5 rounded-xl bg-white p-4">
        <p>売上には、支払い済みの注文を含めます。キャンセル済みの注文は含めません。注文内容を変更した場合は、変更後の金額を注文した日の売上に反映します。追加支払い・返金の履歴を、売上に重ねて足す必要はありません。</p>
        <p>最終更新: {lastUpdated || '未取得'} {loadedDate && '（取得済みの日付: ' + loadedDate + '）'}</p>
        {loading && <p>読み込み中…</p>}
        {error && <p className="font-bold text-red-600">{error} {loadedDate ? '最後に取得できたデータを保持しています。' : '売上は未取得です。'}</p>}
        {loadedDate && loadedDate !== date && <p className="font-bold text-orange-700">選択日の日報は未取得です。以下は {loadedDate} のデータです。</p>}
        <button onClick={() => void fetchReport(date)} disabled={loading} className="ui-button ui-button--secondary mt-2 p-2">もう一度読み込む</button>
      </div>
      {loadedDate && <>
      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow border-l-8 border-blue-500">
          <p className="text-sm text-gray-500 font-bold mb-1">総売上</p>
          <p className="text-4xl font-black text-gray-800">¥{summary.totalSales.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow border-l-8 border-green-500">
          <p className="text-sm text-gray-500 font-bold mb-1">注文数</p>
          <p className="text-4xl font-black text-gray-800">{summary.totalCustomers}<span className="text-lg font-normal ml-1">件</span></p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow border-l-8 border-orange-500">
          <p className="text-sm text-gray-500 font-bold mb-1">1注文あたりの平均金額</p>
          <p className="text-4xl font-black text-gray-800">¥{summary.averageSales.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        
        {/* 商品別売上ランキング */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">商品別売上</h2>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="min-w-full">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-sm text-gray-500">
                  <th className="pb-2">順位</th>
                  <th className="pb-2">商品名</th>
                  <th className="pb-2 text-right">数量</th>
                  <th className="pb-2 text-right">金額</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {productSummary.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-4 text-gray-400">この日の対象データはありません</td></tr>
                ) : (
                  productSummary.map((item, index) => (
                    <tr key={item.name} className="border-t border-gray-100">
                      <td className="py-3 pl-2 font-bold text-blue-600">{index + 1}</td>
                      <td className="py-3 font-bold">{item.name}</td>
                      <td className="py-3 text-right">{item.quantity}</td>
                      <td className="py-3 text-right font-mono">¥{item.amount.toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          {/* 支払い方法別 */}
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">支払い方法別</h2>
            <div className="space-y-3">
              {paymentSummary.length === 0 ? (
                <p className="text-center text-gray-400 py-4">この日の対象データはありません</p>
              ) : (
                paymentSummary.map((item) => (
                  <div key={item.name} className="flex justify-between items-center">
                    <span className="font-bold text-gray-700 w-1/3">{item.name}</span>
                    <span className="text-gray-500 text-sm">{item.count}件</span>
                    <span className="font-bold text-gray-800 font-mono">¥{item.amount.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 時間帯別売上グラフ */}
          <div className="bg-white p-6 rounded-xl shadow">
            <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">時間帯別売上推移</h2>
            <div className="flex items-end gap-1 h-40 pt-4">
              {hourlySales.map((amount, hour) => (
                <div key={hour} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                  {amount > 0 && (
                    <div className="absolute -top-8 bg-gray-800 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 whitespace-nowrap">
                      {hour}時: ¥{amount.toLocaleString()}
                    </div>
                  )}
                  <div 
                    className={`w-full rounded-t transition-all duration-500 ${amount > 0 ? 'bg-[#f3b928] hover:bg-[#d6a11b]' : 'bg-gray-100'}`}
                    style={{ height: `${Math.max((amount / maxHourlySales) * 100, 5)}%` }}
                  ></div>
                  <span className="text-[9px] text-gray-400 mt-1">{hour}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* オプション実績 */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-xl font-bold text-[#d6a11b] mb-4 border-b pb-2 flex items-center gap-2">
          オプション実績
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {optionSummary.length === 0 ? (
            <p className="text-gray-400 col-span-3 py-4 text-center">オプションの利用はありません</p>
          ) : (
            optionSummary.map((item) => (
              <div 
                key={item.name} 
                className={`flex justify-between items-center p-3 rounded-lg border ${
                  item.amount < 0 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <span className="font-bold text-gray-800">{item.name}</span>
                <div className="text-right">
                  <span className="text-sm text-gray-600 mr-3">{item.count}回</span>
                  <span className={`font-bold font-mono ${
                    item.amount < 0 ? 'text-red-600' : 'text-[#d6a11b]'
                  }`}>
                    ¥{item.amount.toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      </>}
    </div>
  );
}
