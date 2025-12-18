"use client";

import { useEffect, ReactNode } from 'react';

type BaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
};

export const BaseModal = ({ isOpen, onClose, children }: BaseModalProps) => {
  // ESCキーで閉じる機能
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 transition-opacity animate-fadeIn"
      onClick={onClose} // ★ここが重要: 背景クリックで閉じる
    >
      <div 
        className="bg-white rounded-xl shadow-2xl p-6 w-96 max-h-[90vh] overflow-y-auto transform transition-all scale-100 animate-bounceIn"
        onClick={(e) => e.stopPropagation()} // ★重要: モーダルの中身をクリックしても閉じないようにイベントを止める
      >
        {children}
      </div>
    </div>
  );
};