"use client";
import RootineLogo from '../../components/RootineLogo';

import { useState } from 'react';

const navigateTo = (path: string) => {
  if (typeof window !== 'undefined') window.location.href = path;
};

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const id = formData.get('id') as string;
    const password = formData.get('password') as string;

    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const res = await fetch(new URL('/api/login', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();

      if (res.ok) {
        navigateTo(data.role === 'admin' ? '/admin' : '/order');
      } else {
        setError(data.message || 'ログインに失敗しました');
      }
    } catch {
      setError('接続できませんでした。通信環境を確認して、もう一度ログインしてください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-100 p-4 font-sans text-gray-900">
      <RootineLogo className="text-5xl font-extrabold text-[#f3b928] mb-8 drop-shadow-sm tracking-wider" />
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm space-y-4">
        {error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
        <div>
          <label htmlFor="login-id" className="block text-sm font-bold mb-1">ログインID</label>
          <input id="login-id" type="text" name="id" autoComplete="username" required className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#f3b928] outline-none transition" />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-bold mb-1">パスワード</label>
          <input id="login-password" type="password" name="password" autoComplete="current-password" required className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#f3b928] outline-none transition" />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="ui-button ui-button--primary mt-4 w-full"
        >
          {loading ? '確認中...' : 'ログイン'}
        </button>
        <a href="/signup" className="block text-center text-sm text-gray-700 underline font-bold mt-4">アカウントを作成する</a>
      </form>
    </div>
  );
}
