"use client";

import { useEffect, useRef, useState } from 'react';
import { Toast } from '@/components/common/Toast';

export function TestDataReset() {
  const [database, setDatabase] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/test-reset', { cache: 'no-store' }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled && data.enabled) setDatabase(data.database);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!database) return null;
  return <form className="my-6 rounded-xl border-2 border-red-300 bg-red-50 p-4" onSubmit={async event => {
    event.preventDefault();
    if (lock.current || !confirmed || !password) return;
    lock.current = true; setBusy(true); setResult(null);
    try {
      const response = await fetch('/api/admin/test-reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, confirm: confirmed }) });
      const data = await response.json();
      setResult({ ok: response.ok, message: data.message });
    } catch { setResult({ ok: false, message: '結果を確認できません。DBの状態を確認してください。' }); }
    finally { setPassword(''); setConfirmed(false); setBusy(false); lock.current = false; }
  }}>
    <h2 className="font-bold">テストデータのリセット</h2>
    <p className="my-2 text-sm">対象DB：{database}。全店舗の注文履歴・会計途中の情報を削除し、整理券を先頭に戻して本日の受付を停止します。商品・アカウント・設定は残ります。完了後は店舗アカウントの日報画面から「営業を再開する」を押し、各端末を再読み込みしてください。</p>
    <fieldset disabled={busy}>
      <label className="block text-sm font-bold" htmlFor="test-reset-password">ログイン中の管理者のパスワード</label>
      <input id="test-reset-password" className="my-2 w-full rounded border p-2" type="password" autoComplete="current-password" maxLength={1024} required value={password} onChange={event => setPassword(event.target.value)} />
      <label className="my-2 block text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> テストデータを削除することを確認しました</label>
      <button className="rounded bg-red-700 px-4 py-2 font-bold text-white disabled:opacity-50" disabled={busy || !confirmed || !password}>{busy ? 'リセット中…' : 'パスワードを確認してリセット'}</button>
    </fieldset>
    <Toast show={result?.ok === true} title="リセット完了" message={result?.message || ''} onClose={() => setResult(null)} />
    {result && !result.ok && <p role="alert" className="mt-2 text-red-700">{result.message}</p>}
  </form>;
}
