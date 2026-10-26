"use client";

import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { requestJson, ApiError } from '@/lib/client-api';
import { attendanceTime, durationLabel } from '@/lib/attendance';

type Employee = { _id: string; personalId: number; name: string; archivedAt?: string | null };
type Record = { _id: string; personalId: number; clockIn: string; clockOut: string | null };
type Shift = { _id: string; personalId: number; start?: string; end?: string; festivalDay?: number; startTime?: string; endTime?: string };
type Data = { employees: Employee[]; records: Record[]; shifts: Shift[]; totals: { _id: number; milliseconds: number }[]; notificationDay: number };
const field = 'w-full border border-gray-300 rounded-xl px-3 py-2 bg-white text-gray-900';
const button = 'rounded-xl bg-gray-900 text-white px-3 py-2 font-bold disabled:opacity-40';

function AttendanceManager({ password, initialData, onLock }: { password: string; initialData: Data; onLock: () => void }) {
  const [data, setData] = useState<Data>(initialData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextId, setNextId] = useState('');
  const [name, setName] = useState('');
  const names = name.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const [shiftId, setShiftId] = useState('');
  const [day, setDay] = useState(1);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('16:00');
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const shiftForm = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const refresh = useCallback(async () => setData(await requestJson('/api/attendance', { headers: { 'X-Attendance-Password': encodeURIComponent(password) } })), [password]);
  const postJson = (url: string, body: unknown) => requestJson(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Attendance-Password': encodeURIComponent(password) }, body: JSON.stringify(body) });

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onLock(); else setError(e instanceof Error ? e.message : '通信エラー'); }
    finally { lock.current = false; setBusy(false); }
  };
  const staffName = (personalId: number) => data.employees.find(e => e.personalId === personalId)?.name || '';
  const currentEmployees = data.employees.filter(e => !e.archivedAt);

  return <main className="min-h-full bg-gray-50 text-gray-900 p-3 lg:p-4">
    <div className="max-w-5xl mx-auto space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-xl font-black">スタッフ・シフト管理</h1><p className="text-sm text-gray-500 mt-1">スタッフ・個人ID・シフト・打刻履歴（日本時間）</p></div><div className="flex gap-2"><button type="button" onClick={onLock} className={button}>ロック</button><Link href="/attendance" className={button}>勤怠管理へ戻る</Link></div></header>
      {error && <div role="alert" className="bg-red-50 text-red-700 rounded-xl p-2">{error} <button disabled={busy} onClick={() => run(async () => { await refresh(); })} className="underline">再取得</button></div>}
      {message && <p role="status" className="bg-green-50 text-green-800 rounded-xl p-2">{message}</p>}
      <div className="grid md:grid-cols-2 gap-3">
        <section className="bg-white border rounded-xl p-3 space-y-2">
          <h2 className="text-lg font-bold">スタッフ一括登録</h2><p className="text-sm text-gray-500">1行に1人ずつ氏名を入力、または名簿を貼り付けてください（最大200人）。入力順に、既存IDの続きから自動発行します。空行は無視します。</p>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
            const result: { employees: Employee[] } = await postJson('/api/attendance', { action: 'employees', names });
            setName(''); setMessage(`${result.employees.length}人を登録しました。個人ID：${result.employees[0].personalId}〜${result.employees[result.employees.length - 1].personalId}`); await refresh();
          }); }}><label className="block">氏名（1行に1人）<textarea className={`${field} mt-2`} rows={3} value={name} required disabled={busy} onChange={e => setName(e.target.value)} placeholder={'山田 太郎\n佐藤 花子\n鈴木 次郎'} /></label><p className={names.length > 200 ? 'text-sm text-red-700' : 'text-sm text-gray-500'}>登録予定：{names.length}人 / 最大200人</p><button className={button} disabled={busy || !names.length || names.length > 200}>{names.length}人をまとめて登録</button></form>
          <ul className="divide-y max-h-80 overflow-auto">{currentEmployees.map(e => <li key={e._id} className="py-2 space-y-1">
            <div className="flex items-center justify-between gap-3"><span>ID {e.personalId} · {e.name}</span><div className="flex gap-3 shrink-0"><button disabled={busy} className="text-sm underline" onClick={() => { setEditingId(e._id); setNextId(String(e.personalId)); }}>ID変更</button><button disabled={busy} className="text-sm underline text-red-700" onClick={() => {
              if (!window.confirm(`${e.name}さんを削除しますか？ 今後のシフトは削除し、打刻履歴と勤務時間は残します。`)) return;
              void run(async () => { const result = await postJson('/api/attendance', { action: 'deleteEmployee', personalId: e.personalId, employeeId: e._id }); setMessage(result.message); setEditingId(null); setShiftId(''); await refresh(); });
            }}>削除</button></div></div>
            {editingId === e._id && <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void run(async () => {
              const result = await postJson('/api/attendance', { action: 'changeId', personalId: e.personalId, employeeId: e._id, newPersonalId: nextId });
              setMessage(result.message); setEditingId(null); setShiftId(''); await refresh();
            }); }}><input aria-label={`${e.name}の新しい個人ID`} className={`${field} flex-1 min-w-24`} inputMode="numeric" pattern="[0-9]+" required disabled={busy} value={nextId} onChange={event => setNextId(event.target.value)} /><button className={button} disabled={busy}>保存</button><button type="button" disabled={busy} onClick={() => setEditingId(null)}>取消</button></form>}
          </li>)}</ul>
        </section>
        <section className="bg-white border rounded-xl p-3 space-y-2">
          <h2 className="text-lg font-bold">シフトを事前設定</h2><p className="text-sm text-gray-500">出勤予定時刻に、未出勤のスタッフを注文画面で通知します。</p>
          <div className="rounded-lg bg-gray-50 p-2 space-y-2"><p className="text-xs font-bold">本日の通知対象（日付が変わると停止）</p><div className="flex gap-2">{[0, 1, 2].map(value => <button key={value} type="button" disabled={busy} aria-pressed={data.notificationDay === value} className={`rounded-lg border px-3 py-1 text-sm ${data.notificationDay === value ? 'bg-gray-900 text-white' : 'bg-white'}`} onClick={() => void run(async () => { const result = await postJson('/api/attendance', { action: 'notificationDay', day: value }); setMessage(result.message); await refresh(); })}>{value ? `${value}日目` : '停止'}</button>)}</div></div>
          <form ref={shiftForm} className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
            const result = await postJson('/api/attendance', { action: editingShift ? 'updateShift' : 'shift', shiftId: editingShift, personalId: shiftId, day, start, end });
            setMessage(result.message); setEditingShift(null); await refresh();
          }); }}>
            <fieldset disabled={busy}><legend className="text-sm mb-1">日程</legend><div className="flex gap-2">{[1, 2].map(value => <button key={value} type="button" aria-pressed={day === value} onClick={() => setDay(value)} className={`flex-1 rounded-lg border py-2 font-bold ${day === value ? 'bg-yellow-300 border-yellow-500' : 'bg-white'}`}>{value}日目</button>)}</div></fieldset>
            <label className="block">スタッフID<input className={`${field} mt-1`} inputMode="numeric" pattern="[0-9]+" required readOnly={!!editingShift} disabled={busy} value={shiftId} onChange={e => setShiftId(e.target.value)} placeholder="例：1" /></label>
            {shiftId && <p className="text-sm" role="status">{currentEmployees.find(e => e.personalId === Number(shiftId))?.name || '登録済みのスタッフIDを入力してください'}</p>}
            <div className="grid grid-cols-2 gap-2"><label>開始時刻<input className={`${field} mt-1`} type="time" min="10:00" max="15:30" step={1800} required disabled={busy} value={start} onChange={e => setStart(e.target.value)} /></label><label>終了時刻<input className={`${field} mt-1`} type="time" min="10:30" max="16:00" step={1800} required disabled={busy} value={end} onChange={e => setEnd(e.target.value)} /></label></div>
            <p className="text-xs text-gray-500">10:00〜16:00・30分刻み。時刻はキーボードで入力できます。</p>
            <div className="flex gap-2"><button className={button} disabled={busy || !currentEmployees.some(e => e.personalId === Number(shiftId))}>{editingShift ? 'シフトを更新' : 'シフトを登録'}</button>{editingShift && <button type="button" disabled={busy} onClick={() => setEditingShift(null)}>編集をやめる</button>}</div>
          </form>
        </section>
      </div>
      <section className="bg-white border rounded-xl p-3 space-y-2"><h2 className="text-lg font-bold">勤務時間の合計</h2><p className="text-sm text-gray-500">全期間の退勤済み記録を集計しています。出勤中の時間は含みません。休憩時間の控除はありません。</p>
        <ul className="grid md:grid-cols-3 gap-x-4">{data.employees.map(e => <li key={e._id} className="py-2 border-b flex justify-between gap-3 text-sm"><span>ID {e.personalId} · {e.name}{e.archivedAt ? '（削除済み）' : ''}</span><span className="font-bold shrink-0">{durationLabel(data.totals.find(t => t._id === e.personalId)?.milliseconds || 0)}</span></li>)}</ul>
      </section>
      <section className="bg-white border rounded-xl p-3 space-y-2"><h2 className="text-lg font-bold">登録済みシフト</h2><p className="text-sm text-gray-500">「編集」で日程・勤務時間を変更できます。</p>
        {!data.shifts.length && <p>登録されたシフトはありません。</p>}
        <ul className="divide-y">{data.shifts.map(s => <li key={s._id} className="py-2 flex flex-wrap gap-3 justify-between items-center"><div><p className="font-bold">{s.personalId} · {staffName(s.personalId)}</p><p>{s.festivalDay ? `${s.festivalDay}日目 · ${s.startTime}〜${s.endTime}` : `旧設定：${s.start ? attendanceTime(s.start) : ''}〜${s.end ? attendanceTime(s.end) : ''}（編集して日程を選択してください）`}</p></div><div className="flex gap-3"><button className="underline" disabled={busy} onClick={() => { setEditingShift(s._id); setShiftId(String(s.personalId)); setDay(s.festivalDay || 1); setStart(s.startTime || '10:00'); setEnd(s.endTime || '16:00'); shiftForm.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>編集</button><button className="text-red-700 underline disabled:opacity-40" disabled={busy} onClick={() => {
          if (!window.confirm('このシフトを削除しますか？')) return;
          void run(async () => { const result = await postJson('/api/attendance', { action: 'deleteShift', personalId: s.personalId, shiftId: s._id }); setMessage(result.message); await refresh(); });
        }}>削除</button></div></li>)}</ul>
      </section>
      <section className="bg-white border rounded-xl p-3 space-y-2"><h2 className="text-lg font-bold">打刻履歴（最新100件）</h2><div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap"><thead><tr><th className="p-3">スタッフ</th><th className="p-3">出勤</th><th className="p-3">退勤</th></tr></thead><tbody>{data.records.map(r => <tr key={r._id} className="border-t"><td className="p-3">{r.personalId} · {staffName(r.personalId)}</td><td className="p-3">{attendanceTime(r.clockIn)}</td><td className="p-3">{r.clockOut ? attendanceTime(r.clockOut) : '出勤中'}</td></tr>)}</tbody></table></div>{!data.records.length && <p>打刻履歴はありません。</p>}</section>
    </div>
  </main>;
}

export default function AttendanceManagePage() {
  const [access, setAccess] = useState<{ password: string; data: Data } | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const attempt = useRef(0);
  const unlock = async () => {
    if (busy) return;
    const version = ++attempt.current;
    setBusy(true); setError('');
    try {
      const data = await requestJson('/api/attendance', { headers: { 'X-Attendance-Password': encodeURIComponent(password) } });
      if (version === attempt.current) { setAccess({ password, data }); setPassword(''); }
    } catch (e) { if (version === attempt.current) setError(e instanceof ApiError && e.status === 403 ? 'パスワードが正しくありません' : e instanceof Error ? e.message : '認証できませんでした'); }
    finally { if (version === attempt.current) setBusy(false); }
  };
  if (access) return <AttendanceManager password={access.password} initialData={access.data} onLock={() => { attempt.current++; setAccess(null); setPassword(''); setError(''); setBusy(false); }} />;
  return <main className="min-h-full bg-gray-50 p-4 text-gray-900 flex items-center justify-center"><section className="w-full max-w-sm rounded-2xl border bg-white p-6 space-y-4">
    <h1 className="text-xl font-black">スタッフ・シフト管理</h1>
    <p className="text-sm text-gray-600">現在ログインしている店舗アカウントのパスワードを入力してください。</p>
    <form onSubmit={e => { e.preventDefault(); void unlock(); }} className="space-y-3">
      <label className="block text-sm font-bold">パスワード<input type="password" autoComplete="current-password" autoFocus required maxLength={256} disabled={busy} className={`${field} mt-1`} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className={`${button} w-full`}>{busy ? '確認中…' : 'ロックを解除'}</button>
    </form>
    <Link href="/attendance" className="block text-center text-sm underline">勤怠管理へ戻る</Link>
  </section></main>;
}
