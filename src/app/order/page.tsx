"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HamburgerMenu as SharedHamburgerMenu } from '@/components/common/HamburgerMenu';
import {
  ConfirmModal as SharedConfirmModal,
  LostTicketModal as SharedLostTicketModal,
  PaymentModal as SharedPaymentModal,
  ResultModal as SharedResultModal,
} from '@/components/order/OrderModals';
import { requestJson, postJson } from '@/lib/client-api';
import { readDraft, writeDraft, removeDraft, cartChanges, type CartDraft, type OrderQuote } from '@/lib/cart-draft';
import { Toast } from '@/components/common/Toast';
import { ShiftReminder } from '@/components/common/ShiftReminder';
import { startBrowserPolling } from '@/lib/polling';

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
    return await fetch(absoluteUrl, { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
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
type Product = { _id: string; name: string; price: number; isAvailable?: boolean };
type ModalData = Partial<
  React.ComponentProps<typeof SharedResultModal> &
  React.ComponentProps<typeof SharedConfirmModal>
> & { index?: number };

export default function OrderPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [identity, setIdentity] = useState<{ userId: string; storeId: string } | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftWarning, setDraftWarning] = useState('');
  const [checkoutPhase, setCheckoutPhase] = useState<CartDraft['phase']>('editing');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [submission, setSubmission] = useState<CartDraft['submission']>(null);
  const checkoutLock = useRef(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const requestIdRef = useRef('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productsReady, setProductsReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [maxTicketNumber, setMaxTicketNumber] = useState(30);
  const [currentTicket, setCurrentTicket] = useState('1');
  const [activeOrders, setActiveOrders] = useState<{ _id: string; ticketNumber: string; revision?: number }[]>([]);
  const returningRef = useRef(new Set<string>());
  const [returning, setReturning] = useState<string[]>([]);
  const [ticketError, setTicketError] = useState('');
  const [activeTickets, setActiveTickets] = useState<number[]>([]);
  const [lostTickets, setLostTickets] = useState<number[]>([]);
  const [lastIssuedNumber, setLastIssuedNumber] = useState(0);
  const [currentPendingItemCount, setCurrentPendingItemCount] = useState(0);
  const [maxPendingItemCount, setMaxPendingItemCount] = useState(30);
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState(10);
  const [waitInfo, setWaitInfo] = useState<{ estimatedWaitLabel: string; isEstimateReliable: boolean } | null>(null);
  const [cartItems, setCartItemsState] = useState<OrderItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [cashCalculationEnabled, setCashCalculationEnabled] = useState(false);
  const [cashPaymentMethod, setCashPaymentMethod] = useState('現金');
  const [customizationOptions, setCustomizationOptions] = useState<CustomOption[]>([]);
  const [note, setNoteState] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [modals, setModals] = useState({ result: false, confirm: false, payment: false, lost: false });
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
      try {
      const res = await apiFetch('/api/me', { cache: 'no-store' });
      if (!res.ok) { setDraftWarning('ログイン状態を確認できません。再読み込みしてください。'); return; }
      const data = await res.json();
      if (data.userId && data.activeStoreId) setIdentity({ userId: data.userId, storeId: data.activeStoreId });
      else setDraftWarning('店舗情報を確認できません。ログインし直してください。');
      } catch { setDraftWarning('ログイン状態の応答を確認できません。再読み込みしてください。'); }
    };
    checkSession();
  }, []);

  const fetchProducts = useCallback(async () => {
    try {
    const res = await apiFetch('/api/products');
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error();
    setProducts(data); setProductsReady(true); setCatalogError('');
    return true;
    } catch { setProductsReady(false); setCatalogError('商品情報を確認できません。接続回復後に自動で再取得します。'); return false; }
  }, []);

  const ticketFetchSequence = useRef(0);
  const fetchTicketStatus = useCallback(async () => {
    const sequence = ++ticketFetchSequence.current;
    try {
      const res = await apiFetch('/api/tickets', { cache: 'no-store' });
      if (!res.ok) throw new Error('整理券情報を取得できません。最後の情報を表示しています。');
      const data = await res.json();
      if (sequence !== ticketFetchSequence.current) return;
      if (!Array.isArray(data.activeOrders) || !Array.isArray(data.activeTickets)) throw new Error('整理券情報の形式が正しくありません。');
      setActiveOrders(data.activeOrders); setActiveTickets(data.activeTickets); setTicketError('');
      setLastIssuedNumber(data.lastTicketNumber || 0);
      setCurrentPendingItemCount(data.currentPendingItemCount || 0);
      setMaxPendingItemCount(data.maxPendingItemCount || 30);
      return true;
    } catch (error) { if (sequence === ticketFetchSequence.current) setTicketError(error instanceof Error ? error.message : '整理券情報の通信エラー'); return false; }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
    const res = await apiFetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (!data || typeof data !== 'object') throw new Error();
      if (data.maxTicketNumber) setMaxTicketNumber(data.maxTicketNumber);
      if (data.paymentMethods) setPaymentMethods(data.paymentMethods);
      setCashCalculationEnabled(data.cashCalculationEnabled === true);
      setCashPaymentMethod(data.cashPaymentMethod || '現金');
      if (data.customizations) setCustomizationOptions(data.customizations);
      if (data.lostTickets) setLostTickets(data.lostTickets);
      setMaxPendingItemCount(data.maxPendingItemCount || 30);
      setMaxItemsPerOrder(data.maxItemsPerOrder || 10);
      setSettingsReady(true);
      return true;
    }
    else setSettingsReady(false);
    } catch { setSettingsReady(false); }
    return false;
  }, []);

  const fetchWaitTime = useCallback(async () => {
    try {
    const res = await apiFetch('/api/wait-time', { cache: 'no-store' });
    if (res.ok) { setWaitInfo(await res.json()); return true; }
    } catch { /* Preserve the previous estimate when its response is invalid. */ }
    return false;
  }, []);

  useEffect(() => {
    const poller = startBrowserPolling(async () => {
      const results = await Promise.all([fetchProducts(), fetchTicketStatus(), fetchSettings(), fetchWaitTime()]);
      return results.every(result => result === true);
    });
    return () => poller.stop();
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

  const persistDraft = (override: Partial<CartDraft> = {}) => {
    if (!identity || !draftReady) return;
    const draft: CartDraft = { version: 1, ...identity, requestId: requestIdRef.current, items: cartItems, note, phase: checkoutPhase, quote, submission, ...override };
    try { if (!draft.items.length && draft.phase === 'editing') removeDraft(identity.userId, identity.storeId); else writeDraft(draft); }
    catch { setDraftWarning('この環境ではカートを一時保存できません。登録結果が不明な間はこの画面を閉じず、結果確認してください。'); }
  };
  useEffect(() => {
    if (!identity) return;
    try {
      const draft = readDraft(identity.userId, identity.storeId);
      if (draft) { setCartItemsState(draft.items); setNoteState(draft.note); requestIdRef.current = draft.requestId; setQuote(draft.quote); setSubmission(draft.submission); setCheckoutPhase(draft.phase); setDraftWarning('保存済みカートを復元しました。商品・オプションの変更を確認してください。'); }
      else requestIdRef.current = crypto.randomUUID();
    } catch (error) { requestIdRef.current = crypto.randomUUID(); setDraftWarning(error instanceof Error ? error.message : '保存済みカートを取得できません。'); }
    setDraftReady(true);
  }, [identity]);
  useEffect(() => { persistDraft(); }, [cartItems, note, checkoutPhase, quote, submission, identity, draftReady]); // eslint-disable-line react-hooks/exhaustive-deps
  const invalidateQuote = () => { requestIdRef.current = crypto.randomUUID(); setQuote(null); setSubmission(null); setCheckoutPhase('editing'); setCheckoutError(''); };
  const setCartItems: React.Dispatch<React.SetStateAction<OrderItem[]>> = update => { if (!draftReady || checkoutLock.current || checkoutPhase !== 'editing') return; invalidateQuote(); setCartItemsState(update); };
  const setNote = (value: string) => { if (!draftReady || checkoutLock.current || checkoutPhase !== 'editing') return; invalidateQuote(); setNoteState(value); };

  const addToCart = (product: Product) => {
    if (isEditMode || checkoutPhase !== 'editing' || !draftReady) return;
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
  const unavailableProductIds = new Set(products.filter((product) => product.isAvailable === false).map((product) => product._id));
  const hasUnavailableItems = cartItems.some((item) => unavailableProductIds.has(item.productId));

  const confirmQuote = async () => {
    if (checkoutLock.current || !identity || !draftReady || checkoutPhase === 'unknown') return;
    if (quote && checkoutPhase === 'ready') { toggleModal('payment', true); return; }
    checkoutLock.current = true; setIsQuoting(true); setCheckoutError('');
    try {
      const data: OrderQuote = await postJson('/api/order-quotes', { requestId: requestIdRef.current, items: cartItems.map(item => ({ productId: item.productId, quantity: item.quantity, detail: item.detail || '', selectedOptionNames: (item.selectedOptions || []).map(o => o.name) })), note });
      if (!Array.isArray(data.items) || !Number.isSafeInteger(data.totalAmount) || data.requestId !== requestIdRef.current) throw new Error('金額確認の応答が正しくありません。');
      const pricedItems = data.items.map(item => ({ productId: item.productId, productName: item.productName, price: item.amount / item.quantity - item.selectedOptions.reduce((sum, o) => sum + o.price, 0), quantity: item.quantity, detail: item.detail, selectedOptions: item.selectedOptions }));
      setQuote(data); setCheckoutPhase('ready'); setCartItemsState(pricedItems);
      persistDraft({ quote: data, phase: 'ready', items: pricedItems });
      const open = () => { toggleModal('confirm', false); toggleModal('payment', true); };
      if (data.totalAmount !== totalAmount) toggleModal('confirm', true, { message: '価格が変更されています。表示金額 ¥' + totalAmount.toLocaleString() + ' → 確定金額 ¥' + data.totalAmount.toLocaleString() + '。新しい金額で会計しますか？まだ受け渡しをしないでください。', onConfirm: open, confirmLabel: '新しい金額で会計へ' });
      else toggleModal('payment', true);
    } catch (error) { setCheckoutError(error instanceof Error ? error.message : '会計金額を確認できません。'); }
    finally { checkoutLock.current = false; setIsQuoting(false); }
  };
  const handleOpenPayment = () => {
    const exceedsPendingWarning = currentPendingItemCount + currentOrderItemCount > maxPendingItemCount;
    const exceedsOrderWarning = currentOrderItemCount > maxItemsPerOrder;
    if (exceedsPendingWarning || exceedsOrderWarning) {
      toggleModal('confirm', true, { message: '提供まで時間がかかる可能性があります。今回の注文は想定数を超える可能性があります。それでも注文を追加しますか？', onConfirm: () => { toggleModal('confirm', false); void confirmQuote(); }, confirmLabel: 'はい、注文を続ける' });
    } else void confirmQuote();
  };
  const orderSucceeded = (order: { ticketNumber: string; changeAmount?: number }, warning?: { message?: string }) => {
    if (!order?.ticketNumber) throw new Error('登録結果の応答が正しくありません。');
    showToast('注文を登録しました。整理番号: ' + order.ticketNumber + (typeof order.changeAmount === 'number' ? ' お釣り ¥' + order.changeAmount.toLocaleString() : '') + (warning?.message ? ' 警告: ' + warning.message : ''), 'success');
    if (identity) { try { removeDraft(identity.userId, identity.storeId); setDraftWarning(''); } catch { setDraftWarning('保存済みカートを消去できませんでした。次回は必ず登録結果を確認してください。'); } }
    setCartItemsState([]); setNoteState(''); setQuote(null); setSubmission(null); setCheckoutPhase('editing'); requestIdRef.current = newRequestId(); setCheckoutError(''); void fetchTicketStatus();
  };
  const checkOrderResult = async () => {
    if (checkoutLock.current || !identity) return;
    checkoutLock.current = true; setIsSubmitting(true);
    try { const data = await requestJson('/api/orders?requestId=' + encodeURIComponent(requestIdRef.current)); if (data.order) orderSucceeded(data.order); else setCheckoutError('この操作IDの注文はまだ見つかりません。同じ操作IDで登録を再試行してください。新しい注文にはしないでください。'); }
    catch (error) { setCheckoutError(error instanceof Error ? error.message : '結果を確認できません。'); }
    finally { checkoutLock.current = false; setIsSubmitting(false); }
  };
  const handleOrder = async (method: string, receivedAmount?: number) => {
    if (checkoutLock.current || !quote || !identity) return;
    checkoutLock.current = true; setIsSubmitting(true); toggleModal('payment', false); setCheckoutError('');
    const payment = submission || { paymentMethod: method, receivedAmount };
    setSubmission(payment); setCheckoutPhase('unknown'); persistDraft({ submission: payment, phase: 'unknown' });
    try {
      const me = await requestJson('/api/me');
      if (me.userId !== identity.userId || me.activeStoreId !== identity.storeId) throw new Error('ユーザーまたは店舗が変更されています。再読み込みしてください。');
      const data = await postJson('/api/orders', { requestId: requestIdRef.current, expectedTotal: quote.totalAmount, ...payment });
      orderSucceeded(data.order, data.warning);
    } catch (error) {
      setCheckoutError((error instanceof Error ? error.message : '登録結果が不明です。') + ' 受け渡しは繰り返さず、結果確認してください。');
      try { const data = await requestJson('/api/orders?requestId=' + encodeURIComponent(requestIdRef.current)); if (data.order) orderSucceeded(data.order); } catch { /* Keep cart and request ID until the result is known. */ }
    } finally { checkoutLock.current = false; setIsSubmitting(false); }
  };
  const changes = draftReady && productsReady && settingsReady && checkoutPhase === 'editing' ? cartChanges(cartItems, products, customizationOptions) : [];
  const refreshCart = () => {
    setCartItems(items => items.map(item => { const product = products.find(p => p._id === item.productId); return { ...item, price: product?.price ?? item.price, productName: product?.name || item.productName, selectedOptions: (item.selectedOptions || []).flatMap(option => { const current = customizationOptions.find(o => o.name === option.name); return current ? [current] : []; }) }; }));
  };
  const resumePayment = () => { if (quote) toggleModal('payment', true); };
  const returnToCart = () => { if (checkoutPhase !== 'unknown' && !checkoutLock.current) { invalidateQuote(); toggleModal('payment', false); } };

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
    if (products.length <= 1) {
      toggleModal('result', true, { title: '削除できません', message: '商品は0件にできません。新しい商品を追加してから削除してください。', type: 'error' });
      return;
    }
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
        const data = await res.json().catch(() => ({}));
        toggleModal('result', true, { title: '削除できません', message: data.message || '削除に失敗しました', type: 'error' });
        void fetchProducts();
      }
    } });
  };

  const handleToggleAvailability = async (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    const nextAvailability = product.isAvailable === false;
    const res = await apiFetch('/api/products', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: product._id, isAvailable: nextAvailability }),
    });
    if (res.ok) {
      setProducts((prev) => prev.map((item) => item._id === product._id ? { ...item, isAvailable: nextAvailability } : item));
      showToast(nextAvailability ? '販売を再開しました' : '売り切れにしました', 'success', '販売状態を変更');
    } else {
      toggleModal('result', true, { title: 'エラー', message: '販売状態を変更できませんでした', type: 'error' });
    }
  };

  return (
    <div className="pos-screen terminal-screen fixed inset-0 w-full h-dvh bg-gray-100 overflow-hidden overscroll-none font-sans text-gray-900 flex">
      <SharedResultModal legacyAppearance isOpen={modals.result} title={modalData.title || ''} message={modalData.message || ''} type={modalData.type || 'success'} onClose={() => toggleModal('result', false)} />
      <SharedConfirmModal legacyAppearance isOpen={modals.confirm} message={modalData.message || ''} onConfirm={modalData.onConfirm || (() => {})} onCancel={closeConfirmModal} confirmLabel={modalData.confirmLabel} cancelLabel={modalData.cancelLabel} />
      <Toast legacyAppearance show={toast.show} message={toast.message} title={toast.title} type={toast.type} onClose={() => setToast((prev) => ({ ...prev, show: false }))} />
      {identity && <ShiftReminder key={identity.storeId} storeId={identity.storeId} paused={toast.show} />}
      <SharedPaymentModal legacyAppearance isOpen={modals.payment} paymentMethods={quote?.paymentMethods || paymentMethods} totalAmount={quote?.totalAmount ?? totalAmount} cashCalculationEnabled={quote?.cashCalculationEnabled ?? cashCalculationEnabled} cashPaymentMethod={quote?.cashPaymentMethod || cashPaymentMethod} onConfirm={handleOrder} onCancel={returnToCart} />
      <SharedLostTicketModal legacyAppearance isOpen={modals.lost} maxTicketNumber={maxTicketNumber} lostTickets={lostTickets} onToggle={toggleLostTicket} onClose={() => toggleModal('lost', false)} />

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
              onNavigate={(path) => { persistDraft(); navigateTo(path); }}
              onLogout={async () => { await apiFetch('/api/logout', { method: 'POST' }); navigateTo('/login'); }}
            />
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4 overflow-y-auto overscroll-contain touch-pan-y bg-gray-50/30">
          <div className="grid grid-cols-3 gap-4">
            {products.map((product) => {
              const isAvailable = product.isAvailable !== false;
              return (
              <button key={product._id} disabled={!isEditMode && !isAvailable} onClick={() => isEditMode ? (setEditingProduct(product), setFormName(product.name), setFormPrice(String(product.price))) : addToCart(product)} className={`h-28 border-2 rounded-2xl flex flex-col items-center justify-center p-2 transition-all shadow-sm relative ${isAvailable ? 'bg-white hover:border-[#f3b928] hover:bg-[#fff8e1] active:scale-95' : 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'}`}>
                <span className="font-black text-gray-800 text-center leading-tight mb-1">{product.name}</span>
                <span className="text-gray-500 text-sm font-bold font-mono">¥{product.price.toLocaleString()}</span>
                {!isAvailable && <span className="absolute inset-x-2 bottom-2 rounded-md bg-red-600 py-1 text-xs font-black text-white">売り切れ</span>}
                {isEditMode && (
                  <>
                    <div onClick={(e) => handleDeleteProduct(e, product._id)} className="absolute top-1 right-1 w-6 h-6 bg-red-100 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors z-10 font-bold text-xs">x</div>
                    <div onClick={(e) => void handleToggleAvailability(e, product)} className={`absolute left-1 top-1 rounded-md px-2 py-1 text-[10px] font-black text-white z-10 ${isAvailable ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}>
                      {isAvailable ? '売切設定' : '販売再開'}
                    </div>
                  </>
                )}
              </button>
              );
            })}
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
              {(draftWarning || checkoutError || changes.length > 0 || !draftReady || catalogError || !settingsReady) && <div className="rounded bg-yellow-50 p-3 text-sm" role="status">{!draftReady && <p>カートを読み込み中…</p>}<p>{draftWarning}</p>{catalogError && <p>{catalogError}</p>}{!settingsReady && <p>オプション設定を確認中です。復元した内容の比較は取得後に行います。</p>}{changes.map((change, i) => <p key={i}>{change}</p>)}{changes.length > 0 && checkoutPhase === 'editing' && <button onClick={refreshCart} className="mt-2 rounded border p-2">最新価格を反映・削除済みオプションを除く</button>}{checkoutError && <p className="text-red-700">{checkoutError}</p>}</div>}
              {checkoutPhase === 'unknown' && <div className="rounded bg-orange-50 p-3 text-sm"><p>登録結果の確認待ちです。操作ID: {requestIdRef.current}</p><p>カートは変更できません。受け渡しを繰り返さないでください。</p><button disabled={isSubmitting} onClick={() => void checkOrderResult()} className="m-1 rounded border p-2">登録結果を確認</button><button disabled={isSubmitting || !submission} onClick={() => submission && void handleOrder(submission.paymentMethod, submission.receivedAmount)} className="m-1 rounded border p-2">同じ操作IDで再試行</button></div>}
              {checkoutPhase === 'ready' && <div className="rounded bg-blue-50 p-3 text-sm"><p>提示金額 ¥{quote?.totalAmount.toLocaleString()} はこの会計に保証されます。</p><button onClick={resumePayment} className="m-1 rounded border p-2">会計を再開</button><button onClick={returnToCart} className="m-1 rounded border p-2">受け渡し前・カートを修正</button></div>}
              {cartItems.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-40"><p className="font-black text-sm tracking-widest">商品を選択してください</p></div> :
                cartItems.map((item, index) => {
                  const itemOptionPrice = item.selectedOptions?.reduce((sum, option) => sum + option.price, 0) || 0;
                  const isUnavailable = unavailableProductIds.has(item.productId);
                  return (
                    <div key={index} className={`bg-white p-3 rounded-2xl shadow-sm border flex flex-col gap-2 transition-all hover:shadow-md ${isUnavailable ? 'border-red-400 ring-2 ring-red-100' : 'border-gray-100'}`}>
                      <div className="flex justify-between items-start">
                        <span className="font-black text-gray-800 leading-tight text-sm">{item.productName}{isUnavailable && <span className="ml-2 text-xs text-red-600">売り切れ</span>}</span>
                        <button onClick={() => setCartItems((prev) => prev.filter((_, i) => i !== index))} className="text-red-200 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors">x</button>
                      </div>
                      <div className="w-full p-2 rounded-xl border bg-[#fff8e1] border-yellow-200 space-y-2">
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${item.productName}のオプション（1点分）`}>
                          {customizationOptions.filter(option => option.name).map(option => {
                            const selected = item.selectedOptions?.some(current => current.name === option.name) || false;
                            return <button key={option.name} type="button" aria-pressed={selected} disabled={!draftReady || !settingsReady || checkoutPhase !== 'editing'} className={`px-2 py-1.5 rounded-lg border text-xs font-bold transition-colors disabled:opacity-40 ${selected ? 'bg-[#f3b928] border-[#d6a11b] text-gray-900' : 'bg-white border-yellow-200 text-gray-600 hover:border-[#f3b928]'}`} onClick={() => setCartItems(prev => {
                              const target = prev[index];
                              if (!target) return prev;
                              const options = target.selectedOptions || [];
                              const selectedOptions = options.some(current => current.name === option.name) ? options.filter(current => current.name !== option.name) : [...options, option];
                              if (target.quantity === 1) return prev.map((row, i) => i === index ? { ...row, selectedOptions } : row);
                              const next = [...prev];
                              next[index] = { ...target, quantity: target.quantity - 1 };
                              next.splice(index + 1, 0, { ...target, quantity: 1, selectedOptions });
                              return next;
                            })}>{selected ? '✓ ' : ''}{option.name}{option.price !== 0 ? ` (${option.price > 0 ? '+' : ''}${option.price}円)` : ''}</button>;
                          })}
                        </div>
                        <input aria-label={`${item.productName}のメモ（この行の全数量）`} placeholder="メモ（この行の全数量）" value={item.detail || ''} disabled={!draftReady || checkoutPhase !== 'editing'} onChange={event => {
                          const detail = event.target.value;
                          setCartItems(prev => prev.map((row, i) => i === index ? { ...row, detail } : row));
                        }} className="w-full rounded-lg border border-yellow-200 bg-white px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-[#f3b928] disabled:opacity-40" />
                      </div>
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
                {ticketError && <button className="text-xs text-red-600" onClick={fetchTicketStatus}>{ticketError} 再取得</button>}
                {[...activeOrders].sort((a, b) => Number(a.ticketNumber) - Number(b.ticketNumber)).map((order) => (
                  <button key={order._id} disabled={returning.includes(order._id)} onClick={() => toggleModal('confirm', true, { message: order.ticketNumber + '番の整理券を返却済みにしますか？', onConfirm: async () => {
                    toggleModal('confirm', false);
                    if (returningRef.current.has(order._id)) return;
                    returningRef.current.add(order._id); setReturning([...returningRef.current]);
                    try {
                      const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order._id, expectedRevision: order.revision || 0, status: 'completed' }) });
                      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || '返却結果を確認できません。'); }
                      showToast(order.ticketNumber + '番を返却済みにしました。');
                    } catch (error) { showToast((error instanceof Error ? error.message : '通信エラー') + ' 再取得後の状態を確認し、必要なら再試行してください。', 'error'); }
                    finally { await fetchTicketStatus(); returningRef.current.delete(order._id); setReturning([...returningRef.current]); }
                  } })} className="bg-orange-100 text-orange-700 border border-orange-300 px-3 py-1 rounded-lg text-xs font-black hover:bg-orange-200 transition disabled:opacity-50">{order.ticketNumber}</button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-white border-t-2 border-gray-100 shadow-2xl flex-shrink-0">
              <div className="flex justify-between items-end mb-4"><span className="text-gray-400 font-black uppercase tracking-[0.2em] text-xs">Total</span><span className="text-4xl font-black text-gray-900 font-mono">¥{totalAmount.toLocaleString()}</span></div>
              <textarea disabled={checkoutPhase !== 'editing'} value={note} onChange={(e) => setNote(e.target.value)} className="w-full border-2 border-gray-100 p-3 text-sm rounded-2xl mb-4 h-12 outline-none focus:ring-2 focus:ring-[#f3b928] font-sans resize-none font-bold bg-gray-50" placeholder="備考（領収書など）" />
              {hasUnavailableItems && <p className="mb-2 text-center text-sm font-bold text-red-600">売り切れ商品をカートから削除してください</p>}
              <button onClick={handleOpenPayment} disabled={!draftReady || isQuoting || checkoutPhase === 'unknown' || cartItems.length === 0 || currentTicket === '発券不可' || isSubmitting || hasUnavailableItems} className={`w-full py-5 rounded-2xl font-black text-xl shadow-xl transition-all transform active:scale-95 ${cartItems.length === 0 || currentTicket === '発券不可' || isSubmitting || hasUnavailableItems ? 'bg-gray-300 cursor-not-allowed opacity-50 text-white' : 'bg-[#f3b928] hover:bg-[#d6a11b] text-gray-900 ring-4 ring-yellow-100'}`}>{isQuoting ? '会計金額を確認中...' : isSubmitting ? '注文を送信中...' : '会計金額を確認する'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
