"use client";

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type ToastProps = {
  show: boolean;
  message: string;
  title?: string;
  type?: 'success' | 'error';
  onClose: () => void;
};

export const Toast = ({ show, message, title, type = 'success', onClose }: ToastProps) => {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (show) {
      // 5秒後に自動で閉じる
      const timer = setTimeout(() => {
        closeRef.current();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [show, message, title, type]);

  if (!show || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] -translate-x-1/2 z-[200] w-[calc(100%-2rem)] max-w-lg pointer-events-none">
      <div role={type === 'error' ? 'alert' : 'status'} aria-atomic="true" className={`toast-from-top pointer-events-auto flex items-center gap-3 px-4 py-4 rounded-2xl shadow-2xl border-l-8 ${
        type === 'success' ? 'bg-white border-green-500 text-gray-800' : 'bg-white border-red-500 text-gray-800'
      }`}>
        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
          type === 'success' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
        }`}>
          <span className="text-xl font-bold">{type === 'success' ? '✓' : '!'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm">{title || (type === 'success' ? '完了' : 'エラー')}</p>
          <p className="text-gray-600 text-sm whitespace-pre-wrap break-words">{message}</p>
        </div>
        <button type="button" aria-label="通知を閉じる" onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600 p-2">
          ✕
        </button>
      </div>
    </div>, document.body
  );
};
