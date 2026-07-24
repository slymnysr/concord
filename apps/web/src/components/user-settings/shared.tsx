import { useState } from 'react';

export function AudioToggle({
  storageKey,
  label,
  desc,
  defaultOn = true,
}: {
  storageKey: string;
  label: string;
  desc: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(() => {
    const v = localStorage.getItem(storageKey);
    if (v === null) return defaultOn;
    return v === '1';
  });
  function toggle() {
    const next = !on;
    setOn(next);
    localStorage.setItem(storageKey, next ? '1' : '0');
  }
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="min-w-0 pr-3">
        <div className="text-sm text-ink-primary">{label}</div>
        <div className="text-xs text-ink-tertiary">{desc}</div>
      </div>
      <button
        onClick={toggle}
        className={
          'shrink-0 w-10 h-6 rounded-full transition-colors relative ' +
          (on ? 'bg-brand-500' : 'bg-surface-3')
        }
        role="switch"
        aria-checked={on}
      >
        <span
          className={
            'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' +
            (on ? 'left-[18px]' : 'left-0.5')
          }
        />
      </button>
    </div>
  );
}
