"use client";

import { useEffect, useState } from 'react';

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

type CollectionStat = { name: string; count: number };
type StoreSummary = {
  id: string;
  name: string;
  ownerUserId: string;
  memberUserIds: string[];
  createdAt?: string;
};
type StoreUserRow = {
  userId: string;
  storeIds: string[];
  activeStoreId: string;
  stores: StoreSummary[];
};
type StoreAdminData = {
  users: StoreUserRow[];
  orphanStores: StoreSummary[];
  totalUsers: number;
  totalStores: number;
};

export default function AdminPage() {
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [cancelPassword, setCancelPassword] = useState('0000');
  const [maxStores, setMaxStores] = useState(10);
  const [newMethod, setNewMethod] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [dbStats, setDbStats] = useState<CollectionStat[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);
  const [storeData, setStoreData] = useState<StoreAdminData | null>(null);
  const [loadingStores, setLoadingStores] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      const res = await apiFetch('/api/me', { cache: 'no-store' });
      if (!res.ok) {
        navigateTo('/login');
        return;
      }

      const data = await res.json();
      if (!data.isAdmin) navigateTo('/order');
    };

    checkSession();
  }, []);

  const fetchSystemSettings = async () => {
    try {
      const res = await apiFetch('/api/admin/system-settings');
      if (res.ok) {
        const data = await res.json();
        setMaxStores(data.maxStores || 10);
        setCancelPassword(data.cancelPassword || '0000');
      }
    } catch (error) {
      console.error('システム設定取得エラー:', error);
    }
  };

  const fetchDbStats = async () => {
    setLoadingDb(true);
    try {
      const res = await apiFetch('/api/admin/database');
      if (res.ok) setDbStats(await res.json());
    } catch (error) {
      console.error('DB情報取得エラー:', error);
    } finally {
      setLoadingDb(false);
    }
  };

  const fetchStoreData = async () => {
    setLoadingStores(true);
    try {
      const res = await apiFetch('/api/admin/stores');
      if (res.ok) setStoreData(await res.json());
    } catch (error) {
      console.error('店舗情報取得エラー:', error);
    } finally {
      setLoadingStores(false);
    }
  };

  useEffect(() => {
    fetchSystemSettings();
    fetchDbStats();
    fetchStoreData();
  }, []);

  const addPaymentMethod = () => {
    const trimmed = newMethod.trim();
    if (trimmed && !paymentMethods.includes(trimmed)) {
      setPaymentMethods([...paymentMethods, trimmed]);
      setNewMethod('');
    }
  };

  const removePaymentMethod = (val: string) => {
    setPaymentMethods(paymentMethods.filter((method) => method !== val));
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');

    try {
      const systemRes = await apiFetch('/api/admin/system-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxStores, cancelPassword }),
      });

      const data = await systemRes.json().catch(() => ({}));
      if (systemRes.ok) {
        setMessage('管理者設定を保存しました');
      } else {
        setMessage(`保存失敗: ${data.message || '不明なエラー'}`);
      }
    } catch {
      setMessage('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const userRows = storeData?.users || [];
  const usersWithMultipleStores = userRows.filter((row) => row.stores.length > 1 || row.storeIds.length > 1).length;

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans flex flex-col items-center text-gray-900">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg p-8 overflow-y-auto max-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">管理者用設定</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="space-y-6">
            <div>
              <label className="block text-gray-700 font-bold mb-2">キャンセル用パスワード</label>
              <input
                type="text"
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
                className="w-full border-2 p-3 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]"
                placeholder="0000"
              />
              <p className="text-xs text-gray-500 mt-1">注文履歴画面でのキャンセル処理に使用します。</p>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">作成可能な店舗数上限</label>
              <input
                type="number"
                min={1}
                max={9999}
                value={maxStores}
                onChange={(e) => setMaxStores(Number(e.target.value))}
                className="w-full border-2 p-3 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]"
              />
              <p className="text-xs text-gray-500 mt-1">システム全体で作成できる店舗数の上限です。</p>
            </div>

            <div>
              <label className="block text-gray-700 font-bold mb-2">決済方法の設定</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                  placeholder="例: d払い"
                  className="flex-1 border-2 p-2 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]"
                />
                <button onClick={addPaymentMethod} className="bg-[#f3b928] text-gray-900 px-4 rounded-lg font-bold hover:bg-[#d6a11b] transition">
                  追加
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <div key={method} className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-2 border border-gray-300">
                    <span className="font-bold text-sm">{method}</span>
                    <button onClick={() => removePaymentMethod(method)} className="text-red-500 font-bold px-1 hover:text-red-700">x</button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={loading}
              className={`w-full py-4 rounded-xl font-bold text-gray-900 text-lg shadow-md transition ${
                loading ? 'bg-gray-400' : 'bg-[#f3b928] hover:bg-[#d6a11b]'
              }`}
            >
              {loading ? '保存中...' : '設定を保存する'}
            </button>
          </section>

          <section className="space-y-6">
            <div className="p-5 bg-blue-50 rounded-xl border-2 border-blue-100">
              <div className="flex justify-between items-center mb-4 border-b border-blue-100 pb-2">
                <h2 className="text-lg font-bold text-blue-900">店舗管理</h2>
                <button onClick={fetchStoreData} disabled={loadingStores} className="text-sm bg-blue-200 hover:bg-blue-300 text-blue-900 px-3 py-1 rounded font-bold transition">
                  {loadingStores ? '更新中...' : '再読み込み'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white p-3 rounded border border-blue-100">
                  <p className="text-xs text-gray-500 font-bold">ユーザー</p>
                  <p className="text-xl font-black">{storeData?.totalUsers ?? '-'}</p>
                </div>
                <div className="bg-white p-3 rounded border border-blue-100">
                  <p className="text-xs text-gray-500 font-bold">店舗</p>
                  <p className="text-xl font-black">{storeData?.totalStores ?? '-'}</p>
                </div>
                <div className="bg-white p-3 rounded border border-blue-100">
                  <p className="text-xs text-gray-500 font-bold">要整理</p>
                  <p className={`text-xl font-black ${usersWithMultipleStores > 0 ? 'text-red-600' : 'text-green-700'}`}>{usersWithMultipleStores}</p>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {userRows.map((row) => (
                  <div key={row.userId} className="bg-white p-3 rounded border border-blue-100">
                    <div className="flex justify-between gap-3">
                      <span className="font-bold text-gray-800">{row.userId}</span>
                      <span className={`text-xs font-bold px-2 py-1 rounded ${row.stores.length === 1 && row.storeIds.length === 1 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {row.stores.length}店舗
                      </span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {row.stores.length === 0 ? (
                        <p className="text-xs text-red-500 font-bold">店舗がありません</p>
                      ) : (
                        row.stores.map((store) => (
                          <div key={store.id} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                            <span className="font-bold">{store.name}</span>
                            <span className="ml-2 font-mono">{store.id}</span>
                            {row.activeStoreId === store.id && <span className="ml-2 text-green-700 font-bold">active</span>}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {storeData?.orphanStores.length ? (
                <p className="mt-3 text-xs text-red-600 font-bold">所有ユーザーが存在しない店舗が {storeData.orphanStores.length} 件あります。</p>
              ) : null}
            </div>

            <div className="p-5 bg-red-50 rounded-xl border-2 border-red-200">
              <div className="flex justify-between items-center mb-4 border-b border-red-200 pb-2">
                <h2 className="text-lg font-bold text-red-800">データベース管理</h2>
                <button onClick={fetchDbStats} disabled={loadingDb} className="text-sm bg-red-200 hover:bg-red-300 text-red-800 px-3 py-1 rounded font-bold transition">
                  {loadingDb ? '更新中...' : '再読み込み'}
                </button>
              </div>
              <p className="text-xs text-red-600 mb-4 font-bold">現在のコレクションと件数を表示します。削除操作はこの画面からはできません。</p>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {dbStats.length === 0 && !loadingDb ? (
                  <p className="text-center text-sm text-red-400">コレクションがありません</p>
                ) : (
                  dbStats.map((col) => (
                    <div key={col.name} className="flex justify-between items-center p-3 bg-white rounded shadow-sm border border-red-100 gap-2">
                      <span className="font-bold text-gray-800">{col.name}</span>
                      <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{col.count} records</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>

        {message && (
          <div className={`p-4 rounded-lg my-6 text-center font-bold ${message.includes('失敗') || message.includes('エラー') ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-green-100 text-green-700 border border-green-200'}`}>
            {message}
          </div>
        )}

        <button
          onClick={async () => {
            await fetch('/api/logout', { method: 'POST' }).catch(() => {});
            navigateTo('/login');
          }}
          className="w-full py-3 rounded-lg font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition mt-6"
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}
