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
    <h2 className="text-xl font-bold">本日の営業を終了する</h2>
    <p className="my-2 font-bold">{state ? `${state.date}（日本時間）：${state.closed ? '営業終了' : '営業中'} ／ 未提供・手続き中 ${state.unfinished}件` : '営業状態を確認してください'}</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li><a className="underline" href="/history">注文履歴</a>・<a className="underline" href="/kds">調理画面</a>で、商品が未提供の注文や、変更・返金の手続きを完了してください。</li>
      <li>下の日報で本日の売上と現金を確認し、必要ならCSVを保存してください。</li>
      <li>確認チェックを入れて「本日の営業を終了する」を押してください。</li>
    </ol>
    <p className="my-3 text-sm">営業を終了すると、本日の新しい注文を受け付けなくなります。注文履歴は残ります。翌日（日本時間の0時）に受付が自動で再開します。同じ日に再開する場合は「営業を再開する」を押してください。</p>
    <button type="button" disabled={busy} onClick={() => void refresh()} className="ui-button ui-button--secondary px-3 py-2">状態を再確認</button>
    {state?.closed && <button type="button" disabled={busy} className="ui-button ui-button--primary ml-3 px-4 py-2 disabled:opacity-40" onClick={async () => {
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
      <label className="block"><input type="checkbox" checked={checked} disabled={!state || busy || state.unfinished > 0} onChange={event => setChecked(event.target.checked)} /> 本日の売上と現金を確認し、すべての注文の対応が済みました</label>
      <button type="button" disabled={!state || state.unfinished > 0 || !checked || busy} className="ui-button ui-button--primary mt-3 px-4 py-3 disabled:opacity-40" onClick={async () => {
        if (!state || lock.current) return;
        lock.current = true; setBusy(true); setError(''); setMessage('');
        try {
          const response = await fetch('/api/business-day', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: state.date, confirm: checked }) });
          const data = await response.json();
          await refresh();
          if (!response.ok) setError(data.message); else setMessage(data.message);
        } catch { setState(null); setError('結果を確認できません。状態を再確認してください。'); }
        finally { setBusy(false); lock.current = false; }
      }}>{busy ? '処理中…' : '本日の営業を終了する'}</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    <Toast show={Boolean(message)} message={message} title="営業状態を更新しました" onClose={() => setMessage('')} />
  </section>;
}
