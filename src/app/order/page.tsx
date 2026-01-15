"use client";

import React, { useState, useEffect, useCallback } from 'react';

// --- ユーティリティ ---
const useRouter = () => ({
  push: (path: string) => {
    if (typeof window !== 'undefined') window.location.href = path;
  },
});

const apiFetch = async (url: string, options?: RequestInit) => {
  try {
    const baseUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' 
      ? window.location.origin 
      : 'http://localhost:3000';
    const absoluteUrl = url.startsWith('http') ? url : new URL(url, baseUrl).toString();
    return await fetch(absoluteUrl, options);
  } catch (e) {
    console.error("Fetch error:", e);
    return { ok: false, status: 500, json: async () => ({ message: "通信エラー" }) } as Response;
  }
};

// --- 型定義 ---
type CustomOption = {
  name: string;
  price: number;
};

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

// --- ベースモーダル ---
const BaseModal = ({ isOpen, onClose, children, closeOnOverlayClick = true }: { isOpen: boolean; onClose: () => void; children: React.ReactNode; closeOnOverlayClick?: boolean }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && closeOnOverlayClick) onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose, closeOnOverlayClick]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 transition-opacity p-4 font-sans"
      onClick={() => closeOnOverlayClick && onClose()} 
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto transform transition-all animate-bounceIn"
        onClick={(e) => e.stopPropagation()} 
      >
        {children}
      </div>
    </div>
  );
};

// --- モーダル一覧 ---

const ResultModal = ({ isOpen, title, message, type, onClose }: any) => (
  <BaseModal isOpen={isOpen} onClose={onClose}>
    <div className={`text-center mb-4 text-4xl ${type === 'success' ? 'text-green-500' : 'text-red-500'}`}>
      {type === 'success' ? '✓' : '!'}
    </div>
    <h3 className="text-xl font-bold text-gray-800 text-center mb-2">{title}</h3>
    <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap">{message}</p>
    <button onClick={onClose} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg">
      閉じる
    </button>
  </BaseModal>
);

const ConfirmModal = ({ isOpen, message, onConfirm, onCancel }: any) => (
  <BaseModal isOpen={isOpen} onClose={onCancel}>
    <div className="text-center mb-4 text-4xl text-yellow-500">?</div>
    <h3 className="text-xl font-bold text-gray-800 text-center mb-4">確認</h3>
    <p className="text-gray-600 text-center mb-6 whitespace-pre-wrap font-medium">{message}</p>
    <div className="flex gap-3 mt-6">
      <button onClick={onCancel} className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition">
        キャンセル
      </button>
      <button onClick={onConfirm} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-md">
        実行する
      </button>
    </div>
  </BaseModal>
);

const DetailModal = ({ isOpen, productName, currentDetail, currentOptions, optionsList, onSave, onClose }: any) => {
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
      <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">詳細設定: {productName}</h3>
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-3 font-bold uppercase tracking-wider">オプション（複数選択可）</p>
        <div className="flex flex-wrap gap-2">
          {optionsList && optionsList.map((opt: CustomOption, index: number) => {
            if (!opt.name) return null;
            const isSelected = selectedOpts.some(o => o.name === opt.name);
            return (
              <button
                key={`${opt.name}-${index}`} 
                onClick={() => toggleOption(opt)}
                className={`px-4 py-2.5 rounded-xl text-sm border-2 transition-all duration-200 font-bold ${
                  isSelected ? 'bg-orange-500 text-white border-orange-600 shadow-md transform scale-105' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                }`}
              >
                <span>{opt.name}</span>
                {opt.price !== 0 && (
                  <span className={`text-xs ml-1 ${isSelected ? 'text-white/80' : (opt.price < 0 ? 'text-red-500' : 'text-gray-400')}`}>
                    ({opt.price > 0 ? '+' : ''}{opt.price})
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
          className="w-full border-2 border-gray-200 p-3 rounded-xl h-24 outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm resize-none"
          placeholder="例: ネギ抜き、マヨ多めなど"
        />
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition">キャンセル</button>
        <button onClick={() => onSave(noteVal, selectedOpts)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition shadow-lg">保存</button>
      </div>
    </BaseModal>
  );
};

const PaymentModal = ({ isOpen, paymentMethods, totalAmount, onConfirm, onCancel }: any) => {
  const [selected, setSelected] = useState("");
  useEffect(() => { if (isOpen) setSelected(""); }, [isOpen]);
  if (!isOpen) return null;

  return (
    <BaseModal isOpen={isOpen} onClose={onCancel} closeOnOverlayClick={false}>
      <h3 className="text-xl font-bold text-gray-800 text-center mb-1">お支払い</h3>
      <p className="text-center text-gray-400 text-sm mb-4 font-bold uppercase tracking-widest">決済方法を選択してください</p>
      <div className="bg-blue-50 p-4 rounded-2xl mb-6 text-center">
        <span className="text-gray-500 text-sm block font-bold mb-1">合計金額</span>
        <span className="text-4xl font-black text-blue-700 font-mono">¥{totalAmount.toLocaleString()}</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-8">
        {paymentMethods.map((method: string) => (
          <button
            key={method}
            onClick={() => setSelected(method)}
            className={`py-5 px-2 rounded-2xl font-black text-lg transition-all duration-200 shadow-sm border-2 ${
              selected === method ? 'bg-blue-600 text-white border-blue-600 ring-4 ring-blue-100 shadow-xl transform scale-105' : 'bg-white text-gray-700 border-gray-100 hover:bg-gray-50 hover:border-blue-200'
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
          className={`flex-[2] py-4 text-white rounded-xl font-black text-xl transition-all shadow-lg ${selected ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-300 cursor-not-allowed'}`}
        >
          注文を確定
        </button>
      </div>
    </BaseModal>
  );
};

// ★追加: 整理券除外設定モーダル
const LostTicketModal = ({ isOpen, maxTicketNumber, lostTickets, onToggle, onClose }: any) => (
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
    <button onClick={onClose} className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition">
      設定を閉じる
    </button>
  </BaseModal>
);

const HamburgerMenu = ({ onNavigate, onReset }: { onNavigate: (path: string) => void, onReset: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="relative z-50">
      <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors focus:outline-none">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-3 w-60 bg-white rounded-2xl shadow-2xl border border-gray-100 animate-fadeIn origin-top-right overflow-hidden z-50">
            <div className="py-2">
              {[
                { path: '/settings', label: '⚙️ システム設定' },
                { path: '/report', label: '📈 営業日報' },
                { path: '/history', label: '📊 注文履歴' },
                { path: '/kds', label: '📺 調理画面 (KDS)' }
              ].map(item => (
                <button key={item.path} onClick={() => { onNavigate(item.path); setIsOpen(false); }} className="block w-full text-left px-5 py-4 text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition font-bold text-sm">
                  {item.label}
                </button>
              ))}
              <div className="border-t border-gray-100 my-2"></div>
              <button onClick={() => { onReset(); setIsOpen(false); }} className="block w-full text-left px-5 py-4 text-red-600 hover:bg-red-50 transition text-xs font-black uppercase tracking-widest">
                ⚠️ データリセット
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// --- メインコンポーネント ---
export default function OrderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [maxTicketNumber, setMaxTicketNumber] = useState(30); 
  const [currentTicket, setCurrentTicket] = useState<string>("1");
  const [activeTickets, setActiveTickets] = useState<number[]>([]);
  const [lostTickets, setLostTickets] = useState<number[]>([]); // ★追加: 紛失チケット
  const [lastIssuedNumber, setLastIssuedNumber] = useState<number>(0);
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [customizationOptions, setCustomizationOptions] = useState<CustomOption[]>([]);
  const [note, setNote] = useState("");

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");

  const [modals, setModals] = useState({ result: false, confirm: false, detail: false, payment: false, lost: false }); // ★追加: lost
  const [modalData, setModalData] = useState<any>({});

  const toggleModal = (key: keyof typeof modals, val: boolean, data = {}) => {
    setModals(prev => ({ ...prev, [key]: val }));
    if (val) setModalData(data);
  };

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
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await apiFetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      if (data.maxTicketNumber) setMaxTicketNumber(data.maxTicketNumber);
      if (data.paymentMethods) setPaymentMethods(data.paymentMethods);
      if (data.customizations) setCustomizationOptions(data.customizations);
      if (data.lostTickets) setLostTickets(data.lostTickets); // ★追加: 紛失チケット取得
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchTicketStatus();
    fetchSettings();
    const interval = setInterval(() => { fetchTicketStatus(); fetchSettings(); }, 5000);
    return () => clearInterval(interval);
  }, [fetchProducts, fetchTicketStatus, fetchSettings]);

  // ★修正: 貸出中 OR 紛失中の番号をスキップして発券番号を決定
  useEffect(() => {
    let nextNum = lastIssuedNumber + 1;
    if (nextNum > maxTicketNumber) nextNum = 1;
    let loopCount = 0;
    while ((activeTickets.includes(nextNum) || lostTickets.includes(nextNum)) && loopCount < maxTicketNumber) {
      nextNum++;
      if (nextNum > maxTicketNumber) nextNum = 1;
      loopCount++;
    }
    setCurrentTicket(loopCount >= maxTicketNumber ? "整理券切れ" : String(nextNum));
  }, [activeTickets, lostTickets, lastIssuedNumber, maxTicketNumber]);

  const addToCart = (product: Product) => {
    if (isEditMode) return;
    setCartItems(prev => {
      const idx = prev.findIndex(i => i.productName === product.name && !i.detail && (!i.selectedOptions || i.selectedOptions.length === 0));
      if (idx !== -1) return prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { productName: product.name, price: product.price, quantity: 1, detail: "", selectedOptions: [] }];
    });
  };

  const updateQuantity = (index: number, newQuantity: number) => {
    if (newQuantity < 1) return;
    setCartItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: newQuantity } : item));
  };

  const removeFromCart = (index: number) => {
    setCartItems(prev => prev.filter((_, i) => i !== index));
  };

  const totalAmount = cartItems.reduce((sum, item) => {
    const opPrice = item.selectedOptions?.reduce((s, o) => s + o.price, 0) || 0;
    return sum + ((item.price + opPrice) * item.quantity);
  }, 0);

  const handleOrder = async (method: string) => {
    toggleModal('payment', false);
    setLoading(true);
    const orderData = {
      ticketNumber: currentTicket,
      items: cartItems.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        amount: (item.price + (item.selectedOptions?.reduce((s, o) => s + o.price, 0) || 0)) * item.quantity,
        detail: item.detail,
        selectedOptions: item.selectedOptions
      })),
      totalAmount,
      status: 'active',
      paymentMethod: method,
      note
    };
    try {
      const res = await apiFetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) });
      if (res.ok) {
        toggleModal('result', true, { title: "注文完了", message: `整理券番号: ${currentTicket}`, type: "success" });
        setCartItems([]); setNote(""); fetchTicketStatus();
      }
    } finally { setLoading(false); }
  };

  // ★追加: 紛失チケットの設定保存
  const toggleLostTicket = async (num: number) => {
    const next = lostTickets.includes(num) ? lostTickets.filter(n => n !== num) : [...lostTickets, num];
    setLostTickets(next);
    await apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lostTickets: next }) });
  };

  const handleReturnTicket = (num: number) => {
    toggleModal('confirm', true, { message: `${num}番の整理券を\n返却（回収）済みにしますか？`, onConfirm: async () => {
      toggleModal('confirm', false);
      const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: String(num) }) });
      if (res.ok) await fetchTicketStatus();
    }});
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
      {/* モーダル群 */}
      <ResultModal isOpen={modals.result} {...modalData} onClose={() => toggleModal('result', false)} />
      <ConfirmModal isOpen={modals.confirm} {...modalData} onCancel={() => toggleModal('confirm', false)} />
      <DetailModal isOpen={modals.detail} {...modalData} optionsList={customizationOptions} onSave={(d: string, o: any) => {
        setCartItems(prev => {
          const target = prev[modalData.index];
          if (!target) return prev;
          if (target.quantity === 1) return prev.map((item, i) => i === modalData.index ? { ...item, detail: d, selectedOptions: o } : item);
          const next = [...prev];
          next[modalData.index] = { ...target, quantity: target.quantity - 1 };
          next.splice(modalData.index + 1, 0, { ...target, quantity: 1, detail: d, selectedOptions: o });
          return next;
        });
        toggleModal('detail', false);
      }} onClose={() => toggleModal('detail', false)} />
      <PaymentModal isOpen={modals.payment} paymentMethods={paymentMethods} totalAmount={totalAmount} onConfirm={handleOrder} onCancel={() => toggleModal('payment', false)} />
      {/* ★追加: 紛失チケットモーダル */}
      <LostTicketModal isOpen={modals.lost} maxTicketNumber={maxTicketNumber} lostTickets={lostTickets} onToggle={toggleLostTicket} onClose={() => toggleModal('lost', false)} />

      {/* 左エリア: メニュー */}
      <div className="w-3/5 flex flex-col h-full bg-white border-r">
        <div className="p-4 flex justify-between items-center border-b shadow-sm">
          <h2 className="text-xl font-bold text-gray-700">{isEditMode ? "メニュー編集" : "商品メニュー"}</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setIsEditMode(!isEditMode)} className={`px-4 py-2 rounded-full font-bold text-sm transition-all shadow-sm ${isEditMode ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {isEditMode ? "終了" : "商品管理"}
            </button>
            <HamburgerMenu onNavigate={(p) => router.push(p)} onReset={() => toggleModal('confirm', true, { message: "全データをリセットして初期化しますか？\n（商品リストは保持されます）", onConfirm: async () => { await apiFetch('/api/debug/reset', { method: 'DELETE' }); window.location.reload(); } })} />
          </div>
        </div>
        <div className="flex-1 p-4 overflow-y-auto bg-gray-50/30">
          <div className="grid grid-cols-3 gap-4">
            {products.map(p => (
              <button key={p._id} onClick={() => isEditMode ? (setEditingProduct(p), setFormName(p.name), setFormPrice(String(p.price))) : addToCart(p)} className="h-28 bg-white border-2 rounded-2xl flex flex-col items-center justify-center p-2 hover:border-blue-500 hover:bg-blue-50 transition-all active:scale-95 shadow-sm">
                <span className="font-black text-gray-800 text-center leading-tight mb-1">{p.name}</span>
                <span className="text-gray-500 text-sm font-bold font-mono">¥{p.price.toLocaleString()}</span>
              </button>
            ))}
            {isEditMode && <button onClick={() => { setEditingProduct(null); setFormName(""); setFormPrice(""); }} className="h-28 border-4 border-dashed border-green-400 text-green-500 rounded-2xl font-black text-4xl hover:bg-green-50 transition-colors">+</button>}
          </div>
        </div>
      </div>

      {/* 右エリア: カート */}
      <div className="w-2/5 bg-white flex flex-col h-full shadow-2xl border-l border-gray-200">
        {isEditMode ? (
          <div className="p-6 bg-gray-50 h-full">
            <h3 className="text-lg font-black mb-6 text-gray-700 border-b-2 border-gray-200 pb-2">{editingProduct ? "✏️ 商品情報の更新" : "🆕 新規商品の追加"}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">商品名</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} className="w-full border-2 border-gray-200 p-3 rounded-xl mt-1 outline-none focus:ring-2 focus:ring-blue-500 font-bold" placeholder="商品名" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">価格 (円)</label>
                <input value={formPrice} onChange={e => setFormPrice(e.target.value)} type="number" className="w-full border-2 border-gray-200 p-3 rounded-xl mt-1 outline-none focus:ring-2 focus:ring-blue-500 font-black font-mono" placeholder="450" />
              </div>
            </div>
            <button onClick={async () => {
              if (!formName || !formPrice) return;
              const body = editingProduct ? { _id: editingProduct._id, name: formName, price: formPrice } : { name: formName, price: formPrice };
              await apiFetch('/api/products', { method: editingProduct ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
              fetchProducts(); setEditingProduct(null); setFormName(""); setFormPrice("");
            }} className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-lg hover:bg-blue-700 transition transform active:scale-95 text-lg mt-6">保存する</button>
          </div>
        ) : (
          <>
            {/* 整理券番号エリア（コンパクト化） */}
            <div className="p-2 bg-blue-600 text-white shadow-md flex justify-between items-center z-10">
              <div className="flex items-center gap-2 pl-2">
                <span className="text-[9px] font-black tracking-widest opacity-80 uppercase leading-none">整理券番号</span>
                <div className="bg-white text-blue-600 px-3 py-0.5 rounded-lg font-black text-lg shadow-inner">
                  {currentTicket}
                </div>
              </div>
              {/* ★追加: 紛失設定ボタン */}
              <button 
                onClick={() => toggleModal('lost', true)} 
                className="text-[10px] bg-red-500 hover:bg-red-400 px-2 py-1.5 rounded-md font-black mr-1 border border-red-400 transition-colors shadow-sm"
              >
                紛失設定
              </button>
            </div>
            
            {/* カート内容 */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/50 shadow-inner">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 opacity-40">
                  <span className="text-7xl mb-4">🛒</span>
                  <p className="font-black text-sm tracking-widest uppercase">カートは空です</p>
                </div>
              ) : (
                cartItems.map((item, index) => {
                  const itemOpPrice = item.selectedOptions?.reduce((s, o) => s + o.price, 0) || 0;
                  return (
                    <div key={index} className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-2 transition-all hover:shadow-md">
                      <div className="flex justify-between items-start">
                        <span className="font-black text-gray-800 leading-tight text-sm">{item.productName}</span>
                        <button onClick={() => setCartItems(prev => prev.filter((_, i) => i !== index))} className="text-red-200 hover:text-red-500 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors">✕</button>
                      </div>
                      
                      <button 
                        onClick={() => toggleModal('detail', true, { index, productName: item.productName, currentDetail: item.detail, currentOptions: item.selectedOptions })} 
                        className={`w-full text-left text-[10px] p-2 rounded-xl transition-all border-2 border-dashed ${item.detail || item.selectedOptions?.length ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-100'}`}
                      >
                        <div className="flex flex-wrap gap-1">
                          {item.selectedOptions?.map((opt, i) => (
                            <span key={i} className={`px-1 rounded-md font-bold ${opt.price < 0 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-700'}`}>
                              {opt.name}{opt.price !== 0 ? `(${opt.price > 0 ? '+' : ''}${opt.price})` : ''}
                            </span>
                          ))}
                          {item.detail && <span className="font-black">📝 {item.detail}</span>}
                          {!item.detail && !item.selectedOptions?.length && "+ 詳細設定（トッピング・備考）"}
                        </div>
                      </button>

                      <div className="flex justify-between items-end mt-1">
                        <div className="flex items-center gap-1.5">
                          <div className="flex items-center bg-gray-100 rounded-lg overflow-hidden border border-gray-200 h-7">
                            <button onClick={() => updateQuantity(index, item.quantity - 1)} className="w-7 h-full flex items-center justify-center font-black hover:bg-gray-200" disabled={item.quantity <= 1}>-</button>
                            <span className="px-3 font-black text-xs min-w-[1.5rem] text-center">{item.quantity}</span>
                            <button onClick={() => updateQuantity(index, item.quantity + 1)} className="w-7 h-full flex items-center justify-center font-black hover:bg-gray-200">+</button>
                          </div>
                          {itemOpPrice !== 0 && (
                            <span className={`text-[10px] font-black ${itemOpPrice < 0 ? 'text-red-500' : 'text-orange-600'}`}>
                              (OP {itemOpPrice > 0 ? '+' : ''}{itemOpPrice})
                            </span>
                          )}
                        </div>
                        <span className="text-blue-700 font-black text-base font-mono">
                          ¥{((item.price + itemOpPrice) * item.quantity).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* 貸出中の整理券リスト */}
            <div className="px-6 py-2 bg-gray-50 border-t border-gray-200">
              <p className="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">貸出中の整理券</p>
              <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto">
                {activeTickets.length === 0 && <span className="text-xs text-gray-400 font-bold">貸出中の整理券はありません</span>}
                {activeTickets.sort((a,b)=>a-b).map((num) => (
                  <button key={num} onClick={() => toggleModal('confirm', true, { message: `${num}番の整理券を返却済みにしますか？`, onConfirm: async () => { toggleModal('confirm', false); const res = await apiFetch('/api/tickets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticketNumber: String(num) }) }); if(res.ok) fetchTicketStatus(); } })} className="bg-orange-100 text-orange-700 border border-orange-300 px-3 py-1 rounded-lg text-xs font-black hover:bg-orange-200 transition">
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* フッターエリア */}
            <div className="p-4 bg-white border-t-2 border-gray-100 shadow-2xl">
              <div className="flex justify-between items-end mb-4">
                <span className="text-gray-400 font-black uppercase tracking-[0.2em] text-xs">合計金額</span>
                <span className="text-4xl font-black text-gray-800 font-mono">¥{totalAmount.toLocaleString()}</span>
              </div>
              <textarea 
                value={note} 
                onChange={e => setNote(e.target.value)} 
                className="w-full border-2 border-gray-100 p-3 text-sm rounded-2xl mb-4 h-12 outline-none focus:ring-2 focus:ring-blue-500 font-sans resize-none font-bold bg-gray-50" 
                placeholder="注文全体の備考 (領収書、持ち帰りなど)" 
              />
              <button 
                onClick={() => toggleModal('payment', true)} 
                disabled={cartItems.length === 0 || currentTicket === "整理券切れ"} 
                className={`w-full py-5 rounded-2xl font-black text-xl text-white shadow-xl transition-all transform active:scale-95 ${cartItems.length === 0 || currentTicket === "整理券切れ" ? 'bg-gray-300 cursor-not-allowed opacity-50' : 'bg-green-600 hover:bg-green-700'}`}
              >
                注文を確定する
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}