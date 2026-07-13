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

export default function PasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const res = await apiFetch('/api/me', { cache: 'no-store' });
      if (!res.ok) navigateTo('/login');
    };
    checkSession();
  }, []);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) {
      setMessage('エラー: すべての項目を入力してください');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await apiFetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();

      if (res.ok) {
        alert('パスワードを変更しました。');
        navigateTo('/settings');
      } else {
        setMessage(`変更失敗: ${data.message}`);
      }
    } catch {
      setMessage('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans flex flex-col items-center text-gray-900">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2 text-center">パスワード変更</h1>

        {message && (
          <div className={`p-3 rounded mb-4 text-sm text-center font-bold ${message.includes('失敗') || message.includes('エラー') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
            {message}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 font-bold mb-2">現在のパスワード</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full border-2 p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" />
          </div>
          <div>
            <label className="block text-gray-700 font-bold mb-2">新しいパスワード</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border-2 p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#f3b928]" />
          </div>
          <button onClick={handleChangePassword} disabled={loading} className="w-full py-3 rounded-lg font-bold bg-[#f3b928] hover:bg-[#d6a11b] disabled:bg-gray-400 text-gray-900 transition">
            {loading ? '変更中...' : '変更する'}
          </button>
          <button onClick={() => navigateTo('/settings')} className="w-full py-3 rounded-lg font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition">
            戻る
          </button>
        </div>
      </div>
    </div>
  );
}
