"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '@/lib/client-api';
import { attendanceTime } from '@/lib/attendance';
import { queueShiftReminders, type ShiftReminderEvent } from '@/lib/shift-reminders';
import { Toast } from './Toast';

type Reminder = ShiftReminderEvent;

export function ShiftReminder({ storeId, paused }: { storeId: string; paused: boolean }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Reminder[]>([]);
  const seenRef = useRef(seen);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let stopped = false;
    let running = false;
    const poll = async () => {
      if (running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        const result = await requestJson('/api/attendance?mode=reminders');
        if (!stopped) setReminders(result);
      } catch { /* A transient notification failure must not interrupt checkout. */ }
      finally { running = false; }
    };
    try { const saved = new Set<string>(JSON.parse(sessionStorage.getItem(`shift-reminders:${storeId}`) || '[]')); seenRef.current = saved; setSeen(saved); } catch { /* Storage is optional. */ }
    void poll();
    const timer = setInterval(poll, 30000);
    document.addEventListener('visibilitychange', poll);
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [storeId]);
  useEffect(() => {
    setPending(previous => queueShiftReminders(previous, reminders, seen, now));
  }, [reminders, seen, now]);
  const current = pending[0];
  const batch = current ? pending.filter(r => r.kind === current.kind && r.start === current.start).slice(0, 5) : [];
  const currentIds = JSON.stringify(batch.map(r => r._id));
  const close = useCallback(() => {
    const ids: string[] = JSON.parse(currentIds);
    if (!ids.length) return;
    const next = new Set([...seenRef.current, ...ids]);
    seenRef.current = next; setSeen(next);
    setPending(previous => previous.filter(r => !next.has(r._id)));
    try { sessionStorage.setItem(`shift-reminders:${storeId}`, JSON.stringify([...next].slice(-500))); } catch { /* Storage is optional. */ }
  }, [currentIds, storeId]);
  if (paused || !current) return null;
  const label = current.kind === 'clockOut' ? '退勤' : '出勤';
  return <Toast key={currentIds} show title={`${label}予定時刻です`} message={`${label}予定 ${attendanceTime(current.start)}\n${batch.map(r => `ID ${r.personalId} · ${r.name}さん`).join('\n')}`} onClose={close} />;
}
