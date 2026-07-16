"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HamburgerMenu as SharedHamburgerMenu } from '@/components/common/HamburgerMenu';
import {
  ConfirmModal as SharedConfirmModal,
  DetailModal as SharedDetailModal,
  LostTicketModal as SharedLostTicketModal,
  PaymentModal as SharedPaymentModal,
  ResultModal as SharedResultModal,
} from '@/components/order/OrderModals';
import { Toast } from '@/components/common/Toast';

const navigateTo = (path: string) => {
  if (typeof window !== 'undefined') window.location.href = path;
};

const apiFetch = async (url: string, options: RequestInit = {}) => {
  try {
    const baseUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    const headers = new Headers(options.headers || {});
    return await fetch(absoluteUrl, { ...options, headers });
  } catch (error) {
    console.error('Fetch error:', error);
    return { ok: false, status: 500, json: async () => ({ message: '通信エラー' }) } as Response;
  }
};

type CustomOption = { name: string; price: number };
type OrderItem = {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
  detail?: string;
  selectedOptions?: CustomOption[];
};
type Product = { _id: string; name: string; price: number };
type ModalData = Partial<
  React.ComponentProps<typeof SharedResultModal> &
  React.ComponentProps<typeof SharedConfirmModal> &
  React.ComponentProps<typeof SharedDetailModal>
> & { index?: number };

export default function OrderPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestIdRef = useRef('');
  const [products, setProducts] = useState<Product[]>([]);
  const [maxTicketNumber, setMaxTicketNumber] = useState(30);
  const [currentTicket, setCurrentTicket] = useState('1');
  const [activeTickets, setActiveTickets] = useState<number[]>([]);
  const [lostTickets, setLostTickets] = useState<number[]>([]);
  const [lastIssuedNumber, setLastIssuedNumber] = useState(0);
  const [currentPendingItemCount, setCurrentPendingItemCount] = useState(0);
  const [maxPendingItemCount, setMaxPendingItemCount] = useState(30);
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState(10);
  const [waitInfo, setWaitInfo] = useState<{ estimatedWaitLabel: string; isEstimateReliable: boolean } | null>(null);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [customizationOptions, setCustomizationOptions] = useState<CustomOption[]>([]);
  const [note, setNote] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [modals, setModals] = useState({ result: false, confirm: false, detail: false, payment: false, lost: false });
  const [modalData, setModalData] = useState<ModalData>({});
  const [toast, setToast] = useState<{ show: boolean; message: string; title?: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });

  const toggleModal = (key: keyof typeof modals, val: boolean, data: ModalData = {}) => {
    setModals((prev) => ({ ...prev, [key]: val }));
    if (val) setModalData(data);
  };

  const closeConfirmModal = () => {
    setModals((prev) => ({ ...prev, confirm: false }));
    setModalData({});
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success', title?: string) => {
    setToast({ show: true, message, type, title });
  };

  const newRequestId = () => crypto.randomUUID();

  useEffect(() => {
    const checkSession = async () => {
      const res = await apiFetch('/api/me', { cache: 'no-store' });
      if (!res.ok) navigateTo('/login');
    };
    checkSession();
  }, []);

  const fetchProducts = useCallback(async () => {
    const res = await apiFetch('/api/products');
    if (res.ok) setProducts(await res.json());
  }, []);

  const fetchTicketStatus = useCallback(async () => {
    const res = await apiFetch('/api/tickets');
    if (res.ok) {
      const data = await res.json();
      setActiveTickets(data.activeTickets || []);
      setLastIssuedNumber(data.lastTicketNumber || 0);
      setCurrentPendingItemCount(data.currentPendingItemCount || 0);
      setMaxPendingItemCount(data.maxPendingItemCount || 30);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await apiFetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.maxTicketNumber) setMaxTicketNumber(data.maxTicketNumber);
      if (data.paymentMethods) setPaymentMethods(data.paymentMethods);
      if (data.customizations) setCustomizationOptions(data.customizations);
      if (data.lostTickets) setLostTickets(data.lostTickets);
      setMaxPendingItemCount(data.maxPendingItemCount || 30);
      setMaxItemsPerOrder(data.maxItemsPerOrder || 10);
    }
  }, []);

  const fetchWaitTime = useCallback(async () => {
    const res = await apiFetch('/api/wait-time', { cache: 'no-store' });
    if (res.ok) setWaitInfo(await res.json());
  }, []);

  useEffect(() => {
    requestIdRef.current = newRequestId();
    fetchProducts();
    fetchTicketStatus();
    fetchSettings();
    fetchWaitTime();
    const interval = setInterval(() => { fetchTicketStatus(); fetchSettings(); fetchWaitTime(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchProducts, fetchTicketStatus, fetchSettings, fetchWaitTime]);

  useEffect(() => {
    let nextNum = lastIssuedNumber + 1;
    if (nextNum > maxTicketNumber) nextNum = 1;
    let loopCount = 0;
    while ((activeTickets.includes(nextNum) || lostTickets.includes(nextNum)) && loopCount < maxTicketNumber) {
      nextNum += 1;
      if (nextNum > maxTicketNumber) nextNum = 1;
      loopCount += 1;
    }
    setCurrentTicket(loopCount >= maxTicketNumber ? '発券不可' : String(nextNum));
  }, [activeTickets, lostTickets, lastIssuedNumber, maxTicketNumber]);

  const addToCart = (product: Product) => {
    if (isEditMode) return;
    setCartItems((prev) => {
      const idx = prev.findIndex((item) => item.productId === product._id && !item.detail && (!item.selectedOptions || item.selectedOptions.length === 0));
      if (idx !== -1) return prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { productId: product._id, productName: product.name, price: product.price, quantity: 1, detail: '', selectedOptions: [] }];
    });
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    setCartItems((prev) => prev.map((item, i) => i === index ? { ...item, quantity: newQuantity } : item));
  };

  const totalAmount = cartItems.reduce((sum, item) => {
    const optionPrice = item.selectedOptions?.reduce((s, option) => s + option.price, 0) || 0;
    return sum + ((item.price + optionPrice) * item.quantity);
  }, 0);

  const currentOrderItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleOpenPayment = () => {
    const exceedsPendingWarning = currentPendingItemCount + currentOrderItemCount > maxPendingItemCount;
    const exceedsOrderWarning = currentOrderItemCount > maxItemsPerOrder;
    if (exceedsPendingWarning || exceedsOrderWarning) {
      const warningReasons = [
        exceedsPendingWarning ? '現在注文が混み合っているため、提供まで時間がかかる可能性があります。' : '',
        exceedsOrderWarning ? `今回の注文は想定数（${maxItemsPerOrder}）を超えています。` : '',
      ].filter(Boolean).join('\n');
      toggleModal('confirm', true, {
        message: `${warningReasons}\nそれでも注文を追加しますか？\n\n未提供 ${currentPendingItemCount} / 警告基準 ${maxPendingItemCount}\n今回の注文 ${currentOrderItemCount}`,
        onConfirm: () => {
          toggleModal('confirm', false);
          toggleModal('payment', true);
        },
        confirmLabel: 'はい、注文を続ける',
        cancelLabel: '注文に戻る',
      });
      return;
    }
    toggleModal('payment', true);
  };

  const handleOrder = async (method: string) => {
    if (isSubmitting) return;
    toggleModal('payment', false);
    setIsSubmitting(true);
    if (!requestIdRef.current) requestIdRef.current = newRequestId();
    const orderData = {
      requestId: requestIdRef.current,
      items: cartItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        detail: item.detail,
        selectedOptionNames: item.selectedOptions?.map((option) => option.name) || [],
      })),
      paymentMethod: method,
      note,
    };

    try {
      const res = await apiFetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const issuedTicketNumber = data.ticketNumber || data.order?.ticketNumber || currentTicket;
        const capacityNotice = data.warning?.message ? `\n警告: ${data.warning.message}` : '';
        showToast(`注文を登録しました\n整理番号: ${issuedTicketNumber}\n決済方法: ${method}${capacityNotice}`, 'success');
        setCartItems([]);
        setNote('');
        requestIdRef.current = newRequestId();
        fetchTicketStatus();
      } else {
        const err = await res.json().catch(() => ({}));
        toggleModal('result', true, { title: '保存エラー', message: `${err.message || '不明なエラー'}\nログイン状態を確認してください`, type: 'error' });
      }
    } catch {
      toggleModal('result', true, { title: '通信エラー', message: 'サーバーとの通信に失敗しました', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLostTicket = async (num: number) => {
    const next = lostTickets.includes(num) ? lostTickets.filter((n) => n !== num) : [...lostTickets, num];
    setLostTickets(next);
    await apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lostTickets: next }) });
  };

  const handleSaveProduct = async () => {
    if (!formName || !formPrice) return toggleModal('result', true, { title: '入力エラー', message: '商品名と価格を入力してください', type: 'error' });
    const method = editingProduct ? 'PUT' : 'POST';
    const body = editingProduct ? { _id: editingProduct._id, name: formName, price: formPrice } : { name: formName, price: formPrice };

    try {
      const res = await apiFetch('/api/products', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        fetchProducts();
        setEditingProduct(null);
        setFormName('');
        setFormPrice('');
        showToast('商品を保存しました', 'success', '変更完了');
      } else {
        const errData = await res.json().catch(() => ({}));
        toggleModal('result', true, { title: '保存エラー', message: errData.message || '保存できませんでした', type: 'error' });
      }
    } catch {
      toggleModal('result', true, { title: '通信エラー', message: 'サーバーとの通信に失敗しました', type: 'error' });
    }
  };

  const handleDeleteProduct = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    toggleModal('confirm', true, { message: 'この商品を削除しますか？', onConfirm: async () => {
      toggleModal('confirm', false);
      const res = await apiFetch('/api/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: id }) });
      if (res.ok) {
        fetchProducts();
        setEditingProduct(null);
        setFormName('');
        setFormPrice('');
        showToast('商品を削除しました', 'success', '変更完了');
      } else {
        toggleModal('result', true, { title: 'エラー', message: '削除に失敗しました', type: 'error' });
      }
    } });
  };

  return (
    <div className="fixed inset-0 w-screen h-dvh bg-gray-100 overflow-hidden overscroll-none font-sans text-gray-900 flex relative">
      <SharedResultModal isOpen={modals.result} title={modalData.title || ''} message={modalData.message || ''} type={modalData.type || 'success'} onClose={() => toggleModal('result', false)} />
      <SharedConfirmModal isOpen={modals.confirm} message={modalData.message || ''} onConfirm={modalData.onConfirm || (() => {})} onCancel={closeConfirmModal} confirmLabel={modalData.confirmLabel} cancelLabel={modalData.cancelLabel} />
      <Toast show={toast.show} message={toast.message} title={toast.title} type={toast.type} onClose={() => setToast((prev) => ({ ...prev, show: false }))} />
      <SharedDetailModal isOpen={modals.detail} productName={modalData.productName || ''} currentDetail={modalData.currentDetail} currentOptions={modalData.currentOptions} optionsList={customizationOptions} onSave={(detail: string, options: CustomOption[]) => {
        setCartItems((prev) => {
          const targetIndex = modalData.index ?? -1;
          const target = prev[targetIndex];
          if (!target) return prev;
          if (target.quantity === 1) return prev.map((item, i) => i === targetIndex ? { ...item, detail, selectedOptions: options } : item);
          const next = [...prev];
          next[targetIndex] = { ...target, quantity: target.quantity - 1 };
          next.splice(targetIndex + 1, 0, { ...target, quantity: 1, detail, selectedOptions: options });
          return next;
        });
        toggleModal('detail', false);
      }} onClose={() => toggleModal('detail', false)} />
      <SharedPaymentModal isOpen={modals.payment} paymentMethods={paymentMethods} totalAmount={totalAmount} onConfirm={handleOrder} onCancel={() => toggleModal('payment', false)} />
      <SharedLostTicketModal isOpen={modals.lost} maxTicketNumber={maxTicketNumber} lostTickets={lostTickets} onToggle={toggleLostTicket} onClose={() => toggleModal('lost', false)} />

      <div className="w-3/5 flex flex-col h-full min-h-0 bg-white border-r overflow-hidden">
        <div className="p-4 flex justify-between items-center border-b shadow-sm flex-shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-700">{isEditMode ? 'メニュー編集' : '商品メニュー'}</h2>
            {waitInfo && <p className="text-sm font-bold text-blue-700">現在の待ち時間目安: {waitInfo.estimatedWaitLabel}{!waitInfo.isEstimateReliable && <span className="ml-2 text-xs text-gray-500">（参考値）</span>}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsEditMode(!isEditMode)} className={`px-4 py-2 rounded-full font-bold text-sm transition-all shadow-sm ${isEditMode ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {isEditMode ? '終了' : '商品管理'}
            </button>
            <SharedHamburgerMenu
              onNavigate={(path) => navigateTo(path)}
              onReset={() => toggleModal('confirm', true, { message: '全データをリセットして初期化しますか？\n商品リストは保持されます。', onConfirm: async () => { await apiFetch('/api/debug/reset', { method: 'DELETE' }); window.location.reload(); } })}
              onLogout={async () => { await apiFetch('/api/logout', { method: 'POST' }); navigateTo('/login'); }}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain touch-pan-y bg-gray-50/30">
          <div className="grid grid-cols-3 gap-4">
            {products.map((product) => (
              <button key={product._id} onClick={() => isEditMode ? (setEditingProduct(product), setFormName(product.name), setFormPrice(String(product.price))) : addToCart(product)} className="h-28 bg-white border-2 rounded-2xl flex flex-col items-center justify-center p-2 hover:border-[#f3b928] hover:bg-[#fff8e1] transition-all active:scale-95 shadow-sm relative">
                <span className="font-black text-gray-800 text-center leading-tight mb-1">{product.name}</span>
                <span className="text-gray-500 text-sm font-bold font-mono">¥{product.price.toLocaleString()}</span>
                {isEditMode && (
                  <div onClick={(e) => handleDeleteProduct(e, product._id)} className="absolute top-1 right-1 w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors z-10 font-bold text-xs">
                    x
                  </div>
                )}
              </button>
            ))}
            {isEditMode && <button onClick={() => { setEditingProduct(null); setFormName(''); setFormPrice(''); }} className="h-28 border-4 border-dashed border-green-400 text-green-500 rounded-2xl font-black text-4xl hover:bg-green-50 transition-colors">+</button>}
          </div>
        </div>
      </div>

      <div className="w-2/5 bg-white flex flex-col h-full min-h-0 shadow-2xl border-l border-gray-200 overflow-hidden">
        {isEditMode ? (
          <div className="p-6 bg-gray-50 h-full overflow-hidden">
            <h3 className="text-lg font-black mb-6 text-gray-700 border-b-2 border-gray-200 pb-2">{editingProduct ? '商品情報の更新' : '新規商品の追加'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Product Name</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border-2 border-gray-200 p-3 rounded-xl mt-1 outline-none focus:ring-2 focus:ring-[#f3b928] font-bold" placeholder="商品名" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Price (YEN)</label>
                <input value={formPrice} onChange={(e) => setFormPrice(e.target.value)} type="number" className="w-full border-2 border-gray-200 p-3 rounded-xl mt-1 outline-none focus:ring-2 focus:ring-[#f3b928] font-black font-mono" placeholder="450" />
              </div>
            </div>
            <button onClick={handleSaveProduct} className="w-full py-4 bg-[#f3b928] text-gray-900 font-black rounded-xl shadow-lg hover:bg-[#d6a11b] transition transform active:scale-95 text-lg mt-6">保存する</button>
            {editingProduct && <button onClick={(e) => handleDeleteProduct(e, editingProduct._id)} className="w-full py-3 mt-3 text-red-500 font-bold border-2 border-red-100 rounded-xl hover:bg-red-50">この商品を削除</button>}
          </div>
        ) : (
          <>
            <div className="p-2 bg-[#f3b928] text-gray-900 shadow-md flex justify-between items-center z-10 flex-shrink-0">
              <div className="flex items-center gap-2 pl-2">
                <span className="text-[9px] font-black tracking-widest opacity-80 uppercase leading-none">Ticket</span>
                <div className="bg-white text-[#f3b928] px-3 py-0.5 rounded-lg font-black text-lg shadow-inner">{currentTicket}</div>
              </div>
              <button onClick={() => toggleModal('lost', true)} className="text-[10px] bg-red-500 hover:bg-red-400 px-2 py-1.5 rounded-md font-black mr-1 border border-red-400 transition-colors shadow-sm text-white">紛失設定</button>
            </div>
            <div className="px-3 py-2 border-b bg-green-50 text-green-800">
              <div className="min-w-0">
                <p className="font-black text-sm">未提供 {currentPendingItemCount} / {maxPendingItemCount}</p>
                <p className="text-xs font-bold truncate">今回の注文 {currentOrderItemCount}</p>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-3 space-y-2 bg-gray-50/50 shadow-inner">
              {cartItems.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-40"><p className="font-black text-sm tracking-widest">商品を選択してください</p></div> :
                cartItems.map((item, index) => {
                  const itemOptionPrice = item.selectedOptions?.reduce((sum, option) => sum + option.price, 0) || 0;
                  return (
                    <div key={index} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2 transition-all hover:shadow-md">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-gray-800 leading-tight text-sm">{item.productName}</span>
                        <button onClick={() => setCartItems((prev) => prev.filter((_, i) => i !== index))} className="text-red-200 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors">x</button>
                      </div>
                      <button onClick={() => toggleModal('detail', true, { index, productName: item.productName, currentDetail: item.detail, currentOptions: item.selectedOptions })} className="w-full text-left text-[10px] p-2 rounded-xl transition-all border-2 border-dashed bg-[#fff8e1] text-yellow-900 border-yellow-200 hover:bg-yellow-100">
                        <div className="flex flex-wrap gap-1.5">
                          {item.selectedOptions?.map((option, i) => <span key={i} className={`px-2 py-0.5 rounded-md font-bold ${option.price < 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-700'}`}>{option.name}{option.price !== 0 ? `(${option.price})` : ''}</span>)}
                          {item.detail && <span className="font-black">メモ {item.detail}</span>}
                          {!item.detail && !item.selectedOptions?.length && '+ 詳細設定'}
                        </div>
                      </button>
                      <div className="flex justify-between items-end">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden border border-gray-100 h-9">
                            <button onClick={() => updateQuantity(index, item.quantity - 1)} className="w-9 h-full flex items-center justify-center font-black hover:bg-gray-200" disabled={item.quantity <= 1}>-</button>
                            <input type="number" min="1" value={item.quantity} onChange={(e) => { const val = parseInt(e.target.value); if (!isNaN(val) && val > 0) updateQuantity(index, val); }} className="w-10 h-full text-center bg-white border-x border-gray-200 outline-none font-black text-xs text-gray-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            <button onClick={() => updateQuantity(index, item.quantity + 1)} className="w-9 h-full flex items-center justify-center font-black hover:bg-gray-200">+</button>
                          </div>
                          {itemOptionPrice !== 0 && <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${itemOptionPrice < 0 ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-600'}`}>OP {itemOptionPrice}</span>}
                        </div>
                        <span className="text-blue-700 font-black text-xl font-mono">¥{((item.price + itemOptionPrice) * item.quantity).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })
              }
            </div>

            <div className="px-6 py-2 bg-gray-50 border-t border-gray-200 flex-shrink-0">
              <p className="text-[10px] font-black text-gray-400 mb-2 tracking-widest">使用中の整理券</p>
              <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto overscroll-contain touch-pan-y">
                {activeTickets.length === 0 && <span className="text-xs text-gray-400 font-bold">未提供の注文はありません</span>}
                {[...activeTickets].sort((a, b) => a - b).map((num) => (
                  <button key={num} onClick={() => toggleModal('confirm', true, { message: `${num}番の整理券を返却済みにしますか？`, onConfirm: async () => { toggleModal('confirm', false); const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: String(num) }) }); if (res.ok) fetchTicketStatus(); } })} className="bg-orange-100 text-orange-700 border border-orange-300 px-3 py-1 rounded-lg text-xs font-black hover:bg-orange-200 transition">{num}</button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-white border-t-2 border-gray-100 shadow-2xl flex-shrink-0">
              <div className="flex justify-between items-end mb-4"><span className="text-gray-400 font-black uppercase tracking-[0.2em] text-xs">Total</span><span className="text-4xl font-black text-gray-900 font-mono">¥{totalAmount.toLocaleString()}</span></div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full border-2 border-gray-100 p-3 text-sm rounded-2xl mb-4 h-12 outline-none focus:ring-2 focus:ring-[#f3b928] font-sans resize-none font-bold bg-gray-50" placeholder="備考（領収書など）" />
              <button onClick={handleOpenPayment} disabled={cartItems.length === 0 || currentTicket === '発券不可' || isSubmitting} className={`w-full py-5 rounded-2xl font-black text-xl shadow-xl transition-all transform active:scale-95 ${cartItems.length === 0 || currentTicket === '発券不可' || isSubmitting ? 'bg-gray-300 cursor-not-allowed opacity-50 text-white' : 'bg-[#f3b928] hover:bg-[#d6a11b] text-gray-900 ring-4 ring-yellow-100'}`}>{isSubmitting ? '注文を送信中...' : '注文を確定する'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
