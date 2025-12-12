"use client"; // 【重要1】onClickを使う場合は必ず先頭にこれを書く

import Image from "next/image";
import { useRouter } from 'next/navigation'; // Next.jsのナビゲーション機能を使用するためにuseRouterをインポート


export default function Home() {
  // useRouterフックを初期化します
  const router = useRouter();

  // ログインページへ遷移する関数
  const goToLogin = () => {
    // router.push()を使って、指定したパス（/login）に遷移します
    router.push('/login'); 
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="text-5xl font-extrabold text-blue-600 mb-8 tracking-wider">ROOTINE</div>
      
      <p className="text-gray-600 mb-6">「ログインページへ」ボタンを押すと、ログインページに移動します。</p>

      <button 
        className="bg-blue-500 text-white px-8 py-3 rounded-xl shadow-lg hover:bg-blue-600 transition duration-300 transform hover:scale-105 font-semibold"
        onClick={goToLogin} 
      >
        ログインページへ
      </button>
    </div>
  );
}