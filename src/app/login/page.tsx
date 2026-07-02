"use client";

import { useState } from 'react';

const useRouter = () => ({
  push: (path: string) => { if (typeof window !== 'undefined') window.location.href = path; },
});

export default function Login() {
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
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const res = await fetch(new URL('/api/login', baseUrl).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      });
      const data = await res.json();
      if (res.ok) {
        if (typeof window !== 'undefined') localStorage.setItem('currentUserId', id);
        
        // ★修正: adminユーザーの場合は管理者専用画面へ遷移
        if (id === 'admin') {
          router.push('/admin');
        } else {
          router.push('/order');
        }
      } else {
        setError(data.message || "ログイン失敗");
      }
    } catch (err) { setError("通信エラー"); } 
    finally { setLoading(false); }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 font-sans text-gray-900">
      <h1 className="text-5xl font-extrabold text-[#f3b928] mb-8 drop-shadow-sm tracking-wider">ROOTINE</h1>
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-sm space-y-4">
        {error && <div className="bg-red-100 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
        <div><label className="block text-sm font-bold mb-1">ID</label><input type="text" name="id" required className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#f3b928] outline-none transition" /></div>
        <div><label className="block text-sm font-bold mb-1">パスワード</label><input type="password" name="password" required className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#f3b928] outline-none transition" /></div>
        <button 
          type="submit" 
          disabled={loading} 
          className={`mt-4 w-full py-3 bg-[#f3b928] text-gray-900 rounded-lg font-black hover:bg-[#d6a11b] transition shadow-md ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loading ? '確認中...' : 'ログイン'}
        </button>
        <a href="/signup" className="block text-center text-sm text-[#f3b928] hover:text-[#d6a11b] hover:underline font-bold mt-4">新規登録はこちら</a>
      </form>
    </div>
  );
}