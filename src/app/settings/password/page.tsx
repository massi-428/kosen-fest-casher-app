"use client";

import { useState, useEffect } from 'react';

const useRouter = () => ({
  push: (path: string) => { if (typeof window !== 'undefined') window.location.href = path; },
});

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers });
  } catch (e) {
    return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response;
  }
};

export default function PasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // ログインチェック
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userId = localStorage.getItem('currentUserId');
      if (!userId) {
        router.push('/login');
      }
    }
  }, []);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setMessage("エラー: 全ての項目を入力してください");
      return;
    }
    setLoading(true); setMessage("");
    
    try {
      const res = await apiFetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert("パスワードを変更しました。");
        router.push('/settings'); // 設定画面に戻る
      } else {
        setMessage(`変更失敗: ${data.message}`);
      }
    } catch (error) {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans flex flex-col items-center text-gray-900">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2 text-center">パスワード変更</h1>
        
        {message && (
          <div className="bg-red-100 text-red-700 px-4 py-3 rounded mb-6 text-center font-bold border border-red-200">
            {message}
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">現在のパスワード</label>
            <input 
              type="password" 
              value={currentPassword} 
              onChange={(e) => setCurrentPassword(e.target.value)} 
              className="w-full border-2 p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" 
              placeholder="現在のパスワード"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">新しいパスワード</label>
            <input 
              type="password" 
              value={newPassword} 
              onChange={(e) => setNewPassword(e.target.value)} 
              className="w-full border-2 p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" 
              placeholder="新しいパスワード"
            />
          </div>
          
          <button 
            onClick={handleChangePassword} 
            disabled={loading} 
            className={`w-full py-4 rounded-xl font-bold text-gray-900 bg-[#f3b928] hover:bg-[#d6a11b] transition shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {loading ? "変更中..." : "変更する"}
          </button>

          <button 
            onClick={() => router.push('/settings')} 
            className="w-full py-3 rounded-lg font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 transition"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
