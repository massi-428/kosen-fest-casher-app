"use client";

import { useState } from 'react';

type HamburgerMenuProps = {
  onNavigate: (path: string) => void;
  onReset: () => void;
};

const menuItems = [
  { path: '/settings', label: 'システム設定', icon: '/image/icon/setting.png' },
  { path: '/report', label: '営業日報', icon: '/image/icon/report.png' },
  { path: '/history', label: '注文履歴', icon: '/image/icon/history.png' },
  { path: '/kds', label: '調理画面 (KDS)', icon: '/image/icon/kds.png' },
];

export const HamburgerMenu = ({ onNavigate, onReset }: HamburgerMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative z-50">
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors focus:outline-none">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-3 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 animate-fadeIn origin-top-right overflow-hidden z-50">
            <div className="py-2">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { onNavigate(item.path); setIsOpen(false); }}
                  className="w-full text-left px-5 py-4 text-gray-700 hover:bg-[#fff8e1] hover:text-[#d6a11b] transition font-bold text-sm flex items-center gap-3"
                >
                  <div className="relative w-5 h-5 flex-shrink-0">
                    <img
                      src={item.icon}
                      alt={item.label}
                      className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                  {item.label}
                </button>
              ))}
              <div className="border-t border-gray-100 my-2"></div>
              <button onClick={() => { onReset(); setIsOpen(false); }} className="block w-full text-left px-5 py-4 text-red-600 hover:bg-red-50 transition text-xs font-black uppercase tracking-widest">
                データリセット
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
