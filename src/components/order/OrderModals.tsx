"use client";

import { useState, useEffect } from 'react';
import { BaseModal } from '@/components/BaseModal';

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

// --- 詳細設定モーダル ---
export const DetailModal = ({ isOpen, productName, currentDetail, currentOptions, optionsList, onSave, onClose }: any) => {
  const [noteVal, setNoteVal] = useState<string>("");
  const [selectedOpts, setSelectedOpts] = useState<CustomOption[]>([]);
  
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
      
      <div className="mb-4">
        <p className="text-xs text-gray-500 mb-2">オプションを選択 (タップで切替)</p>
        <div className="flex flex-wrap gap-2">
          {optionsList && optionsList.map((opt: CustomOption, index: number) => {
            if (!opt.name) return null;
            const isSelected = selectedOpts.some(o => o.name === opt.name);
            return (
              <button
                key={`${opt.name}-${index}`} 
                onClick={() => toggleOption(opt)}
                className={`px-3 py-2 rounded-lg text-sm border flex items-center gap-1 transition ${
                  isSelected 
                    ? 'bg-orange-500 text-white border-orange-600 shadow-md' 
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>{opt.name}</span>
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

// ★追加: 決済方法選択モーダル
export const PaymentModal = ({ isOpen, paymentMethods, totalAmount, onConfirm, onCancel }: any) => {
  const [selected, setSelected] = useState("");

  // モーダルが開くたびに選択状態をリセット
  useEffect(() => {
    if (isOpen) setSelected("");
  }, [isOpen]);

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected);
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} closeOnOverlayClick={false}> {/* 枠外クリックで閉じない */}
      <h3 className="text-xl font-bold text-gray-800 text-center mb-2">お支払い方法の選択</h3>
      <p className="text-center text-3xl font-black text-blue-600 mb-6">¥{totalAmount.toLocaleString()}</p>
      
      <div className="grid grid-cols-2 gap-3 mb-6">
        {paymentMethods.map((method: string) => (
          <button
            key={method}
            onClick={() => setSelected(method)}
            className={`py-4 px-2 rounded-xl font-bold text-lg transition shadow-sm border-2 ${
              selected === method
                ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {method}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition"
        >
          戻る
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selected}
          className={`flex-1 py-3 text-white rounded-lg font-bold transition shadow-lg ${
            selected 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-gray-400 cursor-not-allowed'
          }`}
        >
          確定する
        </button>
      </div>
    </BaseModal>
  );
};