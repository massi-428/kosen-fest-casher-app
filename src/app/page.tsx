"use client";

import { useRouter } from 'next/navigation';
import RootineLogo from '../components/RootineLogo';
import Image from 'next/image';

export default function Home() {
  const router = useRouter();

  const goToLogin = () => {
    router.push('/login'); 
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-gray-50 p-4 font-sans">
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
      
      <p className="text-gray-600 mb-6 font-bold">注文・調理・売上・勤怠を、このアプリで管理できます。</p>

      <button 
        className="ui-button ui-button--primary px-10 py-4 duration-300 text-lg"
        onClick={goToLogin} 
      >
        ログインする
      </button>
    </div>
  );
}
