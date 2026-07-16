"use client";

import { useEffect, useState } from 'react';
import { BaseModal } from '@/components/BaseModal';

export type CustomOption = {
  name: string;
  price: number;
};

type ResultModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
};

type ConfirmModalProps = {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DetailModalProps = {
  isOpen: boolean;
  productName: string;
  currentDetail?: string;
  currentOptions?: CustomOption[];
  optionsList: CustomOption[];
  onSave: (detail: string, options: CustomOption[]) => void;
  onClose: () => void;
};

type PaymentModalProps = {
  isOpen: boolean;
  paymentMethods: string[];
  totalAmount: number;
  onConfirm: (paymentMethod: string) => void;
  onCancel: () => void;
};

type LostTicketModalProps = {
  isOpen: boolean;
  maxTicketNumber: number;
  lostTickets: number[];
  onToggle: (ticketNumber: number) => void;
  onClose: () => void;
};

export const ResultModal = ({ isOpen, title, message, type, onClose }: ResultModalProps) => (
  <BaseModal isOpen={isOpen} onClose={onClose}>
    <div className={`text-center mb-4 text-4xl ${type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
      {type === 'success' ? '✓' : '!'}
    </div>
    <h3 className="text-xl font-bold text-gray-800 text-center mb-2">{title}</h3>
    <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap">{message}</p>
    <button onClick={onClose} className="w-full py-4 bg-[#f3b928] text-gray-900 rounded-xl font-bold hover:bg-[#d6a11b] transition shadow-lg">
      閉じる
    </button>
  </BaseModal>
);

export const ConfirmModal = ({ isOpen, message, onConfirm, onCancel, confirmLabel = '実行する', cancelLabel = 'キャンセル' }: ConfirmModalProps) => (
  <BaseModal isOpen={isOpen} onClose={onCancel}>
    <div className="text-center mb-4 text-4xl text-yellow-500">?</div>
    <h3 className="text-xl font-bold text-gray-800 text-center mb-4">確認</h3>
    <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap font-medium">{message}</p>
    <div className="flex gap-3 mt-6">
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCancel(); }} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition">
        {cancelLabel}
      </button>
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onConfirm(); }} className="flex-1 py-3 bg-[#f3b928] text-gray-900 rounded-xl font-bold hover:bg-[#d6a11b] transition shadow-md">
        {confirmLabel}
      </button>
    </div>
  </BaseModal>
);

export const DetailModal = ({ isOpen, productName, currentDetail, currentOptions, optionsList, onSave, onClose }: DetailModalProps) => {
  const [noteVal, setNoteVal] = useState("");
  const [selectedOpts, setSelectedOpts] = useState<CustomOption[]>([]);

  useEffect(() => {
    if (isOpen) {
      setNoteVal(currentDetail || "");
      setSelectedOpts(currentOptions || []);
    }
  }, [currentDetail, currentOptions, isOpen]);

  const toggleOption = (option: CustomOption) => {
    const exists = selectedOpts.find(o => o.name === option.name);
    setSelectedOpts(exists ? selectedOpts.filter(o => o.name !== option.name) : [...selectedOpts, option]);
  };

  return (
    <BaseModal isOpen={isOpen} onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">詳細設定: {productName}</h3>
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-wider">オプション</p>
        <div className="flex flex-wrap gap-2">
          {optionsList?.map((opt, index) => {
            if (!opt.name) return null;
            const isSelected = selectedOpts.some(o => o.name === opt.name);
            return (
              <button
                key={`${opt.name}-${index}`}
                onClick={() => toggleOption(opt)}
                className={`px-4 py-2.5 rounded-xl text-sm border-2 transition-all duration-200 font-bold ${
                  isSelected
                    ? 'bg-[#f3b928] text-gray-900 border-[#d6a11b] shadow-md transform scale-105'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#f3b928]'
                }`}
              >
                <span>{opt.name}</span>
                {opt.price !== 0 && (
                  <span className={`text-xs ml-1 ${isSelected ? 'text-gray-800' : (opt.price < 0 ? 'text-red-500' : 'text-gray-400')}`}>
                    ({opt.price > 0 ? '+' : ''}{opt.price}円)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-2 font-bold uppercase tracking-wider">備考メモ</p>
        <textarea
          value={noteVal}
          onChange={(e) => setNoteVal(e.target.value)}
          className="w-full border-2 border-gray-200 p-3 rounded-xl h-24 outline-none focus:ring-2 focus:ring-[#f3b928] font-sans text-sm resize-none"
          placeholder="例: ネギ抜き、マヨ多めなど"
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition">キャンセル</button>
        <button onClick={() => onSave(noteVal, selectedOpts)} className="flex-1 py-3 bg-[#f3b928] text-gray-900 rounded-xl font-bold hover:bg-[#d6a11b] transition shadow-lg">保存</button>
      </div>
    </BaseModal>
  );
};

export const PaymentModal = ({ isOpen, paymentMethods, totalAmount, onConfirm, onCancel }: PaymentModalProps) => {
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (isOpen) setSelected("");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} closeOnOverlayClick={false}>
      <h3 className="text-xl font-bold text-gray-800 text-center mb-1">お支払い</h3>
      <p className="text-center text-gray-400 text-sm mb-4 font-bold uppercase tracking-widest">決済方法を選択してください</p>
      <div className="bg-[#fff8e1] p-4 rounded-2xl mb-6 text-center">
        <span className="text-gray-500 text-sm block font-bold mb-1">合計金額</span>
        <span className="text-4xl font-black text-[#d6a11b] font-mono">¥{totalAmount.toLocaleString()}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-8">
        {paymentMethods.map((method) => (
          <button
            key={method}
            onClick={() => setSelected(method)}
            className={`py-5 px-2 rounded-2xl font-black text-lg transition-all duration-200 shadow-sm border-2 ${
              selected === method
                ? 'bg-[#f3b928] text-gray-900 border-[#d6a11b] ring-4 ring-yellow-100 shadow-xl transform scale-105'
                : 'bg-white text-gray-700 border-gray-100 hover:bg-gray-50 hover:border-blue-200'
            }`}
          >
            {method}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-bold hover:bg-gray-200 transition">戻る</button>
        <button
          onClick={() => onConfirm(selected)}
          disabled={!selected}
          className={`flex-[2] py-4 text-white rounded-xl font-black text-xl transition-all shadow-lg ${selected ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-300 cursor-not-allowed text-white'}`}
        >
          注文を確定
        </button>
      </div>
    </BaseModal>
  );
};

export const LostTicketModal = ({ isOpen, maxTicketNumber, lostTickets, onToggle, onClose }: LostTicketModalProps) => (
  <BaseModal isOpen={isOpen} onClose={onClose}>
    <h3 className="text-lg font-bold text-gray-800 mb-2">整理券除外設定</h3>
    <p className="text-xs text-gray-500 mb-4">紛失した番号を選択してください。発券時にスキップされます。</p>
    <div className="grid grid-cols-5 gap-2 max-h-64 overflow-y-auto p-2 mb-4 bg-gray-50 rounded-lg border-2">
      {Array.from({ length: maxTicketNumber }, (_, i) => i + 1).map((num) => {
        const isLost = lostTickets.includes(num);
        return (
          <button
            key={num}
            onClick={() => onToggle(num)}
            className={`p-2 rounded font-bold text-sm transition border-2 ${isLost ? 'bg-red-500 text-white border-red-600 shadow-inner' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}
          >
            {num}
          </button>
        );
      })}
    </div>
    <button onClick={onClose} className="w-full py-3 bg-[#f3b928] text-gray-900 rounded-lg font-bold hover:bg-[#d6a11b] transition">
      設定を閉じる
    </button>
  </BaseModal>
);
