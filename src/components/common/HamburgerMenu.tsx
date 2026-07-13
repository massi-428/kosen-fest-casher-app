"use client";

import { useState } from 'react';

type HamburgerMenuProps = {
  onNavigate: (path: string) => void;
  onReset: () => void;
  onLogout?: () => void;
};

const menuItems = [
  { path: '/settings', label: 'システム設定', icon: '/image/icons/ROOTINE_icon_option.png' },
  { path: '/report', label: '営業日報', icon: '/image/icons/ROOTINE_icon_calculate_sales.png' },
  { path: '/history', label: '注文履歴', icon: '/image/icons/ROOTINE_icon_order_history.png' },
  { path: '/kds', label: '調理画面 (KDS)', icon: '/image/icons/ROOTINE_icon_kd_system.png' },
];

export const HamburgerMenu = ({ onNavigate, onReset, onLogout }: HamburgerMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative z-50">
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors focus:outline-none">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-3 w-60 bg-gray-900 rounded-2xl shadow-2xl border border-gray-800 animate-fadeIn origin-top-right overflow-hidden z-50">
            <div className="py-2">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { onNavigate(item.path); setIsOpen(false); }}
                  className="w-full text-left px-5 py-4 text-gray-100 hover:bg-gray-800 hover:text-[#f3b928] transition font-bold text-sm flex items-center gap-3"
                >
                  <span className="w-5 h-5 flex-shrink-0 inline-flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.icon} alt="" aria-hidden="true" className="block w-5 h-5 object-contain" />
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="border-t border-gray-700 my-2"></div>
              <button onClick={() => { onReset(); setIsOpen(false); }} className="block w-full text-left px-5 py-4 text-red-300 hover:bg-red-950/50 hover:text-red-200 transition text-xs font-black uppercase tracking-widest">
                データリセット
              </button>
              {onLogout && (
                <button onClick={() => { onLogout(); setIsOpen(false); }} className="block w-full text-left px-5 py-4 text-gray-300 hover:bg-gray-800 hover:text-white transition text-xs font-black uppercase tracking-widest">
                  ログアウト
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};