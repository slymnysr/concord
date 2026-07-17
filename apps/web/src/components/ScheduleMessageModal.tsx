import { useEffect, useState } from 'react';
import { X, Clock, Trash2 } from 'lucide-react';
import { api, type APIScheduledMessage } from '../api';
import { t, errText, localeTag } from '../i18n';

interface Props {
  channelId: string;
  initialContent?: string;
  onClose: () => void;
  onScheduled?: () => void;
}

// Hızlı süre seçenekleri (dakika)
const QUICK: { label: string; mins: number }[] = [
  { label: '10 dakika', mins: 10 },
  { label: '1 saat', mins: 60 },
  { label: '3 saat', mins: 180 },
  { label: t('date.tomorrow'), mins: 60 * 24 },
];

function toLocalInput(d: Date): string {
  // datetime-local için yerel saat formatı (YYYY-MM-DDTHH:mm)
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleMessageModal({ channelId, initialContent, onClose, onScheduled }: Props) {
  const [content, setContent] = useState(initialContent?.trim() ?? '');
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [existing, setExisting] = useState<APIScheduledMessage[]>([]);

  function loadExisting() {
    api.scheduledMessages
      .list(channelId)
      .then(setExisting)
      .catch(() => {});
  }
  useEffect(loadExisting, [channelId]);

  function setQuick(mins: number) {
    setWhen(toLocalInput(new Date(Date.now() + mins * 60 * 1000)));
  }

  async function schedule() {
    if (!content.trim() || busy) return;
    const dt = new Date(when);
    if (isNaN(dt.getTime()) || dt.getTime() < Date.now() + 10000) {
      setErr('Geçerli bir gelecek zaman seç (en az 10 sn sonrası)');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.scheduledMessages.create(channelId, content.trim(), dt.toISOString());
      setContent('');
      loadExisting();
      onScheduled?.();
    } catch (e: any) {
      setErr(errText(e, t('sched.failed')));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id: string) {
    await api.scheduledMessages.delete(id).catch(() => {});
    setExisting((arr) => arr.filter((m) => m.id !== id));
  }

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface-1 border border-line rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink-primary flex items-center gap-2">
            <Clock size={18} className="text-brand-500" /> Mesaj Zamanla
          </h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={4000}
            rows={3}
            placeholder={t('sched.msgPlaceholder')}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary resize-none"
          />

          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">
              {t('sched.when')}
            </label>
            <div className="flex flex-wrap gap-1.5 mt-1.5 mb-2">
              {QUICK.map((q) => (
                <button
                  key={q.mins}
                  onClick={() => setQuick(q.mins)}
                  className="px-2.5 py-1 rounded-full bg-surface-2 hover:bg-surface-3 text-xs text-ink-secondary hover:text-ink-primary border border-line"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
            />
          </div>

          {err && <p className="text-accent-500 text-sm">{err}</p>}

          {existing.length > 0 && (
            <div>
              <label className="text-xs font-semibold uppercase text-ink-tertiary">
                {t('sched.inChannel')}
              </label>
              <ul className="mt-1.5 space-y-1">
                {existing.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-2 bg-surface-2 rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="flex-1 min-w-0 truncate text-ink-secondary">{m.content}</span>
                    <span className="text-[11px] text-ink-tertiary shrink-0">
                      {new Date(m.scheduled_for).toLocaleString(localeTag(), {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      onClick={() => cancel(m.id)}
                      className="text-ink-tertiary hover:text-accent-500 shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-ink-secondary hover:text-ink-primary text-sm"
          >
            Kapat
          </button>
          <button
            onClick={schedule}
            disabled={!content.trim() || busy}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {busy ? t('sched.scheduling') : t('sched.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
