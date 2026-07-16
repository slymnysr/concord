import { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch, fetchGuilds } from '../../store';
import { api, type APIRole } from '../../api';
import { t } from '../../i18n';

export function OverviewTab({ guildId }: { guildId: string }) {
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === guildId));
  const me = useAppSelector((s) => s.auth.user);
  const channels = useAppSelector((s) => s.channels.byGuild[guildId] ?? []);
  const dispatch = useAppDispatch();
  const [uploading, setUploading] = useState(false);
  const [pubBusy, setPubBusy] = useState(false);
  const [vanity, setVanity] = useState('');
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [roles, setRoles] = useState<APIRole[]>([]);

  useEffect(() => {
    setVanity(guild?.vanity_url_code ?? '');
  }, [guild?.vanity_url_code]);
  useEffect(() => {
    api.guilds
      .roles(guildId)
      .then(setRoles)
      .catch(() => {});
  }, [guildId]);

  const voiceChannels = channels.filter((c) => c.type === 'voice');
  const textChannels = channels.filter((c) => c.type === 'text' || c.type === 'announcement');

  async function patch(p: Parameters<typeof api.guilds.update>[1]) {
    if (!guild) return;
    await api.guilds.update(guild.id, p).catch(() => {});
    await dispatch(fetchGuilds());
  }
  async function deleteGuild() {
    if (!guild) return;
    if (!confirm(t('guild.deleteConfirm', { name: guild.name })))
      return;
    try {
      await api.guilds.deleteGuild(guild.id);
      await dispatch(fetchGuilds());
    } catch (e: any) {
      alert(e?.message || t('common.deleteFailed'));
    }
  }

  async function togglePublic(next: boolean) {
    if (!guild) return;
    setPubBusy(true);
    try {
      await api.guilds.update(guild.id, { is_public: next });
      await dispatch(fetchGuilds());
    } finally {
      setPubBusy(false);
    }
  }

  async function uploadBanner(file: File) {
    if (!guild) return;
    setUploadingBanner(true);
    try {
      const presign = await api.uploads.presign({
        filename: file.name,
        content_type: file.type || 'image/png',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      await api.guilds.update(guild.id, { banner_url: presign.public_url });
      await dispatch(fetchGuilds());
    } finally {
      setUploadingBanner(false);
    }
  }

  async function uploadIcon(file: File) {
    if (!guild) return;
    setUploading(true);
    try {
      const presign = await api.uploads.presign({
        filename: file.name,
        content_type: file.type || 'image/png',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      await api.guilds.update(guild.id, { icon_url: presign.public_url });
      location.reload();
    } finally {
      setUploading(false);
    }
  }

  if (!guild) return null;
  const iconUrl = guild.icon_url_v2;
  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">{t('guild.overview')}</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-4">
        <div className="flex items-center gap-4">
          <label
            className={
              'w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold overflow-hidden cursor-pointer ring-2 ring-transparent hover:ring-brand-500 transition-all relative ' +
              (uploading ? 'opacity-50' : '')
            }
            style={{ backgroundColor: guild.icon_color }}
          >
            {iconUrl ? (
              <img src={iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              guild.icon_text
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadIcon(f);
              }}
            />
            <span className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 text-[10px] flex items-center justify-center font-normal">
              Değiştir
            </span>
          </label>
          <div>
            <div className="text-base font-semibold text-ink-primary">{guild.name}</div>
            <div className="text-xs text-ink-tertiary">{t('guild.clickIcon')}</div>
          </div>
        </div>
        <Row label={t('guild.serverId')} value={guild.id} mono />
        <Row label={t('guild.createdAt')} value={new Date(guild.created_at).toLocaleString('tr-TR')} />
        <div className="pt-3 border-t border-line">
          <div className="text-sm font-semibold text-ink-primary mb-1.5">{t('guild.banner')}</div>
          <label
            className={
              'block w-full h-24 rounded-xl border border-dashed border-line hover:border-brand-500/60 cursor-pointer overflow-hidden relative ' +
              (uploadingBanner ? 'opacity-50' : '')
            }
            style={
              guild.banner_url ? { background: `url(${guild.banner_url}) center/cover` } : undefined
            }
          >
            {!guild.banner_url && (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-tertiary">
                Banner yüklemek için tıkla (önerilen 960×240)
              </span>
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadBanner(f);
              }}
            />
          </label>
        </div>

        <label className="flex items-center justify-between gap-3 pt-3 border-t border-line cursor-pointer">
          <span>
            <span className="block text-sm font-semibold text-ink-primary">
              Herkese Açık (Keşfet)
            </span>
            <span className="block text-xs text-ink-tertiary">
              Açıkken sunucun Keşfet sayfasında listelenir ve herkes katılabilir.
            </span>
          </span>
          <input
            type="checkbox"
            checked={guild.is_public}
            disabled={pubBusy}
            onChange={(e) => togglePublic(e.target.checked)}
            className="w-4 h-4 accent-brand-500 shrink-0"
          />
        </label>

        <div className="pt-3 border-t border-line">
          <div className="text-sm font-semibold text-ink-primary mb-1.5">
            Özel Davet Bağlantısı (vanity)
          </div>
          <div className="flex gap-2">
            <div className="flex items-center bg-surface-1 border border-line rounded-lg px-2 flex-1">
              <span className="text-ink-tertiary text-sm">concord.com/</span>
              <input
                value={vanity}
                onChange={(e) => setVanity(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder={t('guild.vanityPlaceholder')}
                className="flex-1 bg-transparent py-1.5 text-ink-primary focus:outline-none text-sm"
              />
            </div>
            <button
              onClick={() => patch({ vanity_url_code: vanity })}
              className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold"
            >
              Kaydet
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-line">
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">
            Doğrulama Seviyesi
          </label>
          <select
            value={guild.verification_level ?? 0}
            onChange={(e) => patch({ verification_level: parseInt(e.target.value, 10) })}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm"
          >
            <option value={0}>{t('verify.none')}</option>
            <option value={1}>{t('verify.low')}</option>
            <option value={2}>{t('verify.medium')}</option>
            <option value={3}>{t('verify.high')}</option>
          </select>
        </div>

        <div className="pt-3 border-t border-line">
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">
            Hassas İçerik Filtresi
          </label>
          <select
            value={(guild as any).explicit_content_filter ?? 0}
            onChange={(e) => patch({ explicit_content_filter: parseInt(e.target.value, 10) })}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm"
          >
            <option value={0}>{t('common.off')}</option>
            <option value={1}>{t('filter.scanNoRole')}</option>
            <option value={2}>{t('filter.scanAll')}</option>
          </select>
        </div>

        <div className="pt-3 border-t border-line grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              AFK Kanalı
            </label>
            <select
              value={guild.afk_channel_id ?? ''}
              onChange={(e) => patch({ afk_channel_id: e.target.value })}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm"
            >
              <option value="">{t('common.none')}</option>
              {voiceChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {guild.afk_channel_id && (
              <select
                value={guild.afk_timeout_sec ?? 300}
                onChange={(e) => patch({ afk_timeout_sec: parseInt(e.target.value, 10) } as any)}
                className="w-full mt-2 bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm"
                aria-label={t('guild.afkTimeout')}
              >
                <option value={60}>1 dakika sonra</option>
                <option value={300}>5 dakika sonra</option>
                <option value={900}>15 dakika sonra</option>
                <option value={1800}>30 dakika sonra</option>
                <option value={3600}>1 saat sonra</option>
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              Sistem Mesajları Kanalı
            </label>
            <select
              value={guild.system_channel_id ?? ''}
              onChange={(e) => patch({ system_channel_id: e.target.value })}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm"
            >
              <option value="">{t('common.none')}</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-line">
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">
            Otomatik Rol
          </label>
          <p className="text-xs text-ink-tertiary mb-1.5">
            Sunucuya yeni katılan üyelere otomatik atanacak rol.
          </p>
          <select
            value={(guild as any).auto_role_id ?? ''}
            onChange={(e) => patch({ auto_role_id: e.target.value })}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm"
          >
            <option value="">{t('common.none')}</option>
            {roles
              .filter((r) => r.name !== '@everyone')
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {guild.owner_id === me?.id && (
        <div className="mt-5 pt-4 border-t border-accent-500/30">
          <button
            onClick={deleteGuild}
            className="px-4 py-2 rounded-lg bg-accent-500/15 hover:bg-accent-500 hover:text-white text-accent-500 text-sm font-semibold"
          >
            Sunucuyu Sil
          </button>
          <p className="text-xs text-ink-tertiary mt-1.5">Bu işlem kalıcıdır ve geri alınamaz.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex">
      <span className="w-40 text-ink-tertiary">{label}</span>
      <span className={'text-ink-primary ' + (mono ? 'font-mono text-xs' : '')}>{value}</span>
    </div>
  );
}
