import type { ReactNode } from 'react';

export default function AttendanceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="terminal-screen fixed inset-0 w-full h-dvh overflow-y-auto overscroll-none">
      {children}
    </div>
  );
}
