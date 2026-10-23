"use client";

const times = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export function HalfHourDateTime({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [date = '', time = '09:00'] = value.split('T');
  const field = 'w-full min-w-0 border border-gray-300 rounded-xl px-3 py-3 bg-white text-gray-900';
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend>{label}</legend>
    <div className="grid grid-cols-2 gap-2">
      <input aria-label={`${label}の日付`} className={field} type="date" required value={date} onChange={e => onChange(`${e.target.value}T${time}`)} />
      <select aria-label={`${label}の時刻`} className={field} value={time} onChange={e => onChange(`${date}T${e.target.value}`)}>{times.map(t => <option key={t}>{t}</option>)}</select>
    </div>
  </fieldset>;
}
