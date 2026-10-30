"use client";

import { useRef, useState } from 'react';
import { festivalShift } from '@/lib/attendance';

type Employee = { personalId: number; name: string; archivedAt?: string | null };
type Shift = { _id: string; personalId: number; festivalDay?: number; startTime?: string; endTime?: string };
const times = Array.from({ length: 13 }, (_, i) => `${10 + Math.floor(i / 2)}:${i % 2 ? '30' : '00'}`);
const slot = (time: string) => (Number(time.slice(0, 2)) - 10) * 2 + Number(time.slice(3)) / 30;
const pageSize = 40;
const width = 1200;
const left = 300;
const cell = 72;
const top = 120;
const rowHeight = 58;
const button = 'rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-40';

export function ShiftGrid({ employees, shifts }: { employees: Employee[]; shifts: Shift[] }) {
  const [day, setDay] = useState(1);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const svgRef = useRef<SVGSVGElement>(null);
  const exportLock = useRef(false);
  const valid = shifts.filter(s => festivalShift(s.festivalDay, s.startTime, s.endTime));
  const daily = valid.filter(s => s.festivalDay === day);
  const staff = new Map(employees.filter(e => !e.archivedAt).map(e => [e.personalId, e]));
  for (const shift of daily) {
    if (!staff.has(shift.personalId)) staff.set(shift.personalId, employees.find(e => e.personalId === shift.personalId) || { personalId: shift.personalId, name: '未登録スタッフ' });
  }
  const rows = Array.from(staff.values()).sort((a, b) => a.personalId - b.personalId);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const height = top + Math.max(1, visible.length) * rowHeight + 46;
  const savePng = async () => {
    if (!svgRef.current || exportLock.current) return;
    exportLock.current = true; setSaving(true); setError('');
    // Capture this page before waiting, so navigation cannot change the exported content.
    const markup = new XMLSerializer().serializeToString(svgRef.current);
    const filename = `shift-day${day}-${currentPage + 1}.png`;
    let sourceUrl: string | undefined;
    try {
      await document.fonts.ready;
      sourceUrl = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('画像を作成できませんでした')); image.src = sourceUrl!; });
      const canvas = document.createElement('canvas');
      canvas.width = width * 2; canvas.height = height * 2;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('このブラウザではPNGを作成できません');
      context.scale(2, 2); context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNGを作成できませんでした')), 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'PNGの保存に失敗しました'); }
    finally { if (sourceUrl) URL.revokeObjectURL(sourceUrl); exportLock.current = false; setSaving(false); }
  };

  return <section className="rounded-xl border bg-white p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">シフト表</h2>
      <button type="button" className={`${button} bg-gray-900 text-white`} disabled={saving || !visible.length} onClick={() => void savePng()}>{saving ? 'PNG作成中…' : '表示中のページをPNG保存'}</button>
    </div>
    <div className="flex flex-wrap items-center gap-2" aria-label="シフト表の日程">
      {[1, 2].map(value => <button key={value} type="button" disabled={saving} aria-pressed={day === value} className={`${button} ${day === value ? 'bg-yellow-300 border-yellow-500' : 'bg-white'}`} onClick={() => { setDay(value); setPage(0); setError(''); }}>{value}日目</button>)}
      <span className="text-sm text-gray-600">30分刻み・日本時間／色付き：勤務予定、空欄：シフトなし</span>
    </div>
    {valid.length !== shifts.length && <p className="text-sm text-amber-800">旧設定など、日程・時刻が未設定のシフトは表に含まれません。下の「登録済みシフト」から編集してください。</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {pages > 1 && <nav aria-label="シフト表のページ" className="flex items-center gap-3"><button type="button" className={button} disabled={saving || currentPage === 0} onClick={() => setPage(currentPage - 1)}>前へ</button><span aria-live="polite">{currentPage + 1} / {pages}ページ（全{rows.length}人・1ページ40人）</span><button type="button" className={button} disabled={saving || currentPage + 1 === pages} onClick={() => setPage(currentPage + 1)}>次へ</button></nav>}
    <div className="overflow-x-auto rounded-lg border" tabIndex={0} role="region" aria-label="シフト表（横にスクロールできます）">
      <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${day}日目のシフト表、${currentPage + 1}ページ`} style={{ minWidth: width, display: 'block', fontFamily: 'sans-serif' }}>
        <title>{day}日目のシフト表</title>
        <rect width={width} height={height} fill="#ffffff" />
        <text x={24} y={38} fontSize={24} fontWeight="bold" fill="#111827">シフト表 · {day}日目</text>
        <text x={24} y={65} fontSize={14} fill="#4b5563">10:00〜16:00／30分刻み・日本時間　｜　{currentPage + 1} / {pages}ページ</text>
        <rect x={24} y={84} width={width - 48} height={36} fill="#f3f4f6" />
        <text x={36} y={108} fontSize={14} fontWeight="bold" fill="#374151">ID · スタッフ</text>
        {times.map((time, i) => <text key={time} x={left + i * cell} y={108} textAnchor="middle" fontSize={12} fill="#374151">{time}</text>)}
        {visible.map((employee, index) => {
          const y = top + index * rowHeight;
          const assigned = daily.filter(s => s.personalId === employee.personalId).sort((a, b) => a.startTime!.localeCompare(b.startTime!));
          const name = Array.from(employee.name);
          const label = `${employee.personalId} · ${employee.name}`;
          return <g key={employee.personalId}>
            <title>{label}：{assigned.length ? assigned.map(s => `${s.startTime}〜${s.endTime}`).join('、') : 'シフトなし'}</title>
            <rect x={24} y={y} width={width - 48} height={rowHeight} fill={index % 2 ? '#f9fafb' : '#ffffff'} />
            <text x={36} y={y + 22} fontSize={13} fill="#4b5563">ID {employee.personalId}</text>
            <text x={36} y={y + 43} fontSize={15} fontWeight="bold" fill="#111827">{name.length > 16 ? name.slice(0, 15).join('') + '…' : employee.name}</text>
            {times.map((time, i) => <line key={time} x1={left + i * cell} x2={left + i * cell} y1={y} y2={y + rowHeight} stroke={i % 2 ? '#e5e7eb' : '#cbd5e1'} />)}
            {assigned.map(s => {
              const x = left + slot(s.startTime!) * cell;
              const barWidth = (slot(s.endTime!) - slot(s.startTime!)) * cell;
              return <g key={s._id}><rect x={x + 2} y={y + 5} width={barWidth - 4} height={rowHeight - 10} rx={6} fill={day === 1 ? '#0f766e' : '#1d4ed8'} />
                {barWidth < 130 ? <text x={x + barWidth / 2} textAnchor="middle" fontSize={12} fill="#ffffff"><tspan x={x + barWidth / 2} y={y + 24}>{s.startTime}〜</tspan><tspan x={x + barWidth / 2} y={y + 40}>{s.endTime}</tspan></text> : <text x={x + barWidth / 2} y={y + 34} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#ffffff">{s.startTime}〜{s.endTime}</text>}
              </g>;
            })}
            <line x1={24} x2={width - 24} y1={y + rowHeight} y2={y + rowHeight} stroke="#e5e7eb" />
          </g>;
        })}
        {!visible.length && <text x={36} y={top + 34} fontSize={16} fill="#6b7280">スタッフが登録されていません。</text>}
        <text x={24} y={height - 16} fontSize={12} fill="#6b7280">色付き：勤務予定　／　空欄：シフトなし</text>
      </svg>
    </div>
  </section>;
}
