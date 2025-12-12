"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [maxTicket, setMaxTicket] = useState<number | string>("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [customizations, setCustomizations] = useState<string[]>([]); // ★追加
  
  const [newMethod, setNewMethod] = useState("");
  const [newCustomization, setNewCustomization] = useState(""); // ★追加

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setMaxTicket(data.maxTicketNumber);
          setPaymentMethods(data.paymentMethods || []);
          setCustomizations(data.customizations || []); // ★追加
        }
      } catch (error) {
        console.error("設定取得エラー", error);
      }
    };
    fetchSettings();
  }, []);

  // 決済方法の操作
  const addPaymentMethod = () => {
    if (newMethod && !paymentMethods.includes(newMethod)) {
      setPaymentMethods([...paymentMethods, newMethod]);
      setNewMethod("");
    }
  };
  const removePaymentMethod = (val: string) => {
    setPaymentMethods(paymentMethods.filter(m => m !== val));
  };

  // ★追加: 別注オプションの操作
  const addCustomization = () => {
    if (newCustomization && !customizations.includes(newCustomization)) {
      setCustomizations([...customizations, newCustomization]);
      setNewCustomization("");
    }
  };
  const removeCustomization = (val: string) => {
    setCustomizations(customizations.filter(c => c !== val));
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          maxTicketNumber: maxTicket,
          paymentMethods: paymentMethods,
          customizations: customizations // ★送信
        }),
      });

      if (res.ok) {
        setMessage("設定を保存しました！");
      } else {
        setMessage("保存に失敗しました");
      }
    } catch (error) {
      setMessage("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6 font-sans flex flex-col items-center">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg p-8 overflow-y-auto max-h-screen">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-2">システム設定</h1>

        {/* 整理券設定 */}
        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">整理券番号の最大値</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              value={maxTicket}
              onChange={(e) => setMaxTicket(Number(e.target.value))}
              className="w-full border p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-xl font-bold"
            />
            <span className="text-gray-600 font-bold">番まで</span>
          </div>
        </div>

        {/* 決済方法設定 */}
        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">決済方法の管理</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
              placeholder="例: d払い"
              className="flex-1 border p-2 rounded-lg outline-none"
            />
            <button 
              onClick={addPaymentMethod}
              className="bg-green-600 text-white px-4 rounded-lg font-bold hover:bg-green-700"
            >
              追加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {paymentMethods.map((method) => (
              <div key={method} className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-2 border border-gray-300">
                <span>{method}</span>
                <button onClick={() => removePaymentMethod(method)} className="text-red-500 hover:text-red-700 font-bold px-1">×</button>
              </div>
            ))}
          </div>
        </div>

        {/* ★追加: 別注オプション設定 */}
        <div className="mb-8">
          <label className="block text-gray-700 font-bold mb-2">別注オプション (詳細設定) の定型文</label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newCustomization}
              onChange={(e) => setNewCustomization(e.target.value)}
              placeholder="例: 氷少なめ、ネギ抜き"
              className="flex-1 border p-2 rounded-lg outline-none"
            />
            <button 
              onClick={addCustomization}
              className="bg-orange-500 text-white px-4 rounded-lg font-bold hover:bg-orange-600"
            >
              追加
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {customizations.map((item) => (
              <div key={item} className="bg-orange-50 px-3 py-1 rounded-full flex items-center gap-2 border border-orange-200 text-orange-800">
                <span>{item}</span>
                <button onClick={() => removeCustomization(item)} className="text-red-500 hover:text-red-700 font-bold px-1">×</button>
              </div>
            ))}
          </div>
        </div>

        {message && (
          <div className={`p-3 rounded mb-4 text-center ${message.includes("失敗") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
            {message}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className={`w-full py-3 rounded-lg font-bold text-white transition ${
              loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? "保存中..." : "設定を保存する"}
          </button>

          <button
            onClick={() => router.push('/order')}
            className="w-full py-3 rounded-lg font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 transition"
          >
            注文画面に戻る
          </button>
        </div>
      </div>
    </div>
  );
}