"use client";

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson, postJson } from '@/lib/client-api';
import { attendanceTime } from '@/lib/attendance';

type Employee = { _id: string; personalId: number; name: string };
type Record = { _id: string; personalId: number; clockIn: string; clockOut: string | null };
const field = 'w-full border border-gray-300 rounded-xl px-4 py-3 bg-white text-gray-900';
const button = 'rounded-xl bg-gray-900 text-white px-5 py-3 font-bold disabled:opacity-40';

export default function AttendancePage() {
  const [id, setId] = useState('');
  const [selected, setSelected] = useState<{ employee: Employee; active: Record | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeStaff, setActiveStaff] = useState<(Record & { name: string })[]>([]);
  const [activeError, setActiveError] = useState('');
  const [activeReady, setActiveReady] = useState(false);
  const activeVersion = useRef(0);
  const invalidateActive = useCallback(() => { activeVersion.current++; }, []);
  const refreshActive = useCallback(async () => {
    const version = ++activeVersion.current;
    try {
      const records = await requestJson('/api/attendance?mode=active');
      if (version === activeVersion.current) { setActiveStaff(records); setActiveReady(true); setActiveError(''); }
    } catch (e) { if (version === activeVersion.current) setActiveError(e instanceof Error ? e.message : '出勤中のスタッフを取得できません'); }
  }, []);
  useEffect(() => {
    void refreshActive();
    const timer = setInterval(() => { if (!document.hidden) void refreshActive(); }, 30000);
    return () => { clearInterval(timer); invalidateActive(); };
  }, [refreshActive, invalidateActive]);
  const lock = useRef(false);
  const lookupVersion = useRef(0);
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '通信エラー'); }
    finally { lock.current = false; setBusy(false); }
  };
  const lookup = async () => {
    const version = ++lookupVersion.current;
    setSelected(null);
    const result = await requestJson(`/api/attendance?personalId=${encodeURIComponent(id)}`);
    if (version === lookupVersion.current) setSelected(result);
  };

  return <main className="min-h-screen bg-gray-50 text-gray-900 p-4 sm:p-8">
    <div className="max-w-2xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-black">勤怠管理</h1><p className="text-sm text-gray-500 mt-1">個人IDを入力して出勤・退勤を記録します。</p></div><Link href="/order" className={button}>注文画面へ</Link></header>
      {error && <div role="alert" className="bg-red-50 text-red-700 rounded-xl p-4">{error} <button disabled={busy} onClick={() => run(async () => { await lookup(); })} className="underline">再取得</button></div>}
      {message && <p role="status" className="bg-green-50 text-green-800 rounded-xl p-4">{message}</p>}
      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold">出勤・退勤</h2>
        <form onSubmit={e => { e.preventDefault(); void run(lookup); }} className="flex items-end gap-3">
          <label className="flex-1">個人ID<input className={`${field} mt-2`} inputMode="numeric" pattern="[0-9]+" required value={id} disabled={busy} onChange={e => { setId(e.target.value); setSelected(null); lookupVersion.current++; }} placeholder="例：1" /></label>
          <button className={button} disabled={busy}>確認</button>
        </form>
        {selected && <div className="rounded-xl bg-gray-50 p-4 flex flex-wrap items-center justify-between gap-4"><div><p className="font-bold">ID {selected.employee.personalId} · {selected.employee.name}</p><p className="text-sm mt-1">{selected.active ? `出勤中 · ${attendanceTime(selected.active.clockIn)}〜` : '未出勤'}</p></div>
          <button disabled={busy} className={`${button} ${selected.active ? 'bg-orange-700' : 'bg-green-700'}`} onClick={() => run(async () => {
            const target = selected; setSelected(null);
            const result = await postJson('/api/attendance', { action: target.active ? 'clockOut' : 'clockIn', personalId: target.employee.personalId, employeeId: target.employee._id, recordId: target.active?._id });
            setMessage(`${target.employee.name}：${result.message}`);
            await refreshActive();
            await lookup();
          })}>{selected.active ? '退勤' : '出勤'}</button>
        </div>}
      </section>
      <section className="bg-white border rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center gap-3"><h2 className="text-lg font-bold">出勤中のスタッフ{activeReady ? `（${activeStaff.length}人）` : ''}</h2><button className="underline text-sm" disabled={busy} onClick={() => void refreshActive()}>更新</button></div>
        {activeError && <p role="alert" className="text-red-700">{activeError} 一覧を更新してください。</p>}
        {!activeReady && !activeError && <p>読み込み中…</p>}
        {activeReady && !activeError && !activeStaff.length && <p className="text-gray-500">出勤中のスタッフはいません。</p>}
        <ul className="divide-y">{activeStaff.map(staff => <li key={staff._id} className="py-4 flex flex-wrap items-center justify-between gap-3"><div><p className="font-bold">ID {staff.personalId} · {staff.name}</p><p className="text-sm text-gray-500">{attendanceTime(staff.clockIn)}〜</p></div><button className={`${button} bg-orange-700`} disabled={busy || !!activeError} aria-label={`${staff.name}を退勤にする`} onClick={() => void run(async () => {
          setSelected(null);
          try {
            const result = await postJson('/api/attendance', { action: 'clockOut', personalId: staff.personalId, recordId: staff._id });
            setMessage(`${staff.name}：${result.message}`);
          } finally { await refreshActive(); }
        })}>退勤</button></li>)}</ul>
      </section>
      <nav aria-label="勤怠管理メニュー" className="border-t pt-6"><Link href="/attendance/manage" className="inline-flex rounded-xl border border-gray-300 bg-white px-5 py-3 font-bold hover:bg-gray-100">スタッフ・シフト管理 →</Link><p className="text-sm text-gray-500 mt-2">管理担当者向け：スタッフ一括登録・個人IDの確認・シフト設定・打刻履歴</p></nav>
    </div>
  </main>;
}
