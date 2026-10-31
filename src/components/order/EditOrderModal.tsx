"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BaseModal } from '@/components/BaseModal';

type CustomOption = { name: string; price: number };
type Product = { _id: string; name: string; price: number; isAvailable?: boolean };
export type EditableOrderItem = {
  _id?: string;
  basePrice?: number;
  productId: string;
  productName: string;
  quantity: number;
  amount: number;
  detail?: string;
  selectedOptions?: CustomOption[];
};
export type EditableOrder = {
  _id: string;
  ticketNumber: string;
  totalAmount: number;
  paymentMethod?: string;
  items: EditableOrderItem[];
  note?: string;
};

export type EditSettlement = { requestId: string; expectedTotal: number; confirmed: boolean; receivedAmount?: number };

type Props = {
  paymentEditor?: ReactNode;
  canEditItems?: boolean;
  cashCalculationEnabled?: boolean;
  cashPaymentMethod?: string;
  order: EditableOrder | null;
  products: Product[];
  customizations: CustomOption[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (items: EditableOrderItem[], note: string, settlement: EditSettlement) => void;
};

export const EditOrderModal = ({ order, products, customizations, saving, error, onClose, onSave, paymentEditor, canEditItems = true }: Props) => {
  const [items, setItems] = useState<EditableOrderItem[]>([]);
  const initializedOrder = useRef<string | null>(null);


  const [requestId, setRequestId] = useState('');
  const [note, setNote] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  useEffect(() => {
    if (!order) { initializedOrder.current = null; return; }
    // A payment correction refreshes the revision without discarding the item draft.
    if (initializedOrder.current === order._id) return;
    initializedOrder.current = order._id;
    setItems(order.items.map((item) => ({ ...item, basePrice: item.amount / item.quantity - (item.selectedOptions || []).reduce((sum, o) => sum + o.price, 0), selectedOptions: item.selectedOptions || [] })));
    setRequestId(crypto.randomUUID());
    setNote(order.note || '');
    setSelectedProductId('');
  }, [order]);

  const availableProducts = products.filter((product) => product.isAvailable !== false);
  const total = useMemo(() => items.reduce((sum, item) => {
    const product = products.find((entry) => entry._id === item.productId);
    const optionPrice = (item.selectedOptions || []).reduce((optionSum, option) => optionSum + option.price, 0);
    const basePrice = item.basePrice ?? product?.price ?? item.amount / Math.max(item.quantity, 1) - optionPrice;
    return sum + (basePrice + optionPrice) * item.quantity;
  }, 0), [items, products]);

  const delta = total - (order?.totalAmount || 0);

  const invalidate = () => { setRequestId(crypto.randomUUID()); };

  const updateItem = (index: number, update: Partial<EditableOrderItem>) => {
    invalidate();
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...update } : item));
  };

  const addProduct = () => {
    const product = availableProducts.find((entry) => entry._id === selectedProductId);
    if (!product) return;
    invalidate();
    const existingIndex = items.findIndex((item) => !item._id && item.productId === product._id && !item.detail && !(item.selectedOptions || []).length);
    if (existingIndex >= 0) {
      updateItem(existingIndex, { quantity: items[existingIndex].quantity + 1 });
    } else {
      setItems((current) => [...current, { productId: product._id, productName: product.name, quantity: 1, amount: product.price, basePrice: product.price, detail: '', selectedOptions: [] }]);
    }
    setSelectedProductId('');
  };

  const toggleOption = (index: number, option: CustomOption) => {
    const selected = items[index].selectedOptions || [];
    const next = selected.some((entry) => entry.name === option.name)
      ? selected.filter((entry) => entry.name !== option.name)
      : [...selected, order?.items.find(line => line._id === items[index]._id && line._id)?.selectedOptions?.find(entry => entry.name === option.name) || option];
    updateItem(index, { selectedOptions: next });
  };

  return (
    <BaseModal isOpen={order !== null} onClose={onClose} closeOnOverlayClick={!saving} size="xl">
      <h3 className="text-xl font-black text-gray-800">注文内容の編集</h3>
      <p className="mb-5 text-sm font-bold text-gray-500">整理券番号 {order?.ticketNumber}／{canEditItems ? '商品・備考・決済方法を編集できます' : '提供済みのため決済方法のみ編集できます'}</p>

      {paymentEditor}

      <fieldset disabled={saving || !canEditItems}>
      <div className="mb-5 flex gap-2">
        <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)} className="min-w-0 flex-1 rounded-xl border-2 p-3 font-bold">
          <option value="">追加する商品を選択</option>
          {availableProducts.map((product) => <option key={product._id} value={product._id}>{product.name}（¥{product.price.toLocaleString()}）</option>)}
        </select>
        <button type="button" onClick={addProduct} disabled={!selectedProductId} className="ui-button ui-button--primary px-5">追加</button>
      </div>

      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={`${item.productId}-${index}`} className="rounded-xl border-2 border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-black text-gray-800">{item.productName}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => updateItem(index, { quantity: Math.max(1, item.quantity - 1) })} className="ui-button ui-button--secondary h-9 w-9">−</button>
                <input type="number" min="1" value={item.quantity} onChange={(event) => updateItem(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} className="h-9 w-16 rounded-lg border-2 text-center font-black" />
                <button type="button" onClick={() => updateItem(index, { quantity: item.quantity + 1 })} className="ui-button ui-button--secondary h-9 w-9">＋</button>
                <button type="button" onClick={() => { invalidate(); setItems((current) => current.filter((_, itemIndex) => itemIndex !== index)); }} className="ui-button ui-button--danger ml-2 px-3 py-2 text-sm">削除</button>
              </div>
            </div>
            {customizations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {customizations.map((option) => {
                  const selected = (item.selectedOptions || []).some((entry) => entry.name === option.name);
                  return <button key={option.name} type="button" onClick={() => toggleOption(index, option)} className={`rounded-lg border-2 px-3 py-1.5 text-sm font-bold ${selected ? 'border-[#d6a11b] bg-[#f3b928] text-gray-900' : 'border-gray-200 bg-white text-gray-600'}`}>{option.name}{option.price !== 0 ? ` (${option.price > 0 ? '+' : ''}${option.price}円)` : ''}</button>;
                })}
              </div>
            )}
            <input value={item.detail || ''} onChange={(event) => updateItem(index, { detail: event.target.value })} placeholder="商品メモ" className="mt-3 w-full rounded-lg border-2 p-2 text-sm" />
          </div>
        ))}
      </div>

      <textarea value={note} onChange={(event) => { invalidate(); setNote(event.target.value); }} placeholder="注文全体の備考" className="mt-5 h-20 w-full resize-none rounded-xl border-2 p-3" />
      <div className="mt-4 text-right text-2xl font-black text-gray-900">合計 ¥{total.toLocaleString()}</div>
      <div className="mt-3 rounded-xl bg-yellow-50 p-4 font-bold">
        <p>変更前 ¥{order?.totalAmount.toLocaleString()} → 変更後 ¥{total.toLocaleString()}</p>
        <p>{delta > 0 ? '追加のお支払い' : delta < 0 ? '差額の返金' : '追加支払い・返金は不要'}{delta !== 0 && ' ¥' + Math.abs(delta).toLocaleString()}（{order?.paymentMethod}）</p>
        <p className="mt-2 text-sm">次の画面で変更内容を確認します。追加のお支払いや返金が必要な場合は、その画面の案内に沿って手続きしてください。</p>
      </div>
      </fieldset>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-600">{error}</p>}
      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onClose} disabled={saving} className="ui-button ui-button--secondary flex-1 py-3">戻る</button>
        {canEditItems && <button type="button" onClick={() => onSave(items, note, { requestId, expectedTotal: total, confirmed: false })} disabled={saving || items.length === 0} className="ui-button ui-button--primary flex-[2] py-3">{saving ? '確認中…' : '変更内容の確認へ進む'}</button>}
      </div>
    </BaseModal>
  );
};
