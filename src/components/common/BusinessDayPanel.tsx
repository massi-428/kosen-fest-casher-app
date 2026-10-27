"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Toast } from './Toast';

export function BusinessDayPanel() {
  const [state, setState] = useState<{ date: string; closed: boolean; unfinished: number } | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const refresh = useCallback(async () => {
    setState(null); setChecked(false);
    try {
      const response = await fetch('/api/business-day', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      setState(data); setError('');
    } catch { setError('営業状態を取得できません。「状態を再確認」を押してください。'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <section className="mb-6 rounded-xl border-2 border-amber-300 bg-white p-5">
    <h2 className="text-xl font-bold">営業終了・〆作業</h2>
    <p className="my-2 font-bold">{state ? `${state.date}（日本時間）：${state.closed ? '営業終了' : '営業中'} ／ 未処理 ${state.unfinished}件` : '営業状態を確認してください'}</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li><a className="underline" href="/history">注文履歴</a>・<a className="underline" href="/kds">調理画面</a>で、未提供・保留・精算中の注文を完了してください。</li>
      <li>下の日報で本日の売上と現金を確認し、必要ならCSVを保存してください。</li>
      <li>確認チェックを入れて「本日の営業を締める」を押してください。</li>
    </ol>
    <p className="my-3 text-sm">締めると当日の新規注文を停止します。履歴は残り、翌日から受付が再開します。誤って締めた場合は、この画面の「営業を再開する」で戻せます。</p>
    <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded bg-gray-200 px-3 py-2">状態を再確認</button>
    {state?.closed && <button type="button" disabled={busy} className="ml-3 rounded bg-green-700 px-4 py-2 font-bold text-white disabled:opacity-40" onClick={async () => {
      if (lock.current || !window.confirm('本日の営業を再開しますか？注文受付を再開します。履歴は保持されます。')) return;
      lock.current = true; setBusy(true); setMessage(''); setError('');
      try {
        const response = await fetch('/api/business-day', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: state.date, confirm: true, action: 'reopen' }) });
        const data = await response.json();
        await refresh();
        if (!response.ok) setError(data.message); else setMessage(data.message);
      } catch { setState(null); setError('結果を確認できません。状態を再確認してください。'); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? '処理中…' : '営業を再開する'}</button>}
    {!state?.closed && <div className="mt-3">
      <label className="block"><input type="checkbox" checked={checked} disabled={!state || busy || state.unfinished > 0} onChange={event => setChecked(event.target.checked)} /> 本日の売上・現金・未処理注文を確認しました</label>
      <button type="button" disabled={!state || state.unfinished > 0 || !checked || busy} className="mt-3 rounded bg-amber-500 px-4 py-3 font-bold disabled:opacity-40" onClick={async () => {
        if (!state || lock.current) return;
        lock.current = true; setBusy(true); setError(''); setMessage('');
        try {
          const response = await fetch('/api/business-day', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: state.date, confirm: checked }) });
          const data = await response.json();
          await refresh();
          if (!response.ok) setError(data.message); else setMessage(data.message);
        } catch { setState(null); setError('結果を確認できません。状態を再確認してください。'); }
        finally { setBusy(false); lock.current = false; }
      }}>{busy ? '処理中…' : '本日の営業を締める'}</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    <Toast show={Boolean(message)} message={message} title="営業状態を更新しました" onClose={() => setMessage('')} />
  </section>;
}
