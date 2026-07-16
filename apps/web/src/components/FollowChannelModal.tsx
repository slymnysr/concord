import { useEffect, useState } from 'react';
import { Hash, Megaphone, Check } from 'lucide-react';
import { api, type APIChannel } from '../api';
import { useAppDispatch, useAppSelector, closeModal, addToast } from '../store';
import { t } from '../i18n';

// Duyuru kanalını takip et: kendi sunucularından birinin metin kanalını seç,
// kaynakta "Yayınla"nan mesajlar oraya otomatik iletilir.
export function FollowChannelModal() {
  const dispatch = useAppDispatch();
  const guilds = useAppSelector((s) => s.guilds.list);
  const sourceChannelId = useAppSelector((s) => s.channels.selectedId);
  const sourceGuildId = useAppSelector((s) => s.guilds.selectedId);
  const sourceChannel = useAppSelector((s) =>
    sourceGuildId && sourceChannelId
      ? s.channels.byGuild[sourceGuildId]?.find((c) => c.id === sourceChannelId)
      : null,
  );

  const [targetGuildId, setTargetGuildId] = useState<string>('');
  const [channels, setChannels] = useState<APIChannel[]>([]);
  const [targetChannelId, setTargetChannelId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChannels([]);
    setTargetChannelId('');
    if (!targetGuildId) return;
    let cancelled = false;
    api.guilds
      .channels(targetGuildId)
      .then((list) => {
        if (cancelled) return;
        setChannels(
          list.filter(
            (c) => (c.type === 'text' || c.type === 'announcement') && c.id !== sourceChannelId,
          ),
        );
      })
      .catch(() => setChannels([]));
    return () => {
      cancelled = true;
    };
  }, [targetGuildId, sourceChannelId]);

  const follow = () => {
    if (!sourceChannelId || !targetChannelId || busy) return;
    setBusy(true);
    api.follows
      .follow(sourceChannelId, targetChannelId)
      .then(() => {
        dispatch(
          addToast({
            kind: 'success',
            message: 'Kanal takip edildi — yayınlanan duyurular oraya iletilecek',
          }),
        );
        dispatch(closeModal());
      })
      .catch((e: any) => {
        dispatch(addToast({ kind: 'error', message: e?.message || t('follow.failed') }));
        setBusy(false);
      });
  };

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={20} className="text-brand-400" />
        <h2 className="text-lg font-bold text-ink-primary">{t('follow.title')}</h2>
      </div>
      <p className="text-sm text-ink-tertiary mb-4">
        <span className="font-semibold text-ink-secondary">#{sourceChannel?.name}</span> kanalında
        yayınlanan duyurular, seçtiğin kanala otomatik iletilir.
      </p>

      <label className="block text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-1.5">
        Sunucu
      </label>
      <select
        value={targetGuildId}
        onChange={(e) => setTargetGuildId(e.target.value)}
        className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary outline-none focus:border-brand-500/50 mb-4"
        aria-label={t('follow.pickGuild')}
      >
        <option value="">{t('follow.selectGuild')}</option>
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {targetGuildId && (
        <>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-tertiary mb-1.5">
            Kanal
          </label>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-line divide-y divide-line mb-4">
            {channels.length === 0 && (
              <div className="px-3 py-2.5 text-sm text-ink-tertiary">
                {t('follow.noTextChannel')}
              </div>
            )}
            {channels.map((c) => (
              <button
                key={c.id}
                onClick={() => setTargetChannelId(c.id)}
                className={
                  'w-full px-3 py-2 flex items-center gap-2 text-sm text-left transition-colors ' +
                  (targetChannelId === c.id
                    ? 'bg-brand-500/15 text-brand-400'
                    : 'text-ink-secondary hover:bg-surface-2')
                }
              >
                <Hash size={14} className="shrink-0" />
                <span className="truncate flex-1">{c.name}</span>
                {targetChannelId === c.id && <Check size={14} className="shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}

      <button
        onClick={follow}
        disabled={!targetChannelId || busy}
        className="w-full h-10 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-colors"
      >
        {busy ? t('follow.following') : t('channel.followBtn')}
      </button>
    </div>
  );
}
