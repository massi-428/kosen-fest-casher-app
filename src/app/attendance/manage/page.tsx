"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson, postJson } from '@/lib/client-api';
import { attendanceTime, durationLabel } from '@/lib/attendance';
import { HalfHourDateTime } from '@/components/common/HalfHourDateTime';

type Employee = { _id: string; personalId: number; name: string };
type Record = { _id: string; personalId: number; clockIn: string; clockOut: string | null };
type Shift = { _id: string; personalId: number; start: string; end: string };
type Data = { employees: Employee[]; records: Record[]; shifts: Shift[]; totals: { _id: number; milliseconds: number }[] };
const field = 'w-full border border-gray-300 rounded-xl px-4 py-3 bg-white text-gray-900';
const button = 'rounded-xl bg-gray-900 text-white px-5 py-3 font-bold disabled:opacity-40';

export default function AttendanceManagePage() {
  const [data, setData] = useState<Data>({ employees: [], records: [], shifts: [], totals: [] });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nextId, setNextId] = useState('');
  const [name, setName] = useState('');
  const names = name.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const [shiftId, setShiftId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const refresh = useCallback(async () => setData(await requestJson('/api/attendance')), []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '通信エラー'); }
    finally { lock.current = false; setBusy(false); }
  };
  const staffName = (personalId: number) => data.employees.find(e => e.personalId === personalId)?.name || '';

  return <main className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-8">
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-black">スタッフ・シフト管理</h1><p className="text-sm text-gray-500 mt-1">スタッフ・個人ID・シフト・打刻履歴（日本時間）</p></div><Link href="/attendance" className={button}>勤怠管理へ戻る</Link></header>
      {error && <div role="alert" className="bg-red-50 text-red-700 rounded-xl p-4">{error} <button disabled={busy} onClick={() => run(async () => { await refresh(); })} className="underline">再取得</button></div>}
      {message && <p role="status" className="bg-green-50 text-green-800 rounded-xl p-4">{message}</p>}
      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold">スタッフ一括登録</h2><p className="text-sm text-gray-500">1行に1人ずつ氏名を入力、または名簿を貼り付けてください（最大200人）。入力順に、既存IDの続きから自動発行します。空行は無視します。</p>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
            const result: { employees: Employee[] } = await postJson('/api/attendance', { action: 'employees', names });
            setName(''); setMessage(`${result.employees.length}人を登録しました。個人ID：${result.employees[0].personalId}〜${result.employees[result.employees.length - 1].personalId}`); await refresh();
          }); }}><label className="block">氏名（1行に1人）<textarea className={`${field} mt-2`} rows={6} value={name} required disabled={busy} onChange={e => setName(e.target.value)} placeholder={'山田 太郎\n佐藤 花子\n鈴木 次郎'} /></label><p className={names.length > 200 ? 'text-sm text-red-700' : 'text-sm text-gray-500'}>登録予定：{names.length}人 / 最大200人</p><button className={button} disabled={busy || !names.length || names.length > 200}>{names.length}人をまとめて登録</button></form>
          <ul className="divide-y max-h-80 overflow-auto">{data.employees.map(e => <li key={e._id} className="py-3 space-y-2">
            <div className="flex items-center justify-between gap-3"><span>ID {e.personalId} · {e.name}</span><button disabled={busy} className="text-sm underline" onClick={() => { setEditingId(e._id); setNextId(String(e.personalId)); }}>ID変更</button></div>
            {editingId === e._id && <form className="flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void run(async () => {
              const result = await postJson('/api/attendance', { action: 'changeId', personalId: e.personalId, employeeId: e._id, newPersonalId: nextId });
              setMessage(result.message); setEditingId(null); setShiftId(''); await refresh();
            }); }}><input aria-label={`${e.name}の新しい個人ID`} className={`${field} flex-1 min-w-24`} inputMode="numeric" pattern="[0-9]+" required disabled={busy} value={nextId} onChange={event => setNextId(event.target.value)} /><button className={button} disabled={busy}>保存</button><button type="button" disabled={busy} onClick={() => setEditingId(null)}>取消</button></form>}
          </li>)}</ul>
        </section>
        <section className="bg-white border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold">シフトを事前設定</h2><p className="text-sm text-gray-500">出勤15分前から、未出勤のスタッフを注文画面で通知します。</p>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(async () => {
            const result = await postJson('/api/attendance', { action: 'shift', personalId: shiftId, start, end });
            setMessage(result.message); await refresh();
          }); }}>
            <label className="block">スタッフ<select className={`${field} mt-2`} required disabled={busy} value={shiftId} onChange={e => setShiftId(e.target.value)}><option value="">選択してください</option>{data.employees.map(e => <option key={e.personalId} value={e.personalId}>{e.personalId} · {e.name}</option>)}</select></label>
            <HalfHourDateTime label="出勤予定" value={start} onChange={setStart} disabled={busy} />
            <HalfHourDateTime label="退勤予定" value={end} onChange={setEnd} disabled={busy} />
            <button className={button} disabled={busy}>シフトを登録</button>
          </form>
        </section>
      </div>
      <section className="bg-white border rounded-2xl p-6 space-y-4"><h2 className="text-lg font-bold">勤務時間の合計</h2><p className="text-sm text-gray-500">全期間の退勤済み記録を集計しています。出勤中の時間は含みません。休憩時間の控除はありません。</p>
        <p className="text-xl font-bold">全員合計：{durationLabel(data.totals.reduce((sum, t) => sum + t.milliseconds, 0))}</p>
        <ul className="divide-y">{data.employees.map(e => <li key={e._id} className="py-3 flex justify-between gap-3"><span>ID {e.personalId} · {e.name}</span><span className="font-bold">{durationLabel(data.totals.find(t => t._id === e.personalId)?.milliseconds || 0)}</span></li>)}</ul>
      </section>
      <section className="bg-white border rounded-2xl p-6 space-y-4"><h2 className="text-lg font-bold">今後のシフト</h2><p className="text-sm text-gray-500">変更する場合は削除して再登録してください。</p>
        {!data.shifts.length && <p>登録されたシフトはありません。</p>}
        <ul className="divide-y">{data.shifts.map(s => <li key={s._id} className="py-4 flex flex-wrap gap-3 justify-between items-center"><div><p className="font-bold">{s.personalId} · {staffName(s.personalId)}</p><p>{attendanceTime(s.start)} 〜 {attendanceTime(s.end)}</p></div><button className="text-red-700 underline disabled:opacity-40" disabled={busy} onClick={() => {
          if (!window.confirm('このシフトを削除しますか？')) return;
          void run(async () => { const result = await postJson('/api/attendance', { action: 'deleteShift', personalId: s.personalId, shiftId: s._id }); setMessage(result.message); await refresh(); });
        }}>削除</button></li>)}</ul>
      </section>
      <section className="bg-white border rounded-2xl p-6 space-y-4"><h2 className="text-lg font-bold">打刻履歴（最新100件）</h2><div className="overflow-x-auto"><table className="w-full text-left whitespace-nowrap"><thead><tr><th className="p-3">スタッフ</th><th className="p-3">出勤</th><th className="p-3">退勤</th></tr></thead><tbody>{data.records.map(r => <tr key={r._id} className="border-t"><td className="p-3">{r.personalId} · {staffName(r.personalId)}</td><td className="p-3">{attendanceTime(r.clockIn)}</td><td className="p-3">{r.clockOut ? attendanceTime(r.clockOut) : '出勤中'}</td></tr>)}</tbody></table></div>{!data.records.length && <p>打刻履歴はありません。</p>}</section>
    </div>
  </main>;
}
