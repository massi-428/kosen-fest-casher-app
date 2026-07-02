"use client";

import { useState, useEffect } from 'react';

const useRouter = () => ({
  push: (path: string) => { if (typeof window !== 'undefined') window.location.href = path; }
});

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers });
  } catch (e) { return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response; }
};

export default function AdminPage() {
  const router = useRouter();
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [cancelPassword, setCancelPassword] = useState<string>("");
  
  const [newMethod, setNewMethod] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ★追加: データベース管理用のステート
  type CollectionStat = { name: string; count: number; };
  const [dbStats, setDbStats] = useState<CollectionStat[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);

  // ログインおよび管理者権限のチェック
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userId = localStorage.getItem('currentUserId');
      if (!userId) {
        router.push('/login');
      } else if (userId !== 'admin') {
        // admin以外のユーザーが直接アクセスした場合は通常の注文画面へ弾く
        router.push('/order');
      }
    }
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data) {
            setPaymentMethods(data.paymentMethods || []);
            setCancelPassword(data.cancelPassword || "0000");
          }
        }
      } catch (error) {
        console.error("設定取得エラー:", error);
      }
    };
    fetchSettings();
  }, []);

  // ★追加: データベースのコレクション情報を取得する関数
  const fetchDbStats = async () => {
    setLoadingDb(true);
    try {
      const res = await apiFetch('/api/admin/database');
      if (res.ok) {
        setDbStats(await res.json());
      }
    } catch (error) {
      console.error("DB情報取得エラー:", error);
    } finally {
      setLoadingDb(false);
    }
  };

  // ★追加: ページ読み込み時にDB情報も取得
  useEffect(() => {
    fetchDbStats();
  }, []);

  // ★追加: DB操作（空にする or 削除）を実行する関数
  const handleDbAction = async (collectionName: string, action: 'empty' | 'drop') => {
    const actionText = action === 'empty' ? '中身を全て削除（空に）' : 'コレクションごと完全に削除';
    if (!confirm(`本当にコレクション [ ${collectionName} ] の ${actionText} を実行してよろしいですか？\n\n※この操作は取り消せません！`)) {
      return;
    }
    
    setLoadingDb(true);
    try {
      const res = await apiFetch('/api/admin/database', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionName, action })
      });
      
      if (res.ok) {
        alert("処理が完了しました");
        fetchDbStats(); // 最新状態に更新
      } else {
        const data = await res.json();
        alert(`エラー: ${data.message}`);
      }
    } catch (e) {
      alert("通信エラーが発生しました");
    } finally {
      setLoadingDb(false);
    }
  };

  const addPaymentMethod = () => {
    if (newMethod && !paymentMethods.includes(newMethod)) {
      setPaymentMethods([...paymentMethods, newMethod]);
      setNewMethod("");
    }
  };

  const removePaymentMethod = (val: string) => {
    setPaymentMethods(paymentMethods.filter(m => m !== val));
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          paymentMethods,
          cancelPassword
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMessage("管理者設定を保存しました！");
      } else {
        setMessage(`保存失敗: ${data.message || "不明なエラー"}`);
      }
    } catch (error) {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans flex flex-col items-center text-gray-900">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8 overflow-y-auto max-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">管理者専用設定</h1>

        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">キャンセル用パスワード</label>
          <input 
            type="text" 
            value={cancelPassword} 
            onChange={(e) => setCancelPassword(e.target.value)} 
            className="w-full border-2 p-3 rounded-lg font-bold outline-none focus:ring-2 focus:ring-[#f3b928]" 
            placeholder="0000"
          />
          <p className="text-xs text-gray-500 mt-1">※注文履歴画面でのキャンセル処理に必要です</p>
        </div>

        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">決済方法の設定</label>
          <div className="flex gap-2 mb-3">
            <input 
              type="text" 
              value={newMethod} 
              onChange={(e) => setNewMethod(e.target.value)} 
              placeholder="例: d払い" 
              className="flex-1 border-2 p-2 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" 
            />
            <button 
              onClick={addPaymentMethod} 
              className="bg-[#f3b928] text-gray-900 px-4 rounded-lg font-bold hover:bg-[#d6a11b] transition"
            >
              追加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {paymentMethods.map((method) => (
              <div key={method} className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-2 border border-gray-300">
                <span className="font-bold text-sm">{method}</span>
                <button onClick={() => removePaymentMethod(method)} className="text-red-500 font-bold px-1 hover:text-red-700">×</button>
              </div>
            ))}
          </div>
        </div>

        {/* --- ここから追加：データベース管理セクション --- */}
        <div className="mb-8 p-6 bg-red-50 rounded-xl border-2 border-red-200">
          <div className="flex justify-between items-center mb-4 border-b border-red-200 pb-2">
            <h2 className="text-lg font-bold text-red-800">データベース管理 (高度な操作)</h2>
            <button onClick={fetchDbStats} disabled={loadingDb} className="text-sm bg-red-200 hover:bg-red-300 text-red-800 px-3 py-1 rounded font-bold transition">
              {loadingDb ? '更新中...' : '再読み込み'}
            </button>
          </div>
          <p className="text-xs text-red-600 mb-4 font-bold">
            ※現在データベース内に存在する全てのコレクション（テーブル）です。<br/>
            不要な古いテストデータや、使わなくなったコレクションを整理できます。
          </p>
          
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {dbStats.length === 0 && !loadingDb ? (
              <p className="text-center text-sm text-red-400">コレクションがありません</p>
            ) : (
              dbStats.map((col) => (
                <div key={col.name} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 bg-white rounded shadow-sm border border-red-100 gap-2">
                  <div>
                    <span className="font-bold text-gray-800">{col.name}</span>
                    <span className="ml-2 text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                      {col.count} records
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleDbAction(col.name, 'empty')}
                      disabled={col.count === 0}
                      className={`text-xs px-3 py-1.5 rounded font-bold transition ${col.count === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                    >
                      中身を空にする
                    </button>
                    <button 
                      onClick={() => handleDbAction(col.name, 'drop')}
                      className="text-xs px-3 py-1.5 rounded font-bold bg-red-600 text-white hover:bg-red-700 transition"
                    >
                      削除 (Drop)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        {/* --- ここまで追加 --- */}

        {message && (
          <div className={`p-4 rounded-lg mb-6 text-center font-bold ${message.includes("失敗") || message.includes("エラー") ? "bg-red-100 text-red-700 border border-red-200" : "bg-green-100 text-green-700 border border-green-200"}`}>
            {message}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button 
            onClick={handleSave} 
            disabled={loading} 
            className={`w-full py-4 rounded-xl font-bold text-gray-900 text-lg shadow-md transition ${
              loading ? 'bg-gray-400' : 'bg-[#f3b928] hover:bg-[#d6a11b]'
            }`}
          >
            {loading ? "保存中..." : "設定を保存する"}
          </button>
          
          <button 
            onClick={async () => {
              await fetch('/api/logout', { method: 'POST' }).catch(() => {});
              localStorage.removeItem('currentUserId');
              router.push('/login');
            }} 
            className="w-full py-3 rounded-lg font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition mt-4"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );
}
