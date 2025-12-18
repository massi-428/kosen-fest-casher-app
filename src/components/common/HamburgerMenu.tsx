"use client";

import { useState } from 'react';

type HamburgerMenuProps = {
  onNavigate: (path: string) => void;
  onReset: () => void;
};

export const HamburgerMenu = ({ onNavigate, onReset }: HamburgerMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="p-2 text-gray-600 hover:bg-gray-100 rounded focus:outline-none"
      >
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          ></div>
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 animate-fadeIn origin-top-right overflow-hidden z-50">
            <div className="py-1">
              <button 
                onClick={() => { onNavigate('/settings'); setIsOpen(false); }}
                className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition"
              >
                設定画面へ
              </button>
              <button 
                onClick={() => { onNavigate('/report'); setIsOpen(false); }}
                className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition"
              >
                営業日報へ
              </button>
              <button 
                onClick={() => { onNavigate('/history'); setIsOpen(false); }}
                className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition"
              >
                注文履歴 (管理) へ
              </button>
              <button 
                onClick={() => { onNavigate('/kds'); setIsOpen(false); }}
                className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition"
              >
                KDS (調理画面) へ
              </button>
              <div className="border-t border-gray-100 my-1"></div>
              <button 
                onClick={() => { onReset(); setIsOpen(false); }}
                className="block w-full text-left px-4 py-3 text-red-600 hover:bg-red-50 transition text-sm"
              >
                データリセット
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};