"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { requestJson } from '@/lib/client-api';
import { attendanceTime, isShiftDue } from '@/lib/attendance';
import { Toast } from './Toast';

type Reminder = { _id: string; personalId: number; name: string; start: string };

export function ShiftReminder({ storeId, paused }: { storeId: string; paused: boolean }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
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
  const current = reminders.find(r => !seen.has(r._id) && isShiftDue(r.start, now));
  const currentId = current?._id;
  const close = useCallback(() => {
    if (!currentId) return;
    const next = new Set(seenRef.current).add(currentId);
    seenRef.current = next; setSeen(next);
    try { sessionStorage.setItem(`shift-reminders:${storeId}`, JSON.stringify([...next].slice(-500))); } catch { /* Storage is optional. */ }
  }, [currentId, storeId]);
  if (paused || !current) return null;
  return <Toast key={current._id} show title="出勤予定時刻です" message={`ID ${current.personalId} · ${current.name}さん\n出勤予定 ${attendanceTime(current.start)}`} onClose={close} />;
}
