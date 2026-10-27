"use client";

import { Toast } from '@/components/common/Toast';

import { useEffect, useRef, useState } from 'react';

const navigateTo = (path: string) => {
  if (typeof window !== 'undefined') window.location.href = path;
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers });
  } catch {
    return { ok: false, status: 500, json: async () => ({ message: '通信エラー' }) } as Response;
  }
};

type CustomOption = { name: string; price: number };

export default function SettingsPage() {
  const [maxTicket, setMaxTicket] = useState<number | string>('');
  const [maxPendingItemCount, setMaxPendingItemCount] = useState<number | string>(30);
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState<number | string>(10);
  const [defaultThroughput, setDefaultThroughput] = useState<number | string>(1.5);
  const [recentWindow, setRecentWindow] = useState<number | string>(30);
  const [minimumItems, setMinimumItems] = useState<number | string>(10);
  const [warningMinutes, setWarningMinutes] = useState<number | string>(15);
  const [criticalMinutes, setCriticalMinutes] = useState<number | string>(30);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [cashCalculationEnabled, setCashCalculationEnabled] = useState(false);
  const [cashPaymentMethod, setCashPaymentMethod] = useState('現金');
  const [customizations, setCustomizations] = useState<CustomOption[]>([]);
  const [newMethod, setNewMethod] = useState('');
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomPrice, setNewCustomPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ ok: boolean; message: string } | null>(null);
  const resetLock = useRef(false);

  const resetTickets = async (event: React.FormEvent) => {
    event.preventDefault();
    if (resetLock.current || !resetConfirmed || !resetPassword) return;
    resetLock.current = true;
    setResetting(true);
    setResetResult(null);
    try {
      const response = await apiFetch('/api/settings/tickets/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword, confirm: resetConfirmed }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      setResetResult({ ok: response.ok, message: data.message || '結果を確認できません。注文画面の整理券番号を確認してください。' });
    } catch {
      setResetResult({ ok: false, message: '結果を確認できません。注文画面の整理券番号を確認してください。' });
    } finally {
      setResetPassword('');
      setResetConfirmed(false);
      setResetting(false);
      resetLock.current = false;
    }
  };

  useEffect(() => {
    const checkSession = async () => {
      const res = await apiFetch('/api/me', { cache: 'no-store' });
      if (!res.ok) navigateTo('/login');
    };
    checkSession();
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setMaxTicket(data.maxTicketNumber);
          setMaxPendingItemCount(data.maxPendingItemCount ?? 30);
          setMaxItemsPerOrder(data.maxItemsPerOrder ?? 10);
          setDefaultThroughput(data.defaultThroughputPerMinute ?? 1.5);
          setRecentWindow(data.waitTimeRecentWindowMinutes ?? 30);
          setMinimumItems(data.waitTimeMinimumCompletedItemCount ?? 10);
          setWarningMinutes(data.waitTimeWarningMinutes ?? 15);
          setCriticalMinutes(data.waitTimeCriticalMinutes ?? 30);
          setPaymentMethods(data.paymentMethods || []);
          setCashCalculationEnabled(data.cashCalculationEnabled === true);
          setCashPaymentMethod(data.cashPaymentMethod || '現金');
          setCustomizations(data.customizations || []);
        }
      } catch (error) {
        console.error('設定取得エラー:', error);
      }
    };
    fetchSettings();
  }, []);

  const addPaymentMethod = () => {
    const trimmed = newMethod.trim();
    if (trimmed && !paymentMethods.includes(trimmed)) {
      setPaymentMethods([...paymentMethods, trimmed]);
      setNewMethod('');
    }
  };

  const addCustomization = () => {
    const trimmed = newCustomName.trim();
    if (trimmed) {
      setCustomizations([...customizations, { name: trimmed, price: parseInt(newCustomPrice) || 0 }]);
      setNewCustomName('');
      setNewCustomPrice('');
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');

    try {
      const numMaxTicket = Number(maxTicket);
      if (isNaN(numMaxTicket) || numMaxTicket < 1) {
        setMessage('エラー: 整理番号は1以上の数値を入力してください');
        setLoading(false);
        return;
      }

      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxTicketNumber: numMaxTicket,
          maxPendingItemCount: Number(maxPendingItemCount),
          maxItemsPerOrder: Number(maxItemsPerOrder),
          defaultThroughputPerMinute: Number(defaultThroughput),
          waitTimeRecentWindowMinutes: Number(recentWindow),
          waitTimeMinimumCompletedItemCount: Number(minimumItems),
          waitTimeWarningMinutes: Number(warningMinutes),
          waitTimeCriticalMinutes: Number(criticalMinutes),
          paymentMethods,
          cashCalculationEnabled,
          cashPaymentMethod,
          customizations,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage('設定を保存しました');
      } else {
        setMessage(`保存失敗: ${data.message || '不明なエラー'}`);
      }
    } catch {
      setMessage('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-gray-100 p-6 font-sans flex flex-col items-center text-gray-900">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">システム設定</h1>

        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">整理番号の最大値</label>
          <input type="number" min={1} value={maxTicket} onChange={(e) => setMaxTicket(e.target.value)} className="w-full border-2 p-3 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]" />
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4">
          <label className="font-bold">未提供数の警告基準<input type="number" min={1} value={maxPendingItemCount} onChange={(e) => setMaxPendingItemCount(e.target.value)} className="mt-2 w-full border-2 p-3 rounded-lg" /></label>
          <label className="font-bold">1注文あたりの警告基準<input type="number" min={1} value={maxItemsPerOrder} onChange={(e) => setMaxItemsPerOrder(e.target.value)} className="mt-2 w-full border-2 p-3 rounded-lg" /></label>
        </div>

        <div className="mb-8 border rounded-xl p-4 bg-blue-50/50">
          <h2 className="font-black text-gray-800 mb-3">待ち時間の推定設定</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="font-bold">初期提供速度（本/分）<input type="number" min="0.01" step="0.1" value={defaultThroughput} onChange={(e) => setDefaultThroughput(e.target.value)} className="mt-1 w-full border-2 p-2 rounded-lg bg-white" /></label>
            <label className="font-bold">直近の集計時間（分）<input type="number" min="1" value={recentWindow} onChange={(e) => setRecentWindow(e.target.value)} className="mt-1 w-full border-2 p-2 rounded-lg bg-white" /></label>
            <label className="font-bold">実績として必要な本数<input type="number" min="1" value={minimumItems} onChange={(e) => setMinimumItems(e.target.value)} className="mt-1 w-full border-2 p-2 rounded-lg bg-white" /></label>
            <label className="font-bold">注意表示（分）<input type="number" min="1" value={warningMinutes} onChange={(e) => setWarningMinutes(e.target.value)} className="mt-1 w-full border-2 p-2 rounded-lg bg-white" /></label>
            <label className="font-bold">強い警告（分）<input type="number" min="1" value={criticalMinutes} onChange={(e) => setCriticalMinutes(e.target.value)} className="mt-1 w-full border-2 p-2 rounded-lg bg-white" /></label>
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">決済方法</label>
          <div className="flex gap-2 mb-3">
            <input value={newMethod} onChange={(e) => setNewMethod(e.target.value)} placeholder="例: d払い" className="flex-1 border-2 p-2 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" />
            <button onClick={addPaymentMethod} className="bg-[#f3b928] text-gray-900 px-4 rounded-lg font-bold hover:bg-[#d6a11b] transition">追加</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {paymentMethods.map((method) => (
              <div key={method} className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-2 border border-gray-300">
                <span className="font-bold text-sm">{method}</span>
                <button onClick={() => setPaymentMethods(paymentMethods.filter((item) => item !== method))} className="text-red-500 font-bold px-1 hover:text-red-700">x</button>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
            <label className="flex cursor-pointer items-center justify-between gap-4 font-black text-gray-800">
              <span>
                現金のお預かり・お釣り計算
                <span className="mt-1 block text-xs font-medium text-gray-500">オフの場合は、現在の金券運用と同じです</span>
              </span>
              <input type="checkbox" checked={cashCalculationEnabled} onChange={(e) => setCashCalculationEnabled(e.target.checked)} className="h-6 w-6 accent-[#f3b928]" />
            </label>
            {cashCalculationEnabled && (
              <label className="mt-4 block text-sm font-bold text-gray-700">
                現金として扱う決済方法
                <select value={cashPaymentMethod} onChange={(e) => setCashPaymentMethod(e.target.value)} className="mt-2 w-full rounded-lg border-2 bg-white p-3 font-bold">
                  {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">オプション設定</label>
          <div className="grid grid-cols-[1fr_96px_auto] gap-2 mb-3">
            <input value={newCustomName} onChange={(e) => setNewCustomName(e.target.value)} placeholder="例: 大盛り" className="border-2 p-2 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" />
            <input value={newCustomPrice} onChange={(e) => setNewCustomPrice(e.target.value)} type="number" placeholder="100" className="border-2 p-2 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" />
            <button onClick={addCustomization} className="bg-[#f3b928] text-gray-900 px-4 rounded-lg font-bold hover:bg-[#d6a11b] transition">追加</button>
          </div>
          <div className="space-y-2">
            {customizations.map((option, index) => (
              <div key={`${option.name}-${index}`} className="bg-gray-100 px-3 py-2 rounded-lg flex items-center justify-between border border-gray-300">
                <span className="font-bold text-sm">{option.name} / {option.price >= 0 ? '+' : ''}{option.price}円</span>
                <button onClick={() => setCustomizations(customizations.filter((_, itemIndex) => itemIndex !== index))} className="text-red-500 font-bold px-1 hover:text-red-700">削除</button>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={resetTickets} className="mb-8 rounded-xl border-2 border-red-200 bg-red-50 p-4">
          <h2 className="mb-2 font-bold text-gray-800">整理券のリセット</h2>
          <p className="mb-3 text-sm text-gray-700">発券順を先頭に戻します。注文履歴・売上・紛失番号は保持されます。紛失指定の番号は飛ばして発行します。未提供・保留・精算中の注文がある場合は実行できません。締め作業済みの営業は再開されません。</p>
          <fieldset disabled={resetting}>
            <label htmlFor="ticket-reset-password" className="block text-sm font-bold">ログイン中のアカウントのパスワード</label>
            <input id="ticket-reset-password" type="password" autoComplete="current-password" required maxLength={1024} value={resetPassword} onChange={event => setResetPassword(event.target.value)} className="mt-2 w-full rounded-lg border-2 bg-white p-3" />
            <label className="my-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={resetConfirmed} onChange={event => setResetConfirmed(event.target.checked)} className="mt-1" />整理券の発券順を先頭に戻すことを確認しました</label>
            <button type="submit" disabled={resetting || !resetConfirmed || !resetPassword} className="w-full rounded-lg bg-red-600 py-3 font-bold text-white disabled:opacity-50">{resetting ? 'リセット中...' : 'パスワードを確認してリセット'}</button>
          </fieldset>
          <Toast show={resetResult?.ok === true} message={resetResult?.message || ''} title="リセット完了" onClose={() => setResetResult(null)} />
          {resetResult && !resetResult.ok && <p role="status" className={`mt-3 text-sm font-bold ${resetResult.ok ? 'text-green-800' : 'text-red-700'}`}>{resetResult.message}</p>}
        </form>

        <Toast show={Boolean(message) && !message.includes('失敗') && !message.includes('エラー')} message={message} title="保存完了" onClose={() => setMessage('')} />
        {message && (message.includes('失敗') || message.includes('エラー')) && (
          <div className={`p-4 rounded-lg mb-6 text-center font-bold ${message.includes('失敗') || message.includes('エラー') ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
            {message}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button onClick={handleSave} disabled={loading} className={`w-full py-4 rounded-xl font-bold text-gray-900 text-lg shadow-md transition ${loading ? 'bg-gray-400' : 'bg-[#f3b928] hover:bg-[#d6a11b]'}`}>
            {loading ? '保存中...' : '設定を保存する'}
          </button>
          <button onClick={() => navigateTo('/settings/password')} className="w-full py-3 rounded-lg font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition">パスワードを変更する</button>
          <button onClick={() => navigateTo('/order')} className="w-full py-3 rounded-lg font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition">注文画面に戻る</button>
        </div>
      </div>
    </div>
  );
}
