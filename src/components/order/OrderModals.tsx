"use client";

import { useEffect, useState } from 'react';
import { BaseModal } from '@/components/BaseModal';
import { Toast } from '@/components/common/Toast';

export type CustomOption = {
  name: string;
  price: number;
};

type ResultModalProps = {
  legacyAppearance?: boolean;
  isOpen: boolean;
  title: string;
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
};

type ConfirmModalProps = {
  legacyAppearance?: boolean;
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
};

type DetailModalProps = {
  legacyAppearance?: boolean;
  isOpen: boolean;
  productName: string;
  currentDetail?: string;
  currentOptions?: CustomOption[];
  optionsList: CustomOption[];
  onSave: (detail: string, options: CustomOption[]) => void;
  onClose: () => void;
};

type PaymentModalProps = {
  legacyAppearance?: boolean;
  isOpen: boolean;
  paymentMethods: string[];
  totalAmount: number;
  cashCalculationEnabled: boolean;
  cashPaymentMethod: string;
  onConfirm: (paymentMethod: string, receivedAmount?: number) => void;
  onCancel: () => void;
};

type LostTicketModalProps = {
  legacyAppearance?: boolean;
  isOpen: boolean;
  maxTicketNumber: number;
  lostTickets: number[];
  onToggle: (ticketNumber: number) => void;
  onClose: () => void;
};

export const ResultModal = ({ legacyAppearance = false, isOpen, title, message, type, onClose }: ResultModalProps) => type === 'success' ? (
  <Toast legacyAppearance={legacyAppearance} show={isOpen} title={title} message={message} onClose={onClose} />
) : (
  <BaseModal legacyAppearance={legacyAppearance} isOpen={isOpen} onClose={onClose}>
    <div className="text-center mb-4 text-4xl text-red-500">
      !
    </div>
    <h3 className="text-xl font-bold text-gray-800 text-center mb-2">{title}</h3>
    <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap">{message}</p>
    <button onClick={onClose} className={legacyAppearance ? ("w-full py-4 bg-[#f3b928] text-gray-900 rounded-xl font-bold hover:bg-[#d6a11b] transition shadow-lg") : ("ui-button ui-button--primary w-full py-4")}>
      閉じる
    </button>
  </BaseModal>
);

export const ConfirmModal = ({ legacyAppearance = false, isOpen, message, onConfirm, onCancel, confirmLabel = '実行する', cancelLabel = '戻る' }: ConfirmModalProps) => (
  <BaseModal legacyAppearance={legacyAppearance} isOpen={isOpen} onClose={onCancel}>
    <div className="text-center mb-4 text-4xl text-yellow-500">?</div>
    <h3 className="text-xl font-bold text-gray-800 text-center mb-4">確認</h3>
    <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap font-medium">{message}</p>
    <div className="flex gap-3 mt-6">
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCancel(); }} className={legacyAppearance ? ("flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition") : ("ui-button ui-button--secondary flex-1 py-3")}>
        {cancelLabel}
      </button>
      <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onConfirm(); }} className={legacyAppearance ? ("flex-1 py-3 bg-[#f3b928] text-gray-900 rounded-xl font-bold hover:bg-[#d6a11b] transition shadow-md") : ("ui-button ui-button--primary flex-1 py-3")}>
        {confirmLabel}
      </button>
    </div>
  </BaseModal>
);

export const DetailModal = ({ legacyAppearance = false, isOpen, productName, currentDetail, currentOptions, optionsList, onSave, onClose }: DetailModalProps) => {
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
    <BaseModal legacyAppearance={legacyAppearance} isOpen={isOpen} onClose={onClose}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">商品オプション・メモ: {productName}</h3>
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
        <button onClick={onClose} className={legacyAppearance ? ("flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition") : ("ui-button ui-button--secondary flex-1 py-3")}>変更せずに戻る</button>
        <button onClick={() => onSave(noteVal, selectedOpts)} className={legacyAppearance ? ("flex-1 py-3 bg-[#f3b928] text-gray-900 rounded-xl font-bold hover:bg-[#d6a11b] transition shadow-lg") : ("ui-button ui-button--primary flex-1 py-3")}>保存</button>
      </div>
    </BaseModal>
  );
};

export const PaymentModal = ({ legacyAppearance = false, isOpen, paymentMethods, totalAmount, cashCalculationEnabled, cashPaymentMethod, onConfirm, onCancel }: PaymentModalProps) => {
  const [selected, setSelected] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");

  useEffect(() => {
    if (isOpen) {
      setSelected("");
      setReceivedAmount("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const usesCashCalculation = cashCalculationEnabled && selected === cashPaymentMethod;
  const received = Number(receivedAmount);
  const canConfirmCash = Number.isInteger(received) && received >= totalAmount;
  const changeAmount = canConfirmCash ? received - totalAmount : 0;

  return (
    <BaseModal legacyAppearance={legacyAppearance} isOpen={isOpen} onClose={onCancel} closeOnOverlayClick={false}>
      <h3 className="text-xl font-bold text-gray-800 text-center mb-1">お支払い</h3>
      <p className="text-center text-gray-400 text-sm mb-4 font-bold uppercase tracking-widest">支払い方法を選択してください</p>
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
      {usesCashCalculation && (
        <div className="mb-6 rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <label className="block text-sm font-black text-gray-700">
            お預かり金額
            <input
              type="number"
              min={totalAmount}
              step="1"
              inputMode="numeric"
              value={receivedAmount}
              onChange={(e) => setReceivedAmount(e.target.value)}
              placeholder={`${totalAmount}`}
              className="mt-2 w-full rounded-xl border-2 border-amber-300 bg-white p-3 text-right text-2xl font-black outline-none focus:ring-2 focus:ring-[#f3b928]"
            />
          </label>
          <button type="button" onClick={() => setReceivedAmount(String(totalAmount))} className={legacyAppearance ? ("mt-2 w-full rounded-lg bg-white py-2 text-sm font-bold text-gray-700 border border-amber-200 hover:bg-amber-100") : ("ui-button ui-button--secondary mt-2 w-full py-2 text-sm")}>ちょうど預かる</button>
          <div className="mt-4 flex items-center justify-between border-t border-amber-200 pt-4">
            <span className="font-bold text-gray-600">お釣り</span>
            <span className={`text-3xl font-black font-mono ${canConfirmCash ? 'text-green-700' : 'text-gray-400'}`}>¥{changeAmount.toLocaleString()}</span>
          </div>
          {receivedAmount && !canConfirmCash && <p className="mt-2 text-center text-sm font-bold text-red-600">合計金額以上を入力してください</p>}
        </div>
      )}
      <div className="flex gap-3">
        <button onClick={onCancel} className={legacyAppearance ? ("flex-1 py-4 bg-gray-100 text-gray-500 rounded-xl font-bold hover:bg-gray-200 transition") : ("ui-button ui-button--secondary flex-1 py-4")}>戻る</button>
        <button
          onClick={() => onConfirm(selected, usesCashCalculation ? received : undefined)}
          disabled={!selected || (usesCashCalculation && !canConfirmCash)}
          className={legacyAppearance ? (`flex-[2] py-4 text-white rounded-xl font-black text-xl transition-all shadow-lg ${selected && (!usesCashCalculation || canConfirmCash) ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-300 cursor-not-allowed text-white'}`) : ("ui-button ui-button--primary flex-[2] py-4 text-lg")}
        >
          注文を確定
        </button>
      </div>
    </BaseModal>
  );
};

export const LostTicketModal = ({ legacyAppearance = false, isOpen, maxTicketNumber, lostTickets, onToggle, onClose }: LostTicketModalProps) => (
  <BaseModal legacyAppearance={legacyAppearance} isOpen={isOpen} onClose={onClose}>
    <h3 className="text-lg font-bold text-gray-800 mb-2">紛失した整理券</h3>
    <p className="text-xs text-gray-500 mb-4">紛失した番号を押すと赤くなり、その番号は発券されなくなります。見つかったら、もう一度押して解除してください。</p>
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
    <button onClick={onClose} className={legacyAppearance ? ("w-full py-3 bg-[#f3b928] text-gray-900 rounded-lg font-bold hover:bg-[#d6a11b] transition") : ("ui-button ui-button--primary w-full py-3")}>
      閉じる
    </button>
  </BaseModal>
);
