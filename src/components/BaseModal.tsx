"use client";

import { useEffect, ReactNode } from 'react';

type BaseModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  closeOnOverlayClick?: boolean; // ★追加: 枠外クリックで閉じるかどうか
};

export const BaseModal = ({ isOpen, onClose, children, closeOnOverlayClick = true }: BaseModalProps) => {
  // ESCキーで閉じる機能
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      // 枠外クリック無効ならESCも無効にする場合はここも制御可能ですが、
      // 通常はESCは効いたほうが親切です。今回は要望に合わせて枠外クリックのみ制御します。
      if (e.key === 'Escape' && closeOnOverlayClick) onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, closeOnOverlayClick]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 transition-opacity p-4 font-sans"
      onClick={() => {
        // ★修正: 設定がtrueの場合のみ閉じる
        if (closeOnOverlayClick) onClose();
      }} 
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto transform transition-all animate-bounceIn"
        onClick={(e) => e.stopPropagation()} 
      >
        {children}
      </div>
    </div>
  );
};
