"use client";

import React, { useEffect } from 'react';

type ToastProps = {
  show: boolean;
  message: string;
  title?: string;
  type?: 'success' | 'error';
  onClose: () => void;
};

export const Toast = ({ show, message, title, type = 'success', onClose }: ToastProps) => {
  useEffect(() => {
    if (show) {
      // 5秒後に自動で閉じる
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[120] animate-slideInUp">
      <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border-l-8 ${
        type === 'success' ? 'bg-white border-green-500 text-gray-800' : 'bg-white border-red-500 text-gray-800'
      }`}>
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
          type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
        }`}>
          <span className="text-xl font-bold">{type === 'success' ? '✓' : '!'}</span>
        </div>
        <div>
          <p className="font-bold text-sm">{title || (type === 'success' ? '注文完了' : 'エラー')}</p>
          <p className="text-gray-600 text-sm whitespace-pre-wrap">{message}</p>
        </div>
        <button onClick={onClose} className="ml-4 text-gray-400 hover:text-gray-600 p-1">
          ✕
        </button>
      </div>
    </div>
  );
};
