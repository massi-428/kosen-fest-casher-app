"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// モーダルコンポーネントをインポート
import { ResultModal, ConfirmModal, DetailModal, CustomOption } from '@/components/order/OrderModals';
import { HamburgerMenu } from '@/components/common/HamburgerMenu';

type OrderItem = {
  productName: string;
  price: number;
  quantity: number;
  detail?: string; 
  selectedOptions?: CustomOption[]; 
};

type Product = {
  _id: string;
  name: string;
  price: number;
};

export default function OrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [maxTicketNumber, setMaxTicketNumber] = useState(30); 
  const [currentTicket, setCurrentTicket] = useState<string>("1");
  const [activeTickets, setActiveTickets] = useState<number[]>([]);
  const [lastIssuedNumber, setLastIssuedNumber] = useState<number>(0);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [customizationOptions, setCustomizationOptions] = useState<CustomOption[]>([]);
  
  const [selectedPayment, setSelectedPayment] = useState<string>("");
  const [note, setNote] = useState("");

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");

  const [resultModal, setResultModal] = useState({ isOpen: false, title: "", message: "", type: "success" });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: "", onConfirm: () => {} });
  
  // モーダル用state
  const [detailModal, setDetailModal] = useState<{ isOpen: boolean, index: number, productName: string, currentDetail: string, currentOptions: CustomOption[] }>({ isOpen: false, index: -1, productName: "", currentDetail: "", currentOptions: [] });

  const showResult = (title: string, message: string, type: "success" | "error" = "success") => {
    setResultModal({ isOpen: true, title, message, type });
  };
  const closeResult = () => setResultModal({ ...resultModal, isOpen: false });

  const showConfirm = (message: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, message, onConfirm });
  };
  const closeConfirm = () => setConfirmModal({ ...confirmModal, isOpen: false });

  // データ取得
  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products', { cache: 'no-store' });
      if (res.ok) setProducts(await res.json());
    } catch (error) { console.error("商品取得エラー", error); }
  }, []);

  const fetchTicketStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setActiveTickets(data.activeTickets);
        setLastIssuedNumber(data.lastTicketNumber);
      }
    } catch (error) { console.error("チケット取得エラー", error); }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.maxTicketNumber) setMaxTicketNumber(data.maxTicketNumber);
        if (data.paymentMethods) setPaymentMethods(data.paymentMethods);
        if (data.customizations) setCustomizationOptions(data.customizations);
      }
    } catch (error) { console.error("設定取得エラー", error); }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchTicketStatus();
    fetchSettings();
    const interval = setInterval(() => {
      fetchTicketStatus();
      fetchSettings();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchProducts, fetchTicketStatus, fetchSettings]);

  useEffect(() => {
    let nextNum = lastIssuedNumber + 1;
    if (nextNum > maxTicketNumber) nextNum = 1;
    let loopCount = 0;
    while (activeTickets.includes(nextNum) && loopCount < maxTicketNumber) {
      nextNum++;
      if (nextNum > maxTicketNumber) nextNum = 1;
      loopCount++;
    }
    setCurrentTicket(loopCount >= maxTicketNumber ? "整理券切れ" : String(nextNum));
  }, [activeTickets, lastIssuedNumber, maxTicketNumber]);

  // カート操作
  const addToCart = (product: Product) => {
    if (isEditMode) return;
    
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => 
        item.productName === product.name && !item.detail && (!item.selectedOptions || item.selectedOptions.length === 0)
      );
      
      if (existingIndex !== -1) {
        return prev.map((item, index) => 
          index === existingIndex 
            ? { ...item, quantity: item.quantity + 1 } 
            : item
        );
      } else {
        return [...prev, { productName: product.name, price: product.price, quantity: 1, detail: "", selectedOptions: [] }];
      }
    });
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    setCartItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: newQuantity } : item));
  };

  const removeFromCart = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const openDetailModal = (index: number, item: OrderItem) => {
    setDetailModal({ 
      isOpen: true, 
      index, 
      productName: item.productName, 
      currentDetail: item.detail || "",
      currentOptions: item.selectedOptions || [] 
    });
  };

  const saveDetail = (newDetail: string, newOptions: CustomOption[]) => {
    setCartItems(prev => prev.map((item, i) => i === detailModal.index ? { ...item, detail: newDetail, selectedOptions: newOptions } : item));
    setDetailModal({ ...detailModal, isOpen: false });
  };

  const totalAmount = cartItems.reduce((sum, item) => {
    const optionsPrice = item.selectedOptions ? item.selectedOptions.reduce((optSum, opt) => optSum + opt.price, 0) : 0;
    return sum + ((item.price + optionsPrice) * item.quantity);
  }, 0);

  // 注文確定
  const handleOrder = async () => {
    if (cartItems.length === 0 || isEditMode) return;
    if (currentTicket === "整理券切れ") return showResult("整理券切れです", "整理券切れのため発券できません。", "error");
    if (!selectedPayment) return showResult("エラー", "決済方法を選択してください", "error");

    setLoading(true);

    const orderData = {
      ticketNumber: currentTicket,
      items: cartItems.map(item => {
        const optionsPrice = item.selectedOptions ? item.selectedOptions.reduce((optSum, opt) => optSum + opt.price, 0) : 0;
        return { 
          productName: item.productName, 
          quantity: item.quantity, 
          amount: (item.price + optionsPrice) * item.quantity, 
          detail: item.detail,
          selectedOptions: item.selectedOptions 
        };
      }),
      totalAmount: totalAmount,
      status: 'active',
      paymentMethod: selectedPayment,
      note: note,
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
        cache: 'no-store'
      });

      if (res.ok) {
        const data = await res.json();
        showResult("注文完了", `整理券番号: ${data.order.ticketNumber}\nご注文ありがとうございます！`);
        setCartItems([]);
        setSelectedPayment("");
        setNote("");
        await fetchTicketStatus();
      } else {
        showResult("注文エラー", "注文の保存に失敗しました", "error");
      }
    } catch (error) {
      showResult("通信エラー", "サーバーとの通信に失敗しました", "error");
    } finally {
      setLoading(false);
    }
  };

  // その他機能
  const handleReturnTicket = (num: number) => {
    showConfirm(`${num}番の整理券を\n返却（回収）済みにしますか？`, async () => {
      closeConfirm();
      try {
        const res = await fetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: String(num) }), cache: 'no-store' });
        if (res.ok) await fetchTicketStatus();
      } catch (e) { showResult("エラー", "通信に失敗しました", "error"); }
    });
  };

  const handleResetData = () => {
    showConfirm("【警告】\n全ての注文データを削除してリセットしますか？\nこの操作は取り消せません。", async () => {
      closeConfirm();
      try {
        const res = await fetch('/api/debug/reset', { method: 'DELETE' });
        if (res.ok) {
          showResult("リセット完了", "データを初期化しました。\n画面をリロードします。", "success");
          setTimeout(() => window.location.reload(), 2000);
        }
      } catch (e) { showResult("エラー", "リセットに失敗しました", "error"); }
    });
  };

  const startEdit = (product: Product) => { setEditingProduct(product); setFormName(product.name); setFormPrice(String(product.price)); };
  const startCreate = () => { setEditingProduct(null); setFormName(""); setFormPrice(""); };
  const handleSaveProduct = async () => {
    if (!formName || !formPrice) return showResult("入力エラー", "名前と価格を入力してください", "error");
    const method = editingProduct ? 'PUT' : 'POST';
    const body = editingProduct ? { _id: editingProduct._id, name: formName, price: formPrice } : { name: formName, price: formPrice };
    try {
      const res = await fetch('/api/products', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { await fetchProducts(); startCreate(); showResult("保存しました", `${formName} を${editingProduct ? '更新' : '登録'}しました`); }
      else showResult("保存エラー", "保存できませんでした", "error");
    } catch (e) { showResult("通信エラー", "通信に失敗しました", "error"); }
  };
  const handleDeleteProduct = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    showConfirm("この商品を削除しますか？", async () => {
      closeConfirm();
      try {
        const res = await fetch('/api/products', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: id }) });
        if (res.ok) { await fetchProducts(); if (editingProduct?._id === id) startCreate(); showResult("削除完了", "商品を削除しました"); }
      } catch (e) { showResult("エラー", "削除に失敗しました", "error"); }
    });
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden font-sans relative">
      <ResultModal isOpen={resultModal.isOpen} title={resultModal.title} message={resultModal.message} type={resultModal.type} onClose={closeResult} />
      <ConfirmModal isOpen={confirmModal.isOpen} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={closeConfirm} />
      
      {/* 詳細設定モーダル (コンポーネントを利用) */}
      <DetailModal 
        isOpen={detailModal.isOpen} 
        productName={detailModal.productName} 
        currentDetail={detailModal.currentDetail}
        currentOptions={detailModal.currentOptions}
        optionsList={customizationOptions} 
        onSave={saveDetail} 
        onClose={() => setDetailModal({ ...detailModal, isOpen: false })} 
      />

      <div className="w-3/5 flex flex-col h-full">
        <div className="p-4 flex justify-between items-center bg-white border-b relative">
          <h2 className="text-xl font-bold text-gray-700 flex items-center gap-3">{isEditMode ? "【編集中】商品を選択して編集" : "商品メニュー"}</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => { setIsEditMode(!isEditMode); if (!isEditMode) startCreate(); }} className={`px-4 py-2 rounded-full font-bold text-sm transition ${isEditMode ? 'bg-red-500 text-white hover:bg-red-600 shadow-inner' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}>{isEditMode ? "編集を終了する" : "メニューを編集する"}</button>
            <HamburgerMenu onNavigate={(path) => router.push(path)} onReset={handleResetData} />
          </div>
        </div>
        <div className="flex-1 p-4 overflow-y-auto relative">
          <div className="grid grid-cols-3 gap-3">
            {products.map((item) => (
              <button key={item._id} onClick={() => isEditMode ? startEdit(item) : addToCart(item)} className={`relative h-28 rounded-lg shadow border-2 flex flex-col items-center justify-center p-1 transition ${isEditMode ? (editingProduct?._id === item._id ? 'border-blue-500 bg-blue-50' : 'border-dashed border-gray-300 bg-white hover:bg-gray-50') : 'border-transparent bg-white hover:border-blue-500 hover:shadow-md active:scale-95'}`}>
                <span className="font-bold text-gray-800 text-center mb-1 leading-tight">{item.name}</span>
                <span className="text-gray-500 text-sm">¥{item.price}</span>
                {isEditMode && <div onClick={(e) => handleDeleteProduct(e, item._id)} className="absolute top-1 right-1 bg-red-100 text-red-500 rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-500 hover:text-white z-10">×</div>}
              </button>
            ))}
            {isEditMode && <button onClick={startCreate} className={`h-28 rounded-lg border-2 border-dashed border-green-300 flex flex-col items-center justify-center text-green-500 hover:bg-green-50 ${!editingProduct ? 'bg-green-50 border-green-500' : ''}`}><span className="text-2xl font-bold">+</span><span className="text-xs font-bold">新規追加</span></button>}
          </div>
        </div>
      </div>

      <div className="w-2/5 bg-white shadow-2xl flex flex-col h-full border-l border-gray-200">
        {isEditMode ? (
          <div className="flex flex-col h-full bg-gray-50">
            {/* 編集モードUI */}
            <div className="p-5 bg-gray-800 text-white shadow-md"><h3 className="text-lg font-bold">{editingProduct ? "商品を編集" : "新しい商品を登録"}</h3></div>
            <div className="p-6 flex-1">
              <label className="block text-sm font-bold text-gray-700 mb-1">商品名</label>
              <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border p-3 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none" />
              <label className="block text-sm font-bold text-gray-700 mb-1">価格 (円)</label>
              <input type="number" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} className="w-full border p-3 rounded-lg mb-6 focus:ring-2 focus:ring-blue-500 outline-none" />
              <div className="flex gap-3">
                <button onClick={handleSaveProduct} className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 shadow-lg">{editingProduct ? "更新する" : "追加する"}</button>
                {editingProduct && <button onClick={startCreate} className="px-4 py-3 bg-gray-200 text-gray-600 rounded-lg font-bold hover:bg-gray-300">キャンセル</button>}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 bg-blue-600 text-white shadow-md z-10">
              <div className="flex justify-between items-center mb-2"><label className="text-sm font-bold opacity-90">次の整理券番号</label><span className="text-xs bg-blue-500 px-2 py-1 rounded">MAX: {maxTicketNumber}</span></div>
              <div className="text-center bg-white text-blue-600 rounded-lg py-2 shadow-inner">
                <span className={`${currentTicket.length > 3 ? "text-3xl" : "text-5xl"} font-black tracking-widest`}>
                  {currentTicket}
                </span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {cartItems.length === 0 ? <p className="text-center text-gray-400 mt-10">商品を選択してください</p> : 
                <ul className="space-y-2">
                  {cartItems.map((item, index) => {
                    const optionsPrice = item.selectedOptions ? item.selectedOptions.reduce((s, o) => s + o.price, 0) : 0;
                    return (
                      <li key={index} className="flex flex-col bg-white p-3 rounded shadow-sm border gap-2">
                        <div className="flex justify-between items-start">
                          <div className="font-bold text-gray-800 text-lg">{item.productName}</div>
                          <button onClick={() => removeFromCart(index)} className="text-red-500 hover:bg-red-100 rounded-full w-8 h-8 flex items-center justify-center">✕</button>
                        </div>
                        
                        {/* 詳細設定・オプション表示ボタン */}
                        <button 
                          onClick={() => openDetailModal(index, item)}
                          className={`text-left text-sm px-2 py-1 rounded border border-dashed transition w-full ${
                            (item.detail || (item.selectedOptions && item.selectedOptions.length > 0))
                              ? 'bg-blue-50 border-blue-300 text-blue-800' 
                              : 'bg-gray-50 border-gray-300 text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex flex-wrap gap-1 items-center">
                            {(item.selectedOptions && item.selectedOptions.length > 0) ? (
                              item.selectedOptions.map((opt, i) => (
                                // マイナス価格のバッジ表示 (赤背景)
                                <span key={i} className={`text-xs px-1 rounded border ${opt.price < 0 ? 'bg-red-50 text-red-800 border-red-200' : 'bg-orange-100 text-orange-800 border-orange-200'}`}>
                                  {opt.name}{opt.price !== 0 && `(${opt.price > 0 ? '+' : ''}${opt.price})`}
                                </span>
                              ))
                            ) : null}
                            {item.detail && <span className="text-xs">📝 {item.detail}</span>}
                            {(!item.detail && (!item.selectedOptions || item.selectedOptions.length === 0)) && "+ 詳細・オプション"}
                          </div>
                        </button>

                        <div className="flex justify-between items-end mt-1">
                          <div className="text-sm text-gray-500 self-center">
                            @{item.price.toLocaleString()}
                            {/* オプション合計の表示 (マイナスの場合は赤字) */}
                            {optionsPrice !== 0 && (
                              <span className={`text-xs ml-1 ${optionsPrice < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                (OP {optionsPrice > 0 ? '+' : ''}{optionsPrice})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center border border-gray-300 rounded-lg bg-gray-100 overflow-hidden shadow-sm">
                            <button onClick={() => updateQuantity(index, item.quantity - 1)} className={`w-10 h-10 flex items-center justify-center font-bold text-lg transition ${item.quantity <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-blue-600 hover:bg-blue-100'}`} disabled={item.quantity <= 1}>−</button>
                            <input type="number" min="1" value={item.quantity} onChange={(e) => { const val = parseInt(e.target.value); if (!isNaN(val) && val > 0) updateQuantity(index, val); }} className="w-14 h-10 text-center bg-white border-x border-gray-300 outline-none font-bold text-gray-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            <button onClick={() => updateQuantity(index, item.quantity + 1)} className="w-10 h-10 flex items-center justify-center font-bold text-lg text-blue-600 hover:bg-blue-100 transition">＋</button>
                          </div>
                          <div className="text-xl font-bold text-blue-700 min-w-[4rem] text-right">
                            ¥{((item.price + optionsPrice) * item.quantity).toLocaleString()}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              }
            </div>

            <div className="px-4 py-2 bg-gray-100 border-t border-gray-200">
              <p className="text-xs font-bold text-gray-500 mb-2">貸出中の整理券 (タップして返却)</p>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">{activeTickets.sort((a,b)=>a-b).map((num) => <button key={num} onClick={() => handleReturnTicket(num)} className="bg-orange-100 text-orange-700 border border-orange-300 px-2 py-1 rounded text-xs font-bold hover:bg-orange-200 transition">{num}</button>)}</div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-white">
              <div className="flex justify-between items-end mb-4"><span className="text-gray-600 font-bold">合計</span><span className="text-3xl font-bold text-gray-900">¥{totalAmount.toLocaleString()}</span></div>
              <div className="mb-4">
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {paymentMethods.map((method) => (
                    <button key={method} onClick={() => setSelectedPayment(method)} className={`py-4 px-3 rounded text-md font-bold border transition ${selectedPayment === method ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>{method}</button>
                  ))}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-500 mb-1">注文全体の備考</p>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} className="w-full border border-gray-300 p-2 rounded-lg text-sm h-12 resize-none outline-none focus:ring-2 focus:ring-blue-500" placeholder="テイクアウト、領収書など" />
                </div>
              </div>
              <button onClick={handleOrder} disabled={loading || cartItems.length === 0 || currentTicket === "整理券切れ" || !selectedPayment} className={`w-full py-4 rounded-xl text-lg font-bold text-white shadow transition-all ${loading || cartItems.length === 0 || currentTicket === "整理券切れ" || !selectedPayment ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 hover:shadow-lg transform active:scale-95'}`}>{loading ? '処理中...' : '注文を確定する'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}