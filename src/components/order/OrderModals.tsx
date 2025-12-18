"use client";

import { useState, useEffect } from 'react';
import { BaseModal } from '@/components/BaseModal';

// 必要な型定義
export type CustomOption = {
  name: string;
  price: number;
};

// --- 結果表示モーダル ---
export const ResultModal = ({ isOpen, title, message, type, onClose }: any) => {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <div className={`text-center mb-4 text-4xl ${type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
        {type === 'success' ? '✓' : '!'}
      </div>
      <h3 className="text-xl font-bold text-gray-800 text-center mb-2">{title}</h3>
      <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap">{message}</p>
      <button
        onClick={onClose}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
      >
        閉じる
      </button>
    </BaseModal>
  );
};

// --- 確認モーダル ---
export const ConfirmModal = ({ isOpen, message, onConfirm, onCancel }: any) => {
  return (
    <BaseModal isOpen={isOpen} onClose={onCancel}>
      <div className="text-center mb-4 text-4xl text-yellow-500">?</div>
      <h3 className="text-xl font-bold text-gray-800 text-center mb-4">確認</h3>
      <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap">{message}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
        >
          キャンセル
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition"
        >
          実行する
        </button>
      </div>
    </BaseModal>
  );
};

// --- 詳細設定モーダル (修正版) ---
export const DetailModal = ({ isOpen, productName, currentDetail, currentOptions, optionsList, onSave, onClose }: any) => {
  const [noteVal, setNoteVal] = useState<string>("");
  const [selectedOpts, setSelectedOpts] = useState<CustomOption[]>([]);
  
  // モーダルが開くたびに初期値をセット
  useEffect(() => { 
    if (isOpen) {
      setNoteVal(currentDetail || ""); 
      setSelectedOpts(currentOptions || []);
    }
  }, [currentDetail, currentOptions, isOpen]);

  const toggleOption = (option: CustomOption) => {
    const exists = selectedOpts.find(o => o.name === option.name);
    if (exists) {
      setSelectedOpts(selectedOpts.filter(o => o.name !== option.name));
    } else {
      setSelectedOpts([...selectedOpts, option]);
    }
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-800 mb-2">詳細設定: {productName}</h3>
      
      {/* オプション選択エリア */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">オプションを選択 (タップで切替)</p>
        <div className="flex flex-wrap gap-2">
          {optionsList && optionsList.map((opt: CustomOption, index: number) => {
            // 名前が空の場合は表示しない
            if (!opt.name) return null;
            
            const isSelected = selectedOpts.some(o => o.name === opt.name);
            return (
              <button
                // ★修正: keyにindexを含めて一意にする (エラー回避)
                key={`${opt.name}-${index}`} 
                onClick={() => toggleOption(opt)}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-1 transition ${
                  isSelected 
                    ? 'bg-orange-500 text-white border-orange-600 shadow-md' 
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>{opt.name}</span>
                {/* 価格表示 (マイナスの場合は赤字) */}
                {opt.price !== 0 && (
                  <span className={`text-xs ${
                    isSelected ? 'text-white opacity-90' : (opt.price < 0 ? 'text-red-500 font-bold' : 'opacity-80')
                  }`}>
                    ({opt.price > 0 ? '+' : ''}{opt.price}円)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-1">備考欄 (自由入力)</p>
      <textarea
        value={noteVal}
        onChange={(e) => setNoteVal(e.target.value)}
        className="w-full border border-gray-300 p-2 rounded-lg h-24 mb-4 outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="手入力も可能です"
      />
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300">キャンセル</button>
        <button onClick={() => onSave(noteVal, selectedOpts)} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">保存</button>
      </div>
    </BaseModal>
  );
};