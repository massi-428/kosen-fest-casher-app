"use client";

import { Toast } from '@/components/common/Toast';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson, postJson } from '@/lib/client-api';
import { attendanceTime } from '@/lib/attendance';

type Employee = { _id: string; personalId: number; name: string };
type Record = { _id: string; personalId: number; clockIn: string; clockOut: string | null };
const field = 'w-full border border-gray-300 rounded-xl px-3 py-2 bg-white text-gray-900';
const button = 'rounded-xl bg-gray-900 text-white px-3 py-2 font-bold disabled:opacity-40';

export default function AttendancePage() {
  const [id, setId] = useState('');
  const [selected, setSelected] = useState<{ employee: Employee; active: Record | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const idInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!busy) idInput.current?.focus(); }, [busy]);
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
  const punch = async () => {
    if (!selected) return;
    const target = selected;
    setSelected(null);
    try {
      const result = await postJson('/api/attendance', { action: target.active ? 'clockOut' : 'clockIn', personalId: target.employee.personalId, employeeId: target.employee._id, recordId: target.active?._id });
      setMessage(`${target.employee.name}：${result.message}`);
      setId('');
    } finally { await refreshActive(); }
  };

  return <main className="min-h-full bg-gray-50 text-gray-900 p-3 lg:p-4">
    <div className="max-w-7xl mx-auto space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-xl font-black">勤怠管理</h1><p className="text-sm text-gray-500 mt-1">個人IDを入力して出勤・退勤を記録します。</p></div><Link href="/order" className={button}>注文画面へ</Link></header>
      {error && <div role="alert" className="bg-red-50 text-red-700 rounded-xl p-2">{error} <button disabled={busy} onClick={() => run(async () => { await lookup(); })} className="underline">再取得</button></div>}
      <Toast show={Boolean(message)} message={message} title="保存完了" onClose={() => setMessage('')} />
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-3 items-start">
      <section className="lg:col-start-2 lg:row-start-1 bg-white border rounded-xl p-3 space-y-3">
        <h2 className="text-lg font-bold">出勤・退勤</h2>
        <form onKeyDown={e => { if (e.key === 'Enter' && (e.repeat || e.nativeEvent.isComposing)) e.preventDefault(); }} onSubmit={e => { e.preventDefault(); void run(selected ? punch : lookup); }} className="space-y-3">
          <label className="block text-sm font-bold">個人ID<input ref={idInput} className={`${field} mt-1`} inputMode="numeric" pattern="[0-9]+" required value={id} readOnly={busy} onChange={e => { setId(e.target.value); setSelected(null); lookupVersion.current++; }} placeholder="例：1" /></label>
          {selected && <div className="rounded-lg bg-gray-50 p-2" aria-live="polite"><p className="font-bold">ID {selected.employee.personalId} · {selected.employee.name}</p><p className="text-sm text-gray-500">{selected.active ? `出勤中 · ${attendanceTime(selected.active.clockIn)}〜` : '未出勤'}</p></div>}
          <button className={`${button} w-full ${selected ? selected.active ? 'bg-orange-700' : 'bg-green-700' : ''}`} disabled={busy}>{busy ? '処理中…' : selected ? `${selected.active ? '退勤' : '出勤'}（Enter）` : '確認（Enter）'}</button>
          <p className="text-xs text-gray-500">ID入力 → Enterで確認 → Enterで打刻</p>
        </form>
      </section>
      <section className="lg:col-start-1 lg:row-start-1 h-[clamp(18rem,calc(100dvh-15rem),42rem)] min-h-0 flex flex-col overflow-hidden bg-white border rounded-xl p-3 gap-2">
        <div className="shrink-0 flex justify-between items-center gap-3 border-b border-gray-100 pb-2"><h2 id="active-staff-heading" className="text-lg font-bold">出勤中のスタッフ{activeReady ? `（${activeStaff.length}人）` : ''}</h2><button className="underline text-sm" disabled={busy} onClick={() => void refreshActive()}>更新</button></div>
        {activeError && <p role="alert" className="shrink-0 text-red-700">{activeError} 一覧を更新してください。</p>}
        <div role="region" aria-labelledby="active-staff-heading" tabIndex={0} className="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] rounded-lg bg-gray-50 p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400">
        {!activeReady && !activeError && <p>読み込み中…</p>}
        {activeReady && !activeError && !activeStaff.length && <p className="text-gray-500">出勤中のスタッフはいません。</p>}
        <ul className="flex flex-col gap-1.5">{activeStaff.map(staff => <li key={staff._id} className="min-w-0 shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-2 flex items-center justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold truncate" title={`ID ${staff.personalId} · ${staff.name}`}>{staff.personalId} · {staff.name}</p><p className="text-xs text-gray-500">{attendanceTime(staff.clockIn)}〜</p></div><button className="shrink-0 rounded-lg bg-orange-700 text-white text-xs font-bold px-3 min-h-9 disabled:opacity-40" disabled={busy || !!activeError} aria-label={`${staff.name}を退勤にする`} onClick={() => void run(async () => {
          setSelected(null);
          try {
            const result = await postJson('/api/attendance', { action: 'clockOut', personalId: staff.personalId, recordId: staff._id });
            setMessage(`${staff.name}：${result.message}`);
          } finally { await refreshActive(); }
        })}>退勤</button></li>)}</ul>
        </div>
      </section>
      </div>
      <nav aria-label="勤怠管理メニュー" className="border-t pt-2"><Link href="/attendance/manage" className="inline-flex rounded-xl border border-gray-300 bg-white px-3 py-2 font-bold hover:bg-gray-100">スタッフ・シフト管理 →</Link><p className="text-sm text-gray-500 mt-2">管理担当者向け：スタッフ一括登録・個人IDの確認・シフト設定・打刻履歴</p></nav>
    </div>
  </main>;
}
