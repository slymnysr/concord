import { useState } from 'react';
import { Hash, Volume2 } from 'lucide-react';
import { api, type APIChannel } from '../api';
import { useAppDispatch, useAppSelector, closeModal, fetchChannels } from '../store';
import { t, errText } from '../i18n';

interface Props {
  channel: APIChannel;
}

export function ChannelEditModal({ channel }: Props) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [nsfw, setNsfw] = useState(channel.nsfw);
  const [rateLimit, setRateLimit] = useState(channel.rate_limit_sec);
  const [userLimit, setUserLimit] = useState((channel as any).user_limit ?? 0);
  const [bitrate, setBitrate] = useState(((channel as any).bitrate ?? 64000) / 1000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!guildId) return;
    setBusy(true);
    setErr(null);
    try {
      const v = name.trim().toLowerCase().replace(/\s+/g, '-');
      await api.channels.update(channel.id, {
        name: v || channel.name,
        topic,
        nsfw,
        rate_limit_sec: rateLimit,
        ...(isVoice ? { user_limit: userLimit, bitrate: Math.round(bitrate * 1000) } : {}),
      });
      await dispatch(fetchChannels(guildId));
      dispatch(closeModal());
    } catch (e: any) {
      setErr(errText(e, t('common.updateFailed')));
    } finally {
      setBusy(false);
    }
  }

  const isVoice = channel.type === 'voice';

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-ink-primary mb-1">{t('channel.edit')}</h2>
      <p className="text-sm text-ink-secondary mb-5">#{channel.name}</p>

      <form onSubmit={submit}>
        <label className="block text-sm font-semibold text-ink-primary mb-1.5">
          {t('channel.nameLabel')}
        </label>
        <div className="relative mb-4">
          {isVoice ? (
            <Volume2
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
            />
          ) : (
            <Hash
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
            />
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-9 pr-3 py-2.5 text-ink-primary"
          />
        </div>

        {!isVoice && (
          <>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              {t('channel.topic')}
            </label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={1024}
              placeholder={t('channel.aboutPlaceholder')}
              className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary mb-4"
            />

            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              Yavaş Mod (sn)
            </label>
            <input
              type="number"
              min={0}
              max={21600}
              value={rateLimit}
              onChange={(e) => setRateLimit(Math.max(0, parseInt(e.target.value || '0', 10)))}
              className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary mb-4"
            />
            <p className="text-xs text-ink-tertiary -mt-3 mb-4">
              0 = kapalı, kullanıcılar mesaj atınca bu kadar saniye beklemek zorunda.
            </p>

            <label className="flex items-center gap-3 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={nsfw}
                onChange={(e) => setNsfw(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-ink-primary">{t('ui.18NsfwIcerik')}</span>
            </label>
          </>
        )}

        {isVoice && (
          <>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              Kullanıcı Limiti
            </label>
            <input
              type="number"
              min={0}
              max={99}
              value={userLimit}
              onChange={(e) =>
                setUserLimit(Math.min(99, Math.max(0, parseInt(e.target.value || '0', 10))))
              }
              className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary mb-1"
            />
            <p className="text-xs text-ink-tertiary mb-4">
              0 = sınırsız. Dolu kanala yalnızca "Üyeleri Taşı / Kanalları Yönet" yetkisi olanlar
              girebilir.
            </p>

            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              Ses Kalitesi (bitrate) — {bitrate} kbps
            </label>
            <input
              type="range"
              min={8}
              max={128}
              step={4}
              value={bitrate}
              onChange={(e) => setBitrate(parseInt(e.target.value, 10))}
              className="w-full accent-brand-500 mb-1"
              aria-label={t('channel.bitrate')}
            />
            <p className="text-xs text-ink-tertiary mb-4">
              Yüksek değer daha iyi ses, daha çok bant genişliği. Varsayılan 64 kbps.
            </p>
          </>
        )}

        {err && <p className="text-accent-500 text-sm mb-3">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => dispatch(closeModal())}
            className="flex-1 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-ink-primary font-semibold"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold"
          >
            {busy ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}
