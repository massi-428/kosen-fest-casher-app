"use client";

import { useEffect, useRef, useState } from 'react';
import { requestJson } from '@/lib/client-api';
import { attendanceTime } from '@/lib/attendance';
import { Toast } from './Toast';

type Reminder = { _id: string; personalId: number; name: string; start: string };

export function ShiftReminder({ storeId, paused }: { storeId: string; paused: boolean }) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const seenRef = useRef(seen);
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
  const current = reminders.find(r => !seen.has(r._id) && new Date(r.start).getTime() >= Date.now());
  if (paused || !current) return null;
  return <Toast show title="まもなく出勤予定です" message={`ID ${current.personalId} · ${current.name}さん\n出勤予定 ${attendanceTime(current.start)}`} onClose={() => {
    const next = new Set(seenRef.current).add(current._id);
    seenRef.current = next; setSeen(next);
    try { sessionStorage.setItem(`shift-reminders:${storeId}`, JSON.stringify([...next].slice(-500))); } catch { /* Storage is optional. */ }
  }} />;
}
