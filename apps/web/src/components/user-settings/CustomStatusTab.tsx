import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAppDispatch, fetchMe, addToast } from '../../store';
import { setActivity, getMyActivity } from '../../gateway';
import { t, localeTag } from '../../i18n';

const STATUS_DURATIONS: { label: string; seconds: number }[] = [
  { label: t('status.today'), seconds: -2 }, // sentinel: gün sonuna kadar (save'de hesaplanır)
  { label: '30 dakika', seconds: 30 * 60 },
  { label: '1 saat', seconds: 60 * 60 },
  { label: '4 saat', seconds: 4 * 60 * 60 },
  { label: '24 saat', seconds: 24 * 60 * 60 },
];

export function CustomStatusTab() {
  const dispatch = useAppDispatch();
  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [duration, setDuration] = useState(-1); // -1 = süresiz, -2 = gün sonu, >0 = saniye
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    api.me().then((u: any) => {
      setEmoji(u.custom_status_emoji ?? '');
      setText(u.custom_status_text ?? '');
      setExpiresAt(u.custom_status_expires_at ?? null);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      let secs = duration;
      if (duration === -2) {
        // Gün sonuna kadar (yerel saatle 23:59)
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        secs = Math.max(60, Math.round((end.getTime() - Date.now()) / 1000));
      }
      const clearAfter = secs > 0 ? secs : 0;
      await api.updateCustomStatus({
        custom_status_text: text,
        custom_status_emoji: emoji,
        clear_after_seconds: clearAfter,
      });
      await dispatch(fetchMe());
      setExpiresAt(clearAfter > 0 ? new Date(Date.now() + clearAfter * 1000).toISOString() : null);
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setEmoji('');
    setText('');
    setDuration(0);
    setExpiresAt(null);
    await api.updateCustomStatus({
      custom_status_text: '',
      custom_status_emoji: '',
      clear_after_seconds: 0,
    });
    await dispatch(fetchMe());
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('settings.status')}</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <p className="text-sm text-ink-secondary mb-4">
          Kullanıcı adının yanında görünecek geçici bir mesaj ayarla.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
            placeholder="😎"
            className="w-14 text-center bg-surface-1 border border-line rounded-lg px-2 py-2 text-xl"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('status.whatDoing')}
            maxLength={128}
            className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-ink-secondary mb-1.5">
            Şu kadar süre sonra temizle
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary focus:border-brand-500/50 focus:outline-none"
          >
            <option value={-1}>{t('status.indefinite')}</option>
            {STATUS_DURATIONS.map((d) => (
              <option key={d.label} value={d.seconds}>
                {d.label}
              </option>
            ))}
          </select>
          {expiresAt && (
            <p className="text-xs text-ink-tertiary mt-1.5">
              Otomatik temizlenme:{' '}
              {new Date(expiresAt).toLocaleString(localeTag(), {
                hour: '2-digit',
                minute: '2-digit',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold flex-1"
          >
            {saving ? t('common.saving') : ok ? t('common.savedCheck') : t('common.save')}
          </button>
          <button
            onClick={clear}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary font-semibold"
          >
            Temizle
          </button>
        </div>
      </div>

      <ActivitySection />
    </div>
  );
}

// Rich presence aktivitesi — "Oynuyor: X" gibi; sunuculardaki üye listesi + profilde görünür
function ActivitySection() {
  const dispatch = useAppDispatch();
  const [actType, setActType] = useState<'playing' | 'streaming' | 'listening' | 'watching'>(() =>
    (getMyActivity()?.type as any) === 'custom'
      ? 'playing'
      : ((getMyActivity()?.type as any) ?? 'playing'),
  );
  const [actName, setActName] = useState(() => getMyActivity()?.name ?? '');
  const [active, setActive] = useState(() => !!getMyActivity());

  const start = () => {
    const name = actName.trim();
    if (!name) return;
    setActivity({ type: actType, name });
    setActive(true);
    dispatch(addToast({ kind: 'success', message: t('activity.set') }));
  };
  const stop = () => {
    setActivity(null);
    setActive(false);
    setActName('');
    dispatch(addToast({ kind: 'success', message: t('activity.cleared') }));
  };

  return (
    <div className="mt-8 pt-6 border-t border-line max-w-md">
      <h3 className="text-base font-bold text-ink-primary mb-1">{t('activity.title')}</h3>
      <p className="text-sm text-ink-tertiary mb-3">
        Ne yaptığını göster — üye listesinde ve profilinde "Oynuyor: …" olarak görünür.
      </p>
      <div className="flex gap-2 mb-3">
        <select
          value={actType}
          onChange={(e) => setActType(e.target.value as any)}
          className="bg-surface-2 border border-line rounded-lg px-2 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
          aria-label={t('activity.type')}
        >
          <option value="playing">🎮 Oynuyor</option>
          <option value="streaming">{t('ui.yayinda')}</option>
          <option value="listening">🎵 Dinliyor</option>
          <option value="watching">{t('ui.izliyor')}</option>
        </select>
        <input
          value={actName}
          onChange={(e) => setActName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder={t('activity.placeholder')}
          maxLength={128}
          className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={start}
          disabled={!actName.trim()}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-semibold flex-1"
        >
          {active ? t('common.update') : t('common.start')}
        </button>
        {active && (
          <button
            onClick={stop}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-sm font-semibold"
          >
            Durdur
          </button>
        )}
      </div>
    </div>
  );
}
