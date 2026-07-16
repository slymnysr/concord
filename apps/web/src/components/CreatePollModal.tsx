import { useState } from 'react';
import { X, Plus, Trash2, BarChart3 } from 'lucide-react';
import { api } from '../api';
import { useAppDispatch } from '../store';
import { t } from '../i18n';

interface Props {
  channelId: string;
  onClose: () => void;
}

const DURATIONS: { label: string; hours: number }[] = [
  { label: t('poll.unlimited'), hours: 0 },
  { label: '1 saat', hours: 1 },
  { label: '6 saat', hours: 6 },
  { label: '1 gün', hours: 24 },
  { label: '3 gün', hours: 72 },
  { label: '1 hafta', hours: 168 },
];

export function CreatePollModal({ channelId, onClose }: Props) {
  const dispatch = useAppDispatch();
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [anon, setAnon] = useState(false);
  const [duration, setDuration] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const valid = question.trim().length > 0 && answers.filter((a) => a.trim()).length >= 2;

  function setAnswer(i: number, v: string) {
    setAnswers((arr) => arr.map((a, idx) => (idx === i ? v : a)));
  }
  function addAnswer() {
    if (answers.length < 10) setAnswers((arr) => [...arr, '']);
  }
  function removeAnswer(i: number) {
    if (answers.length > 2) setAnswers((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function create() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const msg = await api.polls.create(channelId, {
        question: question.trim(),
        answers: answers.filter((a) => a.trim()).map((a) => ({ text: a.trim() })),
        allow_multiselect: multi,
        anonymous: anon,
        duration_hours: duration,
      });
      // Optimistik: mesajı store'a ekle (gateway de yayar)
      dispatch({
        type: 'messages/send/fulfilled',
        payload: msg,
        meta: { arg: { channelId, content: '' } },
      });
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? t('poll.createFailed'));
    } finally {
      setBusy(false);
    }
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
            <BarChart3 size={18} className="text-brand-500" /> Anket Oluştur
          </h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">
              {t('poll.question')}
            </label>
            <input
              autoFocus
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder={t('poll.questionPlaceholder')}
              className="w-full mt-1 bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary"
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">
              {t('poll.answers')}
            </label>
            <div className="space-y-2 mt-1">
              {answers.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={a}
                    onChange={(e) => setAnswer(i, e.target.value)}
                    maxLength={80}
                    placeholder={`Cevap ${i + 1}`}
                    className="flex-1 bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary"
                  />
                  {answers.length > 2 && (
                    <button
                      onClick={() => removeAnswer(i)}
                      className="text-ink-tertiary hover:text-accent-500 shrink-0"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {answers.length < 10 && (
              <button
                onClick={addAnswer}
                className="mt-2 flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-400 font-medium"
              >
                <Plus size={15} /> Cevap ekle
              </button>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm text-ink-secondary">{t('poll.duration')}</label>
            <select
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10))}
              className="bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm text-ink-primary"
            >
              {DURATIONS.map((d) => (
                <option key={d.hours} value={d.hours}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={multi}
              onChange={(e) => setMulti(e.target.checked)}
              className="accent-brand-500"
            />
            Birden fazla cevaba izin ver
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={anon}
              onChange={(e) => setAnon(e.target.checked)}
              className="accent-brand-500"
            />
            Anonim oylama (kimin oy verdiği gizli)
          </label>

          {err && <p className="text-accent-500 text-sm">{err}</p>}
        </div>

        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-ink-secondary hover:text-ink-primary text-sm"
          >
            İptal
          </button>
          <button
            onClick={create}
            disabled={!valid || busy}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold"
          >
            {busy ? t('common.creating') : t('poll.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
