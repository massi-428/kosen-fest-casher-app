"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import RootineLogo from '../components/RootineLogo';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();
  // 画像の読み込みエラーを検知する状態管理
  const [imageError, setImageError] = useState(false);

  const goToLogin = () => {
    router.push('/login'); 
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 font-sans">
      <div className="mb-4">
        <Image 
          src="/image/ROOTINE_logo_color.png"
          alt="ROOTINE Logo"
          width={300}
          height={100}
          priority
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      {/* タイトルテキスト */}
      <RootineLogo className="text-8xl text-gray-800 px-3 py-2 mb-8 tracking-tighter" />
      
      <p className="text-gray-600 mb-6 font-bold">「ログインページへ」ボタンを押すと、ログインページに移動します。</p>

      <button 
        className="bg-[#f3b928] text-gray-900 px-10 py-4 rounded-2xl shadow-xl hover:bg-[#d6a11b] transition duration-300 transform hover:scale-105 font-bold text-lg"
        onClick={goToLogin} 
      >
        ログインページへ
      </button>
    </div>
  );
}