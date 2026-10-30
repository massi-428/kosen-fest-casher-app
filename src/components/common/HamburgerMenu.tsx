"use client";

import { useState } from 'react';

type HamburgerMenuProps = {
  onNavigate: (path: string) => void;
  onLogout?: () => void;
};

const menuItems = [
  { path: '/attendance', label: '勤怠管理', icon: '/image/icons/ROOTINE_icon_order_history.png' },
  { path: '/settings', label: '店舗設定', icon: '/image/icons/ROOTINE_icon_option.png' },
  { path: '/report', label: '売上・営業終了', icon: '/image/icons/ROOTINE_icon_calculate_sales.png' },
  { path: '/history', label: '注文履歴', icon: '/image/icons/ROOTINE_icon_order_history.png' },
  { path: '/kds', label: '調理画面', icon: '/image/icons/ROOTINE_icon_kd_system.png' },
];

export const HamburgerMenu = ({ onNavigate, onLogout }: HamburgerMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative z-50">
      <button aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)} className="ui-button ui-button--secondary p-2">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50">
            <div className="p-2 space-y-2">
              {menuItems.map((item) => (
                <button
                  key={item.path}
                  onClick={() => { onNavigate(item.path); setIsOpen(false); }}
                  className="ui-button ui-button--secondary w-full justify-start text-left px-4 py-3"
                >
                  <span className="w-8 h-8 rounded-lg bg-gray-900 flex-shrink-0 inline-flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.icon} alt="" aria-hidden="true" className="block w-5 h-5 object-contain" />
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
              <div className="border-t border-gray-200 my-2"></div>
              {onLogout && (
                <button onClick={() => { onLogout(); setIsOpen(false); }} className="ui-button ui-button--secondary block w-full text-left px-5 py-4 text-xs uppercase tracking-widest">
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
