"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Signup() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const id = formData.get('id') as string;
    const password = formData.get('password') as string;

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });

      const data = await res.json();

      if (res.ok) {
        alert("アカウントを作成しました！ログイン画面へ移動します。");
        router.push('/login');
      } else {
        // エラー詳細を表示
        setError(data.message + (data.error ? ` (${data.error})` : ""));
      }
    } catch (err) {
      setError("通信エラーが発生しました。サーバーが起動しているか確認してください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans text-gray-900">
      <div className="text-center mb-8">
        <div className="text-4xl font-extrabold text-blue-600 tracking-wider">ROOTINE</div>
        <div className="text-xl font-semibold text-gray-700 mt-2">新規アカウント作成</div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="space-y-6">
          {error && (
            <div className="bg-red-100 text-red-700 px-4 py-3 rounded text-sm text-center border border-red-200">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">希望するID</label>
            <input 
              type="text" 
              name="id" 
              placeholder="半角英数" 
              required 
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" 
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">パスワード</label>
            <input 
              type="password" 
              name="password" 
              placeholder="パスワード" 
              required 
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition" 
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          className={`mt-8 w-full text-white py-3 rounded-lg font-bold shadow-md transition transform active:scale-95 ${
            loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {loading ? '作成中...' : 'アカウント作成'}
        </button>

        <div className="mt-6 text-center">
          <a href="/login" className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium">
            すでにアカウントをお持ちの方はこちら
          </a>
        </div>
      </form>
    </div>
  );
}