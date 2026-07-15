import { useEffect, useRef, useState } from 'react';
import { Settings, Shield, Ban, Trash2, Plus, Check, Calendar, Volume2, Play, X, Smile, Sticker, Slash, Link2, Hand, ScrollText, ShieldAlert, Search, BarChart2, Megaphone } from 'lucide-react';
import { useAppSelector, useAppDispatch, fetchGuilds } from '../store';
import { api, type APIRole, type APIBan, type APIMember, type APIChannel, type APIReactionRole, type APIGuildWelcome, type APIAutomodRule, type APIOnboardingPrompt, type APIOnboardingOption } from '../api';
import { PERM, PERM_LABELS, has, toggle } from '../perms';

type Tab = 'overview' | 'insights' | 'roles' | 'members' | 'bans' | 'events' | 'soundboard' | 'emojis' | 'stickers' | 'commands' | 'reaction-roles' | 'welcome' | 'automod' | 'audit' | 'invites' | 'follows';

export function ServerSettingsModal() {
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === s.guilds.selectedId));
  const [tab, setTab] = useState<Tab>('overview');

  if (!guild) return null;

  return (
    <div className="flex max-h-[80vh]" style={{ minHeight: '500px' }}>
      <nav className="w-48 max-md:w-14 bg-surface-2 border-r border-line p-2 md:p-3 space-y-1 overflow-y-auto rounded-l-2xl max-md:rounded-none shrink-0">
        <div className="text-xs font-bold uppercase text-ink-tertiary px-2 py-2">
          {guild.name}
        </div>
        <TabBtn icon={<Settings size={16} />} active={tab === 'overview'} onClick={() => setTab('overview')}>
          Genel
        </TabBtn>
        <TabBtn icon={<Shield size={16} />} active={tab === 'roles'} onClick={() => setTab('roles')}>
          Roller
        </TabBtn>
        <TabBtn icon={<Plus size={16} />} active={tab === 'members'} onClick={() => setTab('members')}>
          Üyeler
        </TabBtn>
        <TabBtn icon={<Ban size={16} />} active={tab === 'bans'} onClick={() => setTab('bans')}>
          Banlanmış
        </TabBtn>
        <TabBtn icon={<Calendar size={16} />} active={tab === 'events'} onClick={() => setTab('events')}>
          Etkinlikler
        </TabBtn>
        <TabBtn icon={<Volume2 size={16} />} active={tab === 'soundboard'} onClick={() => setTab('soundboard')}>
          Soundboard
        </TabBtn>
        <TabBtn icon={<Smile size={16} />} active={tab === 'emojis'} onClick={() => setTab('emojis')}>
          Emojiler
        </TabBtn>
        <TabBtn icon={<Sticker size={16} />} active={tab === 'stickers'} onClick={() => setTab('stickers')}>
          Etiketler
        </TabBtn>
        <TabBtn icon={<Slash size={16} />} active={tab === 'commands'} onClick={() => setTab('commands')}>
          Slash Komutları
        </TabBtn>
        <TabBtn icon={<Link2 size={16} />} active={tab === 'reaction-roles'} onClick={() => setTab('reaction-roles')}>
          Tepki Rolleri
        </TabBtn>
        <TabBtn icon={<Hand size={16} />} active={tab === 'welcome'} onClick={() => setTab('welcome')}>
          Karşılama
        </TabBtn>
        <TabBtn icon={<ShieldAlert size={16} />} active={tab === 'automod'} onClick={() => setTab('automod')}>
          Otomatik Moderasyon
        </TabBtn>
        <TabBtn icon={<BarChart2 size={16} />} active={tab === 'insights'} onClick={() => setTab('insights')}>
          İstatistikler
        </TabBtn>
        <TabBtn icon={<ScrollText size={16} />} active={tab === 'audit'} onClick={() => setTab('audit')}>
          Denetim Günlüğü
        </TabBtn>
        <TabBtn icon={<Link2 size={16} />} active={tab === 'invites'} onClick={() => setTab('invites')}>
          Davetler
        </TabBtn>
        <TabBtn icon={<Megaphone size={16} />} active={tab === 'follows'} onClick={() => setTab('follows')}>
          Takip Edilenler
        </TabBtn>
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab guildId={guild.id} />}
        {tab === 'insights' && <InsightsTab guildId={guild.id} />}
        {tab === 'roles' && <RolesTab guildId={guild.id} />}
        {tab === 'members' && <MembersTab guildId={guild.id} />}
        {tab === 'bans' && <BansTab guildId={guild.id} />}
        {tab === 'events' && <EventsTab guildId={guild.id} />}
        {tab === 'soundboard' && <SoundboardTab guildId={guild.id} />}
        {tab === 'emojis' && <EmojisTab guildId={guild.id} />}
        {tab === 'stickers' && <StickersTab guildId={guild.id} />}
        {tab === 'commands' && <CommandsTab guildId={guild.id} />}
        {tab === 'reaction-roles' && <ReactionRolesTab guildId={guild.id} />}
        {tab === 'welcome' && <WelcomeTab guildId={guild.id} />}
        {tab === 'automod' && <AutomodTab guildId={guild.id} />}
        {tab === 'audit' && <AuditTab guildId={guild.id} />}
        {tab === 'invites' && <GuildInvitesTab guildId={guild.id} />}
        {tab === 'follows' && <FollowsTab guildId={guild.id} />}
      </div>
    </div>
  );
}

function TabBtn({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ' +
        (active ? 'bg-brand-500/15 text-brand-500' : 'text-ink-secondary hover:bg-surface-3 hover:text-ink-primary')
      }
    >
      {icon}
      <span className="max-md:hidden truncate">{children}</span>
    </button>
  );
}

function OverviewTab({ guildId }: { guildId: string }) {
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
    api.guilds.roles(guildId).then(setRoles).catch(() => {});
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
    if (!confirm(`"${guild.name}" sunucusu KALICI olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await api.guilds.deleteGuild(guild.id);
      await dispatch(fetchGuilds());
    } catch (e: any) {
      alert(e?.message || 'Silinemedi');
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
      <h2 className="text-2xl font-bold text-ink-primary mb-4">Genel Bilgi</h2>
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
            <div className="text-xs text-ink-tertiary">İkona tıkla → resim seç</div>
          </div>
        </div>
        <Row label="Sunucu ID" value={guild.id} mono />
        <Row label="Oluşturulma" value={new Date(guild.created_at).toLocaleString('tr-TR')} />
        <div className="pt-3 border-t border-line">
          <div className="text-sm font-semibold text-ink-primary mb-1.5">Sunucu Banner'ı</div>
          <label
            className={
              'block w-full h-24 rounded-xl border border-dashed border-line hover:border-brand-500/60 cursor-pointer overflow-hidden relative ' +
              (uploadingBanner ? 'opacity-50' : '')
            }
            style={
              guild.banner_url
                ? { background: `url(${guild.banner_url}) center/cover` }
                : undefined
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
            <span className="block text-sm font-semibold text-ink-primary">Herkese Açık (Keşfet)</span>
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
          <div className="text-sm font-semibold text-ink-primary mb-1.5">Özel Davet Bağlantısı (vanity)</div>
          <div className="flex gap-2">
            <div className="flex items-center bg-surface-1 border border-line rounded-lg px-2 flex-1">
              <span className="text-ink-tertiary text-sm">concord.com/</span>
              <input
                value={vanity}
                onChange={(e) => setVanity(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="ozel-link"
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
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">Doğrulama Seviyesi</label>
          <select
            value={guild.verification_level ?? 0}
            onChange={(e) => patch({ verification_level: parseInt(e.target.value, 10) })}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm"
          >
            <option value={0}>Yok — kısıtlama yok</option>
            <option value={1}>Düşük — doğrulanmış e-posta</option>
            <option value={2}>Orta — 5 dk üyelik</option>
            <option value={3}>Yüksek — 10 dk üyelik</option>
          </select>
        </div>

        <div className="pt-3 border-t border-line">
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">Hassas İçerik Filtresi</label>
          <select
            value={(guild as any).explicit_content_filter ?? 0}
            onChange={(e) => patch({ explicit_content_filter: parseInt(e.target.value, 10) })}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm"
          >
            <option value={0}>Kapalı</option>
            <option value={1}>Rolsüz üyeleri tara</option>
            <option value={2}>Herkesi tara</option>
          </select>
        </div>

        <div className="pt-3 border-t border-line grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">AFK Kanalı</label>
            <select
              value={guild.afk_channel_id ?? ''}
              onChange={(e) => patch({ afk_channel_id: e.target.value })}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm"
            >
              <option value="">Yok</option>
              {voiceChannels.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {guild.afk_channel_id && (
              <select
                value={guild.afk_timeout_sec ?? 300}
                onChange={(e) => patch({ afk_timeout_sec: parseInt(e.target.value, 10) } as any)}
                className="w-full mt-2 bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm"
                aria-label="AFK süresi"
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
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">Sistem Mesajları Kanalı</label>
            <select
              value={guild.system_channel_id ?? ''}
              onChange={(e) => patch({ system_channel_id: e.target.value })}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm"
            >
              <option value="">Yok</option>
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-line">
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">Otomatik Rol</label>
          <p className="text-xs text-ink-tertiary mb-1.5">Sunucuya yeni katılan üyelere otomatik atanacak rol.</p>
          <select
            value={(guild as any).auto_role_id ?? ''}
            onChange={(e) => patch({ auto_role_id: e.target.value })}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm"
          >
            <option value="">Yok</option>
            {roles
              .filter((r) => r.name !== '@everyone')
              .map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
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

function RolesTab({ guildId }: { guildId: string }) {
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const members = useAppSelector((s) => s.members.byGuild[guildId] ?? []);
  const roleCount = (roleId: string) => members.filter((m) => m.role_ids?.includes(roleId)).length;

  async function refresh() {
    const list = await api.guilds.roles(guildId).catch(() => []);
    setRoles(list);
    if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, [guildId]);

  const selected = roles.find((r) => r.id === selectedId);

  async function createRole() {
    const name = prompt('Yeni rolün adı?');
    if (!name?.trim()) return;
    const r = await api.guilds.createRole(guildId, { name: name.trim(), permissions: '0' });
    await refresh();
    setSelectedId(r.id);
  }

  async function updateSelected(patch: Partial<APIRole>) {
    if (!selected) return;
    const updated = await api.guilds.updateRole(guildId, selected.id, {
      name: patch.name ?? selected.name,
      color: patch.color ?? selected.color,
      permissions: patch.permissions ?? selected.permissions,
      hoist: patch.hoist ?? selected.hoist,
      mentionable: patch.mentionable ?? selected.mentionable,
      icon: patch.icon !== undefined ? patch.icon : selected.icon,
    });
    setRoles((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function remove() {
    if (!selected || selected.is_everyone) return;
    if (!confirm(`"${selected.name}" rolünü silmek istiyor musun?`)) return;
    await api.guilds.deleteRole(guildId, selected.id);
    setSelectedId(null);
    refresh();
  }

  // Rolü yukarı/aşağı taşı. Liste position DESC sıralı; tüm rolleri yeniden numaralandırıp
  // (üst = en yüksek position) kaydeder — başlangıçta pozisyonlar eşit (0) olsa bile çalışır.
  async function moveRole(index: number, dir: -1 | 1) {
    const a = roles[index];
    const b = roles[index + dir];
    if (!a || !b || a.is_everyone || b.is_everyone) return;
    const next = [...roles];
    next[index] = b;
    next[index + dir] = a;
    setRoles(next); // iyimser
    const nonEveryone = next.filter((r) => !r.is_everyone);
    try {
      await Promise.all(
        nonEveryone.map((r, i) =>
          api.guilds.updateRole(guildId, r.id, { position: nonEveryone.length - i }),
        ),
      );
      await refresh();
    } catch {
      await refresh();
    }
  }

  if (loading) return <p className="text-ink-tertiary">Yükleniyor...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Roller</h2>
        <button
          onClick={createRole}
          className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          <Plus size={14} /> Yeni Rol
        </button>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-4">
        <ul className="space-y-1">
          {roles.map((r, i) => (
            <li key={r.id} className="group flex items-center gap-0.5">
              <button
                onClick={() => setSelectedId(r.id)}
                className={
                  'flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ' +
                  (r.id === selectedId ? 'bg-brand-500/15 text-brand-500' : 'hover:bg-surface-2 text-ink-secondary')
                }
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : '#6B7280' }}
                />
                <span className="truncate flex-1">{r.name}</span>
                {!r.is_everyone && <span className="text-[10px] text-ink-tertiary shrink-0">{roleCount(r.id)}</span>}
              </button>
              {!r.is_everyone && (
                <span className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveRole(i, -1)}
                    disabled={i === 0 || roles[i - 1]?.is_everyone}
                    title="Yukarı taşı" aria-label="Yukarı taşı"
                    className="text-ink-tertiary hover:text-ink-primary disabled:opacity-30 leading-none text-[10px]"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveRole(i, 1)}
                    disabled={i >= roles.length - 1 || roles[i + 1]?.is_everyone}
                    title="Aşağı taşı" aria-label="Aşağı taşı"
                    className="text-ink-tertiary hover:text-ink-primary disabled:opacity-30 leading-none text-[10px]"
                  >
                    ▼
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {selected && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">Ad</label>
              <input
                value={selected.name}
                disabled={selected.is_everyone}
                onChange={(e) =>
                  setRoles((rs) => rs.map((r) => (r.id === selected.id ? { ...r, name: e.target.value } : r)))
                }
                onBlur={(e) => updateSelected({ name: e.target.value })}
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none disabled:opacity-60"
              />
            </div>

            {!selected.is_everyone && (
              <div>
                <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">Rol İkonu</label>
                <div className="flex items-center gap-2">
                  <input
                    value={selected.icon ?? ''}
                    placeholder="Emoji (ör. 👑) veya görsel URL"
                    onChange={(e) =>
                      setRoles((rs) => rs.map((r) => (r.id === selected.id ? { ...r, icon: e.target.value } : r)))
                    }
                    onBlur={(e) => updateSelected({ icon: e.target.value })}
                    className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
                  />
                  {selected.icon && (selected.icon.startsWith('http')
                    ? <img src={selected.icon} alt="" className="w-6 h-6 object-contain" />
                    : <span className="text-xl">{selected.icon}</span>)}
                </div>
                <p className="text-[11px] text-ink-tertiary mt-1">Üye adlarının yanında görünür.</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase text-ink-secondary mb-2">İzinler</label>
              <div className="grid grid-cols-2 gap-2 bg-surface-2 rounded-xl border border-line p-3 max-h-96 overflow-y-auto">
                {Object.entries(PERM).map(([key, bit]) => {
                  const checked = has(selected.permissions, bit);
                  return (
                    <label key={key} className="flex items-center gap-2 cursor-pointer hover:bg-surface-3 rounded px-2 py-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => updateSelected({ permissions: toggle(selected.permissions, bit) })}
                        className="rounded accent-brand-500"
                      />
                      <span className="text-sm text-ink-primary">{PERM_LABELS[key] ?? key}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {!selected.is_everyone && (
              <button
                onClick={remove}
                className="bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Rolü Sil
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MembersTab({ guildId }: { guildId: string }) {
  const [members, setMembers] = useState<APIMember[]>([]);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const me = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === guildId));
  const iAmOwner = guild?.owner_id === me?.id;

  useEffect(() => {
    Promise.all([api.guilds.members(guildId), api.guilds.roles(guildId)]).then(([m, r]) => {
      setMembers(m);
      setRoles(r);
    });
  }, [guildId]);

  async function kick(m: APIMember) {
    if (!confirm(`${m.display_name} kullanıcısını sunucudan atmak istiyor musun?`)) return;
    await api.guilds.kick(guildId, m.user_id);
    setMembers((ms) => ms.filter((x) => x.user_id !== m.user_id));
  }
  async function ban(m: APIMember) {
    const reason = prompt(`${m.display_name} için ban sebebi (boş bırakılabilir):`);
    if (reason === null) return;
    await api.guilds.ban(guildId, m.user_id, reason);
    setMembers((ms) => ms.filter((x) => x.user_id !== m.user_id));
  }
  async function timeoutMember(m: APIMember) {
    const mins = prompt('Timeout süresi (dakika)?', '10');
    if (!mins) return;
    const sec = parseInt(mins, 10) * 60;
    if (!sec) return;
    await api.guilds.timeout(guildId, m.user_id, sec);
  }
  async function transferOwnership(m: APIMember) {
    if (!confirm(`Sunucu sahipliği ${m.display_name} kullanıcısına devredilsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await api.guilds.update(guildId, { owner_id: m.user_id });
      await dispatch(fetchGuilds());
    } catch (e: any) {
      alert(e?.message || 'Devredilemedi');
    }
  }

  async function toggleRole(m: APIMember, roleId: string) {
    const has = m.role_ids?.includes(roleId);
    try {
      if (has) {
        await api.guilds.unassignRole(guildId, m.user_id, roleId);
        setMembers((ms) =>
          ms.map((x) =>
            x.user_id === m.user_id ? { ...x, role_ids: x.role_ids.filter((r) => r !== roleId) } : x,
          ),
        );
      } else {
        await api.guilds.assignRole(guildId, m.user_id, roleId);
        setMembers((ms) =>
          ms.map((x) =>
            x.user_id === m.user_id ? { ...x, role_ids: [...(x.role_ids ?? []), roleId] } : x,
          ),
        );
      }
    } catch (e) {
      console.warn('toggle role', e);
    }
  }

  const [mq, setMq] = useState('');
  const shownMembers = mq.trim()
    ? members.filter(
        (m) =>
          (m.nickname ?? '').toLowerCase().includes(mq.toLowerCase()) ||
          m.display_name.toLowerCase().includes(mq.toLowerCase()) ||
          m.username.toLowerCase().includes(mq.toLowerCase()),
      )
    : members;

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-3">Üyeler ({members.length})</h2>
      <input
        value={mq}
        onChange={(e) => setMq(e.target.value)}
        placeholder="Üye ara..."
        className="w-full mb-3 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-brand-500/50"
      />
      <div className="bg-surface-2 rounded-xl border border-line divide-y divide-line">
        {shownMembers.map((m) => {
          const isOwner = guild?.owner_id === m.user_id;
          const isMe = me?.id === m.user_id;
          return (
            <div key={m.user_id} className="flex items-center gap-3 p-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: m.avatar_color }}
              >
                {m.display_name.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-ink-primary font-semibold truncate flex items-center gap-2 flex-wrap">
                  {m.display_name}
                  {isOwner && (
                    <span className="bg-yellow-500/20 text-yellow-400 text-[10px] px-1.5 rounded">SAHİP</span>
                  )}
                  {m.role_ids?.map((rid) => {
                    const r = roles.find((x) => x.id === rid);
                    if (!r || r.is_everyone) return null;
                    return (
                      <span
                        key={rid}
                        className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1"
                        style={{
                          backgroundColor: `#${r.color.toString(16).padStart(6, '0')}20`,
                          color: `#${r.color.toString(16).padStart(6, '0')}`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: `#${r.color.toString(16).padStart(6, '0')}` }}
                        />
                        {r.name}
                      </span>
                    );
                  })}
                </div>
                <div className="text-xs text-ink-tertiary truncate">@{m.username}</div>
              </div>
              {!isOwner && (
                <RoleAssignDropdown member={m} roles={roles} onToggle={(rid) => toggleRole(m, rid)} />
              )}
              {!isOwner && !isMe && (
                <div className="flex gap-1">
                  {iAmOwner && (
                    <button
                      onClick={() => transferOwnership(m)}
                      className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-yellow-500/20 hover:text-yellow-400 text-ink-secondary"
                      title="Sunucu sahipliğini devret" aria-label="Sunucu sahipliğini devret"
                    >
                      Sahip Yap
                    </button>
                  )}
                  <button
                    onClick={() => timeoutMember(m)}
                    className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-yellow-500/20 hover:text-yellow-400 text-ink-secondary"
                  >
                    Timeout
                  </button>
                  <button
                    onClick={() => kick(m)}
                    className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-orange-500/20 hover:text-orange-400 text-ink-secondary"
                  >
                    Kick
                  </button>
                  <button
                    onClick={() => ban(m)}
                    className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary"
                  >
                    Ban
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RoleAssignDropdown({
  member,
  roles,
  onToggle,
}: {
  member: APIMember;
  roles: APIRole[];
  onToggle: (roleId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const assignableRoles = roles.filter((r) => !r.is_everyone);
  if (assignableRoles.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-brand-500/20 hover:text-brand-500 text-ink-secondary"
      >
        Roller
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-surface-1 border border-line rounded-xl shadow-2xl p-1 z-30 max-h-64 overflow-y-auto">
          {assignableRoles.map((r) => {
            const has = member.role_ids?.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => onToggle(r.id)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-surface-2 text-ink-primary text-sm flex items-center gap-2"
              >
                <span
                  className={
                    'w-4 h-4 rounded border-2 flex items-center justify-center ' +
                    (has ? 'bg-brand-500 border-brand-500' : 'border-ink-tertiary')
                  }
                >
                  {has && <Check size={10} className="text-white" />}
                </span>
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: `#${r.color.toString(16).padStart(6, '0')}` }}
                />
                <span className="truncate">{r.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InsightsTab({ guildId }: { guildId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.guilds.insights>> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.guilds.insights(guildId).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [guildId]);

  if (loading) return <p className="text-ink-tertiary text-sm">Yükleniyor…</p>;
  if (!data) return <p className="text-ink-tertiary text-sm">İstatistikler alınamadı.</p>;

  const maxGrowth = Math.max(1, ...data.member_growth.map((p) => p.count));
  const maxAct = Math.max(1, ...data.message_activity.map((p) => p.count));

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-ink-primary mb-4">Sunucu İstatistikleri</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Stat label="Toplam Üye" value={data.member_count} />
        <Stat label="Yeni Üye (7g)" value={data.new_members_7d} accent />
        <Stat label="Mesaj (7g)" value={data.messages_7d} />
        <Stat label="Mesaj (30g)" value={data.messages_30d} />
      </div>

      <ChartCard title="Üye Büyümesi (son 14 gün)" aria-label="Üye Büyümesi (son 14 gün)" points={data.member_growth} max={maxGrowth} color="bg-brand-500" />
      <ChartCard title="Mesaj Aktivitesi (son 14 gün)" aria-label="Mesaj Aktivitesi (son 14 gün)" points={data.message_activity} max={maxAct} color="bg-accent-500" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
        <TopList title="En Aktif Kanallar" aria-label="En Aktif Kanallar" items={data.top_channels} prefix="#" />
        <TopList title="En Aktif Üyeler" aria-label="En Aktif Üyeler" items={data.top_members} />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-3">
      <div className={'text-2xl font-bold ' + (accent ? 'text-brand-500' : 'text-ink-primary')}>{value.toLocaleString('tr-TR')}</div>
      <div className="text-xs text-ink-tertiary mt-0.5">{label}</div>
    </div>
  );
}

function ChartCard({ title, points, max, color }: { title: string; points: Array<{ date: string; count: number }>; max: number; color: string }) {
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4 mb-3">
      <h3 className="text-sm font-bold text-ink-primary mb-3">{title}</h3>
      <div className="flex items-end gap-1 h-24">
        {points.map((p) => (
          <div key={p.date} className="flex-1 flex flex-col items-center justify-end h-full group relative">
            <div
              className={'w-full rounded-t ' + color + ' transition-all'}
              style={{ height: `${Math.max(2, (p.count / max) * 100)}%` }}
            />
            <div className="absolute -top-5 opacity-0 group-hover:opacity-100 text-[10px] text-ink-secondary bg-surface-1 px-1 rounded pointer-events-none whitespace-nowrap">
              {p.count} · {p.date.slice(5)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({ title, items, prefix }: { title: string; items: Array<{ id: string; name: string; count: number }>; prefix?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4">
      <h3 className="text-sm font-bold text-ink-primary mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-ink-tertiary">Veri yok.</p>
      ) : (
        <div className="space-y-2">
          {items.map((i) => (
            <div key={i.id}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-ink-primary truncate">{prefix}{i.name}</span>
                <span className="text-ink-tertiary shrink-0 ml-2">{i.count}</span>
              </div>
              <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(i.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BansTab({ guildId }: { guildId: string }) {
  const [bans, setBans] = useState<APIBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function refresh() {
    const list = await api.guilds.bans(guildId).catch(() => []);
    setBans(list);
    setSelected(new Set());
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function unban(userId: string) {
    if (!confirm('Banı kaldırmak istiyor musun?')) return;
    await api.guilds.unban(guildId, userId);
    refresh();
  }
  async function bulkUnban() {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} kullanıcının banı kaldırılsın mı?`)) return;
    await Promise.all([...selected].map((id) => api.guilds.unban(guildId, id).catch(() => {})));
    refresh();
  }
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (loading) return <p className="text-ink-tertiary">Yükleniyor...</p>;

  const q = query.trim().toLowerCase();
  const filtered = q ? bans.filter((b) => b.user_id.includes(q) || (b.reason ?? '').toLowerCase().includes(q)) : bans;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Banlanmış Kullanıcılar ({bans.length})</h2>
        {selected.size > 0 && (
          <button onClick={bulkUnban} className="px-3 py-1.5 rounded-lg text-sm bg-accent-500/15 hover:bg-accent-500 hover:text-white text-accent-500 font-semibold">
            Seçilenleri kaldır ({selected.size})
          </button>
        )}
      </div>
      {bans.length > 0 && (
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Kullanıcı ID veya sebebe göre ara..."
            className="w-full bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-ink-primary"
          />
        </div>
      )}
      {bans.length === 0 && <p className="text-ink-tertiary text-sm">Banlanmış kullanıcı yok.</p>}
      {bans.length > 0 && filtered.length === 0 && <p className="text-ink-tertiary text-sm">Eşleşen ban yok.</p>}
      <ul className="space-y-2">
        {filtered.map((b) => (
          <li key={b.user_id} className="bg-surface-2 border border-line rounded-xl p-3 flex items-center gap-3">
            <input
              type="checkbox"
              checked={selected.has(b.user_id)}
              onChange={() => toggle(b.user_id)}
              className="w-4 h-4 accent-brand-500 shrink-0"
            />
            <div className="flex-1">
              <div className="text-ink-primary font-mono text-sm">{b.user_id}</div>
              {b.reason && <div className="text-xs text-ink-tertiary mt-1">Sebep: {b.reason}</div>}
              <div className="text-xs text-ink-muted mt-1">
                {new Date(b.banned_at).toLocaleString('tr-TR')}
              </div>
            </div>
            <button
              onClick={() => unban(b.user_id)}
              className="px-3 py-1.5 rounded-lg text-sm bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-secondary"
            >
              Banı Kaldır
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventsTab({ guildId }: { guildId: string }) {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof api.events.list>>>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [entityType, setEntityType] = useState<'voice' | 'stage_instance' | 'external'>('voice');
  const [channelId, setChannelId] = useState('');
  const [location, setLocation] = useState('');
  const channels = useAppSelector((s) => s.channels.byGuild[guildId] ?? []);

  async function refresh() {
    setEvents(await api.events.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    try {
      await api.events.create(guildId, {
        name,
        description: description || undefined,
        scheduled_start_at: new Date(start).toISOString(),
        scheduled_end_at: end ? new Date(end).toISOString() : undefined,
        entity_type: entityType,
        channel_id: entityType !== 'external' ? channelId || undefined : undefined,
        entity_location: entityType === 'external' ? location : undefined,
      });
      setCreating(false);
      setName('');
      setDescription('');
      setStart('');
      setEnd('');
      setLocation('');
      refresh();
    } catch (e) {
      console.warn(e);
    }
  }

  const voiceOrStage = channels.filter((c) => c.type === 'voice' || c.type === 'stage');

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Etkinlikler</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          {creating ? <X size={14} /> : <Plus size={14} />}
          {creating ? 'Vazgeç' : 'Yeni Etkinlik'}
        </button>
      </div>

      {creating && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 mb-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Etkinlik adı"
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Açıklama (isteğe bağlı)"
            rows={2}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-tertiary mb-1">Başlangıç</label>
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-tertiary mb-1">Bitiş (opsiyonel)</label>
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
              />
            </div>
          </div>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as any)}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary"
          >
            <option value="voice">Sesli Kanalda</option>
            <option value="stage_instance">Sahnede</option>
            <option value="external">Dış mekan (URL/adres)</option>
          </select>
          {entityType !== 'external' ? (
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary"
            >
              <option value="">— Kanal seç —</option>
              {voiceOrStage.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.type === 'stage' ? '🎤 ' : '🔊 '}
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="https://meet.google.com/... veya adres"
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          )}
          <button
            onClick={submit}
            disabled={!name.trim() || !start}
            className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold"
          >
            Oluştur
          </button>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz etkinlik yok.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-start gap-3"
            >
              <Calendar size={18} className="text-brand-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink-primary">{e.name}</div>
                {e.description && (
                  <div className="text-xs text-ink-secondary mt-0.5">{e.description}</div>
                )}
                <div className="text-xs text-ink-tertiary mt-1">
                  📅 {new Date(e.scheduled_start_at).toLocaleString('tr-TR')} ·{' '}
                  {e.subscriber_count} ilgilenen
                </div>
                {e.entity_location && (
                  <div className="text-xs text-ink-tertiary mt-0.5">📍 {e.entity_location}</div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() =>
                    e.subscribed
                      ? api.events.unsubscribe(e.id).then(refresh)
                      : api.events.subscribe(e.id).then(refresh)
                  }
                  className={
                    'px-2 py-1 rounded text-xs font-semibold ' +
                    (e.subscribed
                      ? 'bg-brand-500/15 text-brand-500'
                      : 'bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-secondary')
                  }
                >
                  {e.subscribed ? '✓ İlgileniyorum' : 'İlgileniyorum'}
                </button>
                <button
                  onClick={() => {
                    if (confirm('Etkinliği silmek istiyor musun?')) {
                      api.events.delete(e.id).then(refresh);
                    }
                  }}
                  className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SoundboardTab({ guildId }: { guildId: string }) {
  const [sounds, setSounds] = useState<Awaited<ReturnType<typeof api.sounds.list>>>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setSounds(await api.sounds.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    if (!file || !name.trim()) return;
    setUploading(true);
    try {
      const presign = await api.uploads.presign({
        filename: file.name,
        content_type: file.type || 'audio/mpeg',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      await api.sounds.create(guildId, {
        name: name.trim(),
        emoji: emoji || undefined,
        file_url: presign.public_url,
      });
      setName('');
      setEmoji('');
      setFile(null);
      setAdding(false);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Soundboard</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          {adding ? <X size={14} /> : <Plus size={14} />}
          {adding ? 'Vazgeç' : 'Ses Ekle'}
        </button>
      </div>

      {adding && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 mb-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ses adı (örn. 'Tada')"
            maxLength={32}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="Emoji (isteğe bağlı, örn. 🎺)"
            maxLength={4}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-ink-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-3 file:text-ink-primary file:font-semibold hover:file:bg-surface-1"
          />
          <button
            onClick={submit}
            disabled={!file || !name.trim() || uploading}
            className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
          >
            {uploading ? 'Yükleniyor...' : 'Yükle'}
          </button>
        </div>
      )}

      {sounds.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz ses yok.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sounds.map((s) => (
            <div
              key={s.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-center gap-2"
            >
              <span className="text-2xl shrink-0">{s.emoji ?? '🔊'}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-primary truncate">{s.name}</div>
                <audio src={s.file_url} controls className="w-full h-7 mt-1" />
              </div>
              <button
                onClick={() => {
                  if (confirm(`"${s.name}" sesini sil?`)) {
                    api.sounds.delete(s.id).then(refresh);
                  }
                }}
                className="text-ink-tertiary hover:text-accent-500 shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Play helper unused yet — voice kanaldayken SoundboardPlayButton kullanır
void Play;

function EmojisTab({ guildId }: { guildId: string }) {
  const [emojis, setEmojis] = useState<Awaited<ReturnType<typeof api.emojis.list>>>([]);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setEmojis(await api.emojis.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    if (!file || !name.trim()) return;
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
      await api.emojis.create(guildId, {
        name: name.trim(),
        url: presign.public_url,
        animated: file.type === 'image/gif',
      });
      setName('');
      setFile(null);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">Özel Emojiler ({emojis.length}/50)</h2>
      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-secondary mb-3">
          PNG/GIF · 128×128 önerilir · maksimum 256KB · ad 2-32 karakter (sadece a-z, 0-9, _)
        </p>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[^\w]/g, ''))}
            placeholder="emoji_adi"
            maxLength={32}
            className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            type="file"
            accept="image/png,image/gif,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-sm text-ink-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-3 file:text-ink-primary file:font-semibold"
          />
          <button
            onClick={submit}
            disabled={!file || !name.trim() || uploading}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
          >
            {uploading ? 'Yükleniyor...' : 'Ekle'}
          </button>
        </div>
      </div>

      {emojis.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz özel emoji yok.</p>
      ) : (
        <div className="grid grid-cols-6 md:grid-cols-8 gap-2">
          {emojis.map((e) => (
            <div
              key={e.id}
              className="aspect-square bg-surface-2 border border-line rounded-xl p-2 flex flex-col items-center justify-center gap-1 group relative"
            >
              <img src={e.url} alt={e.name} className="w-10 h-10 object-contain" />
              <span className="text-[10px] truncate w-full text-center text-ink-secondary">
                :{e.name}:
              </span>
              <button
                onClick={() => {
                  if (confirm(`:${e.name}: emojisini sil?`)) {
                    api.emojis.delete(guildId, e.id).then(refresh);
                  }
                }}
                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 w-5 h-5 rounded bg-accent-500 hover:bg-accent-600 text-white flex items-center justify-center transition-opacity"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StickersTab({ guildId }: { guildId: string }) {
  const [stickers, setStickers] = useState<Awaited<ReturnType<typeof api.stickers.list>>>([]);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function refresh() {
    setStickers(await api.stickers.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    if (!file || !name.trim()) return;
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
      const format = file.name.endsWith('.apng')
        ? 'apng'
        : file.name.endsWith('.json')
          ? 'lottie'
          : 'png';
      await api.stickers.create(guildId, {
        name: name.trim(),
        tags,
        url: presign.public_url,
        format,
      });
      setName('');
      setTags('');
      setFile(null);
      refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">Etiketler (Sticker)</h2>
      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4">
        <p className="text-sm text-ink-secondary mb-3">
          PNG/APNG/Lottie · 320×320 önerilir · maksimum 500KB
        </p>
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sticker adı"
            maxLength={30}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Etiketler (virgülle ayrılmış, örn: gülen, mutlu, kawaii)"
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/png,image/apng,.apng,application/json,.json"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="flex-1 text-sm text-ink-secondary file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-surface-3 file:text-ink-primary file:font-semibold"
            />
            <button
              onClick={submit}
              disabled={!file || !name.trim() || uploading}
              className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
            >
              {uploading ? 'Yükleniyor...' : 'Ekle'}
            </button>
          </div>
        </div>
      </div>

      {stickers.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz sticker yok.</p>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {stickers.map((s) => (
            <div
              key={s.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex flex-col items-center gap-2 group relative"
            >
              <img src={s.url} alt={s.name} className="w-24 h-24 object-contain" />
              <div className="text-sm font-semibold text-ink-primary truncate w-full text-center">
                {s.name}
              </div>
              {s.tags && (
                <div className="text-[10px] text-ink-tertiary truncate w-full text-center">
                  {s.tags}
                </div>
              )}
              <button
                onClick={() => {
                  if (confirm(`"${s.name}" stickerini sil?`)) {
                    api.stickers.delete(s.id).then(refresh);
                  }
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded bg-accent-500 hover:bg-accent-600 text-white flex items-center justify-center transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommandsTab({ guildId }: { guildId: string }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.commands.list>>>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [response, setResponse] = useState('');
  const [options, setOptions] = useState<Array<{ name: string; description: string; required: boolean }>>([]);

  async function refresh() {
    setList(await api.commands.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    try {
      const opts = options.filter((o) => o.name.trim()).map((o) => ({
        name: o.name.trim().toLowerCase(),
        description: o.description.trim(),
        required: o.required,
      }));
      await api.commands.create(guildId, { name, description, response, options: opts });
      setName('');
      setDescription('');
      setResponse('');
      setOptions([]);
      refresh();
    } catch (e) {
      console.warn(e);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">Slash Komutları</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Bir kanalda <span className="font-mono text-ink-primary">/komut</span> yazıldığında otomatik yanıt verir.
      </p>
      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4 space-y-2">
        <div className="flex gap-2">
          <span className="text-ink-tertiary text-sm py-2">/</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="kurallar"
            maxLength={32}
            className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary font-mono focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Kısa açıklama (en fazla 100 karakter)"
          maxLength={100}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Komut çalışınca kanala yazılacak yanıt. {argüman} ve {user} yer tutucuları desteklenir."
          rows={3}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
        />

        {/* Argümanlar (options) */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-ink-secondary">Argümanlar (yanıtta <span className="font-mono">{'{ad}'}</span> ile kullan)</span>
            {options.length < 10 && (
              <button onClick={() => setOptions((o) => [...o, { name: '', description: '', required: false }])} className="text-xs text-brand-500 hover:underline">+ Argüman</button>
            )}
          </div>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <input
                value={o.name}
                onChange={(e) => setOptions((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') } : x)))}
                placeholder="ad"
                className="w-28 bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm font-mono text-ink-primary focus:outline-none focus:border-brand-500/50"
              />
              <input
                value={o.description}
                onChange={(e) => setOptions((arr) => arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                placeholder="açıklama"
                className="flex-1 bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary focus:outline-none focus:border-brand-500/50"
              />
              <label className="flex items-center gap-1 text-[11px] text-ink-tertiary cursor-pointer shrink-0">
                <input type="checkbox" checked={o.required} onChange={(e) => setOptions((arr) => arr.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} className="accent-brand-500" />
                zorunlu
              </label>
              <button onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))} className="text-ink-tertiary hover:text-accent-500 shrink-0"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={!name.trim() || !description.trim() || !response.trim()}
          className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          Komutu Ekle
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz komut yok.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-brand-500">
                  /{c.name}
                  {(c.options ?? []).map((o) => (
                    <span key={o.name} className={'ml-1 text-[11px] ' + (o.required ? 'text-ink-secondary' : 'text-ink-tertiary')}>
                      {o.required ? `<${o.name}>` : `[${o.name}]`}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-ink-secondary mt-0.5">{c.description}</div>
                <div className="text-xs text-ink-tertiary mt-1 truncate whitespace-pre-wrap">
                  → {c.response}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`/${c.name} komutunu sil?`)) {
                    api.commands.delete(c.id).then(refresh);
                  }
                }}
                className="text-ink-tertiary hover:text-accent-500"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReactionRolesTab({ guildId }: { guildId: string }) {
  const [bindings, setBindings] = useState<APIReactionRole[]>([]);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [channels, setChannels] = useState<APIChannel[]>([]);
  const [messageId, setMessageId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [emoji, setEmoji] = useState('');
  const [roleId, setRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const [b, r, c] = await Promise.all([
      api.reactionRoles.list(guildId).catch(() => []),
      api.guilds.roles(guildId).catch(() => []),
      api.guilds.channels(guildId).catch(() => []),
    ]);
    setBindings(b);
    setRoles(r);
    setChannels(c.filter((ch) => ch.type !== 'voice'));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    setError('');
    if (!messageId.trim() || !channelId || !emoji.trim() || !roleId) {
      setError('Tüm alanları doldur.');
      return;
    }
    setSaving(true);
    try {
      await api.reactionRoles.create(guildId, {
        message_id: messageId.trim(),
        channel_id: channelId,
        emoji: emoji.trim(),
        role_id: roleId,
      });
      setMessageId('');
      setEmoji('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Eklenemedi (mesaj/rol geçerli mi?)');
    } finally {
      setSaving(false);
    }
  }

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const channelName = (id: string) => channels.find((c) => c.id === id)?.name ?? id;

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-1">Tepki Rolleri</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Bir mesaja belirli bir emoji ile tepki veren üyeye otomatik rol atanır; tepki kaldırılınca rol geri alınır.
      </p>

      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">Kanal</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            >
              <option value="">Seç...</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">Mesaj ID</label>
            <input
              value={messageId}
              onChange={(e) => setMessageId(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Mesaj ID (sağ tık → ID kopyala)"
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">Emoji</label>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="örn. 🎮 veya :ad:"
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-tertiary mb-1">Rol</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            >
              <option value="">Seç...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-accent-500">{error}</p>}
        <button
          onClick={submit}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {saving ? 'Ekleniyor...' : 'Bağlama Ekle'}
        </button>
      </div>

      {bindings.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Henüz tepki rolü bağlaması yok.</p>
      ) : (
        <ul className="space-y-2">
          {bindings.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3"
            >
              <span className="text-xl">{b.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-primary font-semibold truncate">
                  → {roleName(b.role_id)}
                </div>
                <div className="text-xs text-ink-tertiary truncate">
                  #{channelName(b.channel_id)} · mesaj {b.message_id}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Bu tepki rolü bağlamasını sil?')) {
                    api.reactionRoles.delete(b.id).then(refresh);
                  }
                }}
                className="text-ink-tertiary hover:text-accent-500"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WelcomeTab({ guildId }: { guildId: string }) {
  const [w, setW] = useState<APIGuildWelcome | null>(null);
  const [channels, setChannels] = useState<APIChannel[]>([]);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function refresh() {
    const [data, c, r] = await Promise.all([
      api.welcome.get(guildId).catch(() => null),
      api.guilds.channels(guildId).catch(() => []),
      api.guilds.roles(guildId).catch(() => [] as APIRole[]),
    ]);
    setW(data);
    setChannels(c.filter((ch) => ch.type !== 'voice'));
    setRoles(r.filter((x) => !x.is_everyone));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  if (!w) return <p className="text-ink-tertiary text-sm">Yükleniyor...</p>;

  function patch(p: Partial<APIGuildWelcome>) {
    setW((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  function addChannel() {
    patch({ welcome_channels: [...w!.welcome_channels, { channel_id: channels[0]?.id ?? '', description: '' }] });
  }
  function updateChannel(i: number, p: Partial<{ channel_id: string; description: string }>) {
    const next = w!.welcome_channels.map((wc, idx) => (idx === i ? { ...wc, ...p } : wc));
    patch({ welcome_channels: next });
  }
  function removeChannel(i: number) {
    patch({ welcome_channels: w!.welcome_channels.filter((_, idx) => idx !== i) });
  }

  // Onboarding prompt yönetimi
  const prompts = w.onboarding_prompts ?? [];
  const rid = () => Math.random().toString(36).slice(2, 9);
  function addPrompt() {
    patch({ onboarding_prompts: [...prompts, { id: rid(), title: 'Yeni soru', options: [] }] });
  }
  function updatePrompt(i: number, p: Partial<APIOnboardingPrompt>) {
    patch({ onboarding_prompts: prompts.map((x, idx) => (idx === i ? { ...x, ...p } : x)) });
  }
  function removePrompt(i: number) {
    patch({ onboarding_prompts: prompts.filter((_, idx) => idx !== i) });
  }
  function addOption(pi: number) {
    const next = prompts.map((p, idx) => (idx === pi ? { ...p, options: [...p.options, { id: rid(), label: 'Seçenek', emoji: '', role_ids: [] }] } : p));
    patch({ onboarding_prompts: next });
  }
  function updateOption(pi: number, oi: number, p: Partial<APIOnboardingOption>) {
    const next = prompts.map((pr, idx) => (idx === pi ? { ...pr, options: pr.options.map((o, j) => (j === oi ? { ...o, ...p } : o)) } : pr));
    patch({ onboarding_prompts: next });
  }
  function removeOption(pi: number, oi: number) {
    const next = prompts.map((pr, idx) => (idx === pi ? { ...pr, options: pr.options.filter((_, j) => j !== oi) } : pr));
    patch({ onboarding_prompts: next });
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.welcome.update(guildId, {
        enabled: w!.enabled,
        description: w!.description,
        welcome_channels: w!.welcome_channels.filter((wc) => wc.channel_id),
        rules_text: w!.rules_text,
        require_accept: w!.require_accept,
        onboarding_prompts: prompts,
      });
      setW(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-ink-primary mb-1">Karşılama & Onboarding</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Yeni üyeler sunucuya katıldığında gösterilecek karşılama ekranını ayarla.
      </p>

      <label className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={w.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="w-4 h-4 accent-brand-500"
        />
        <div>
          <div className="text-sm font-semibold text-ink-primary">Karşılama ekranı etkin</div>
          <div className="text-xs text-ink-tertiary">Kapalıysa yeni üyelere hiçbir şey gösterilmez.</div>
        </div>
      </label>

      <div className="space-y-4 opacity-100" style={{ opacity: w.enabled ? 1 : 0.5, pointerEvents: w.enabled ? 'auto' : 'none' }}>
        <div>
          <label className="block text-xs font-semibold text-ink-tertiary mb-1">Açıklama</label>
          <textarea
            value={w.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            placeholder="Sunucumuza hoş geldin! Burada..."
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-ink-tertiary">Öne çıkan kanallar</label>
            <button onClick={addChannel} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              <Plus size={12} /> Kanal ekle
            </button>
          </div>
          <div className="space-y-2">
            {w.welcome_channels.length === 0 && (
              <p className="text-xs text-ink-tertiary">Henüz öne çıkan kanal yok.</p>
            )}
            {w.welcome_channels.map((wc, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={wc.channel_id}
                  onChange={(e) => updateChannel(i, { channel_id: e.target.value })}
                  className="bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm focus:border-brand-500/50 focus:outline-none"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
                <input
                  value={wc.description ?? ''}
                  onChange={(e) => updateChannel(i, { description: e.target.value })}
                  placeholder="Bu kanalda neler var?"
                  className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm focus:border-brand-500/50 focus:outline-none"
                />
                <button onClick={() => removeChannel(i)} className="text-ink-tertiary hover:text-accent-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-tertiary mb-1">Kurallar metni</label>
          <textarea
            value={w.rules_text}
            onChange={(e) => patch({ rules_text: e.target.value })}
            rows={4}
            placeholder="1. Saygılı ol&#10;2. Spam yapma..."
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={w.require_accept}
            onChange={(e) => patch({ require_accept: e.target.checked })}
            className="w-4 h-4 accent-brand-500"
          />
          <div>
            <div className="text-sm font-semibold text-ink-primary">Kuralların kabulü zorunlu</div>
            <div className="text-xs text-ink-tertiary">Üye kabul edene kadar karşılama ekranı tam ekran gösterilir.</div>
          </div>
        </label>
      </div>

      {/* Onboarding soruları (ilgi → rol) */}
      <div className="bg-surface-2 rounded-xl border border-line p-4 mt-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-ink-primary">Onboarding Soruları</h3>
          <button onClick={addPrompt} className="text-xs text-brand-500 hover:underline">+ Soru ekle</button>
        </div>
        <p className="text-xs text-ink-secondary mb-3">Yeni üyeye ilgi alanlarını sor; seçtiği seçeneğe bağlı roller otomatik atanır.</p>
        <div className="space-y-3">
          {prompts.length === 0 && <p className="text-xs text-ink-tertiary">Henüz soru yok.</p>}
          {prompts.map((p, pi) => (
            <div key={p.id} className="bg-surface-1 border border-line rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={p.title}
                  onChange={(e) => updatePrompt(pi, { title: e.target.value })}
                  placeholder="Soru başlığı (ör. Hangi konularla ilgilisin?)"
                  className="flex-1 bg-surface-2 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary focus:outline-none focus:border-brand-500/50"
                />
                <button onClick={() => removePrompt(pi)} className="text-ink-tertiary hover:text-accent-500"><Trash2 size={14} /></button>
              </div>
              <div className="space-y-1.5 pl-2">
                {p.options.map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <input value={o.emoji ?? ''} onChange={(e) => updateOption(pi, oi, { emoji: e.target.value.slice(0, 4) })} placeholder="🎮" className="w-10 text-center bg-surface-2 border border-line rounded-lg px-1 py-1 text-sm" />
                    <input value={o.label} onChange={(e) => updateOption(pi, oi, { label: e.target.value })} placeholder="Seçenek adı" className="flex-1 bg-surface-2 border border-line rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none focus:border-brand-500/50" />
                    <select
                      value={o.role_ids[0] ?? ''}
                      onChange={(e) => updateOption(pi, oi, { role_ids: e.target.value ? [e.target.value] : [] })}
                      className="bg-surface-2 border border-line rounded-lg px-2 py-1 text-sm text-ink-primary max-w-[120px]"
                    >
                      <option value="">Rol yok</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <button onClick={() => removeOption(pi, oi)} className="text-ink-tertiary hover:text-accent-500 shrink-0"><X size={13} /></button>
                  </div>
                ))}
                <button onClick={() => addOption(pi)} className="text-xs text-brand-500 hover:underline">+ Seçenek</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
        {saved && <span className="text-sm text-emerald-400 flex items-center gap-1"><Check size={14} /> Kaydedildi</span>}
      </div>
    </div>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  guild_update: 'Sunucu güncellendi',
  channel_create: 'Kanal oluşturuldu',
  channel_delete: 'Kanal silindi',
  channel_update: 'Kanal güncellendi',
  role_create: 'Rol oluşturuldu',
  role_delete: 'Rol silindi',
  role_update: 'Rol güncellendi',
  role_assign: 'Rol atandı',
  role_unassign: 'Rol kaldırıldı',
  member_kick: 'Üye atıldı',
  member_ban: 'Üye yasaklandı',
  member_unban: 'Yasak kaldırıldı',
  member_timeout: 'Üye zaman aşımına uğradı',
  invite_create: 'Davet oluşturuldu',
  invite_delete: 'Davet silindi',
  message_delete_mod: 'Mesaj silindi (mod)',
};

function AuditTab({ guildId }: { guildId: string }) {
  const users = useAppSelector((s) => s.users.byId);
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof api.guilds.auditLog>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.guilds
      .auditLog(guildId)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [guildId]);
  const [filter, setFilter] = useState('');
  const shownLogs = filter ? logs.filter((l) => l.action === filter) : logs;
  const actions = Array.from(new Set(logs.map((l) => l.action)));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Denetim Günlüğü</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm text-ink-primary"
        >
          <option value="">Tüm işlemler</option>
          {actions.map((a) => (
            <option key={a} value={a}>{AUDIT_LABELS[a] ?? a}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-ink-tertiary text-sm">Yükleniyor...</p>
      ) : shownLogs.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Kayıt yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {shownLogs.map((l) => {
            const actor = users[l.actor_id]?.display_name ?? `Kullanıcı ${l.actor_id.slice(-4)}`;
            return (
              <li key={l.id} className="bg-surface-2 border border-line rounded-lg px-3 py-2 flex items-center gap-3">
                <span className="w-7 h-7 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center shrink-0">
                  <ScrollText size={14} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-primary">
                    <span className="font-semibold">{actor}</span>{' '}
                    {AUDIT_LABELS[l.action] ?? l.action}
                    {l.reason ? <span className="text-ink-tertiary"> — {l.reason}</span> : null}
                  </div>
                  <div className="text-[11px] text-ink-tertiary">
                    {new Date(l.created_at).toLocaleString('tr-TR')}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GuildInvitesTab({ guildId }: { guildId: string }) {
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof api.guilds.invites>>>([]);
  const users = useAppSelector((s) => s.users.byId);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    setInvites(await api.guilds.invites(guildId).catch(() => []));
    setLoading(false);
  }
  useEffect(() => { refresh(); }, [guildId]);
  async function create() {
    await api.guilds.createInvite(guildId, { max_uses: 0, expires_in_sec: 604800 }).catch(() => {});
    refresh();
  }
  async function revoke(code: string) {
    await api.invites.delete(code).catch(() => {});
    setInvites((xs) => xs.filter((i) => i.code !== code));
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Davetler</h2>
        <button onClick={create} className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold">
          Davet Oluştur
        </button>
      </div>
      {loading ? (
        <p className="text-ink-tertiary text-sm">Yükleniyor...</p>
      ) : invites.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Aktif davet yok.</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((inv) => (
            <li key={inv.code} className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-2.5">
              <code className="text-sm text-brand-400 font-mono flex-1">concord.com/davet/{inv.code}</code>
              <span className="text-xs text-ink-tertiary">
                {users[inv.inviter_id]?.display_name ?? '—'} · {inv.uses}{inv.max_uses ? `/${inv.max_uses}` : ''} kullanım
              </span>
              <button onClick={() => navigator.clipboard?.writeText(`${location.host}/davet/${inv.code}`)} className="text-ink-tertiary hover:text-ink-primary text-xs">Kopyala</button>
              <button onClick={() => revoke(inv.code)} className="text-ink-tertiary hover:text-accent-500"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const AUTOMOD_TRIGGERS: { value: string; label: string; desc: string; dataKey?: string; placeholder?: string }[] = [
  { value: 'keyword', label: 'Anahtar kelime filtresi', desc: 'Belirli kelimeleri içeren mesajları yakalar', dataKey: 'keywords', placeholder: 'küfür, spam, reklam (virgülle ayır)' },
  { value: 'regex', label: 'Regex kalıbı', desc: 'Düzenli ifade ile eşleşen mesajları yakalar', dataKey: 'patterns', placeholder: '\\b(spam|scam)\\b' },
  { value: 'link_blacklist', label: 'Bağlantı kara listesi', desc: 'Yasaklı alan adlarına bağlantıları engeller', dataKey: 'domains', placeholder: 'kotusite.com, virus.net' },
  { value: 'invite_blacklist', label: 'Davet engelleme', desc: 'Diğer sunucu davet bağlantılarını engeller' },
  { value: 'mention_spam', label: 'Bahsetme spam’i', desc: 'Çok fazla bahsetme içeren mesajları engeller', dataKey: 'max_mentions', placeholder: 'Maks. bahsetme sayısı (ör. 5)' },
  { value: 'message_spam', label: 'Mesaj spam’i', desc: 'Kısa sürede çok / tekrarlı mesajları engeller', dataKey: 'max_messages', placeholder: 'Maks. mesaj/7sn (boş = 5)' },
  { value: 'caps', label: 'Aşırı büyük harf', desc: 'Çoğunlukla büyük harf olan mesajları yakalar', dataKey: 'threshold', placeholder: '70 (% oran)' },
];

function AutomodTab({ guildId }: { guildId: string }) {
  const [rules, setRules] = useState<APIAutomodRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('keyword');
  const [dataInput, setDataInput] = useState('');
  const [actBlock, setActBlock] = useState(true);
  const [actTimeout, setActTimeout] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [busy, setBusy] = useState(false);

  const trig = AUTOMOD_TRIGGERS.find((t) => t.value === trigger)!;

  function load() {
    setLoading(true);
    api.guilds.automodRules(guildId).then(setRules).catch(() => {}).finally(() => setLoading(false));
  }
  useEffect(load, [guildId]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      // Trigger tipine göre backend'in beklediği trigger_data şeklini oluştur
      let trigger_data: any = {};
      const num = parseInt(dataInput, 10);
      switch (trigger) {
        case 'mention_spam':
          trigger_data = { max_mentions: num || 5 };
          break;
        case 'caps':
          // UI yüzde alır (ör. 70) → backend 0.0-1.0 oran bekler
          trigger_data = { threshold: (num || 70) / 100, min_length: 10 };
          break;
        case 'message_spam':
          // Varsayılanlar: 5 mesaj / 7 sn, 3 tekrar (backend default'ları)
          trigger_data = num ? { max_messages: num } : {};
          break;
        case 'invite_blacklist':
          trigger_data = {};
          break;
        default:
          // keyword | regex | link_blacklist → dizi
          if (trig.dataKey) {
            trigger_data = { [trig.dataKey]: dataInput.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) };
          }
      }
      const actions: any[] = [];
      if (actBlock) actions.push({ type: 'block' });
      if (actTimeout) actions.push({ type: 'timeout', duration_sec: timeoutSec });
      await api.guilds.createAutomodRule(guildId, {
        name: name.trim(),
        trigger_type: trigger,
        trigger_data,
        actions,
        enabled: true,
      });
      setName(''); setDataInput(''); setCreating(false);
      load();
    } catch (e: any) {
      alert('Kural oluşturulamadı: ' + (e?.message ?? ''));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu otomatik moderasyon kuralı silinsin mi?')) return;
    await api.guilds.deleteAutomodRule(guildId, id).catch(() => {});
    load();
  }

  async function toggle(id: string, enabled: boolean) {
    // Optimistik
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await api.guilds.updateAutomodRule(guildId, id, enabled).catch(() => load());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-ink-primary">Otomatik Moderasyon</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
            <Plus size={15} /> Kural Ekle
          </button>
        )}
      </div>
      <p className="text-sm text-ink-tertiary mb-4">Sunucunu zararlı içerikten otomatik koru. Kurallar mesaj gönderilirken çalışır.</p>

      {creating && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 mb-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kural adı (ör. Küfür Engeli)"
            className="w-full bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary"
          />
          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">Tetikleyici Türü</label>
            <select value={trigger} onChange={(e) => { setTrigger(e.target.value); setDataInput(''); }} className="w-full mt-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary">
              {AUTOMOD_TRIGGERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <p className="text-xs text-ink-tertiary mt-1">{trig.desc}</p>
          </div>
          {trig.dataKey && (
            <div>
              <label className="text-xs font-semibold uppercase text-ink-tertiary">
                {trig.dataKey === 'threshold' ? 'Eşik Değeri' : 'Filtre Listesi'}
              </label>
              {trig.dataKey === 'threshold' ? (
                <input value={dataInput} onChange={(e) => setDataInput(e.target.value)} placeholder={trig.placeholder} className="w-full mt-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary" />
              ) : (
                <textarea value={dataInput} onChange={(e) => setDataInput(e.target.value)} placeholder={trig.placeholder} rows={2} className="w-full mt-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary resize-none" />
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">Eylemler</label>
            <label className="flex items-center gap-2 mt-1.5 text-sm text-ink-secondary cursor-pointer">
              <input type="checkbox" checked={actBlock} onChange={(e) => setActBlock(e.target.checked)} className="accent-brand-500" />
              Mesajı engelle
            </label>
            <label className="flex items-center gap-2 mt-1 text-sm text-ink-secondary cursor-pointer">
              <input type="checkbox" checked={actTimeout} onChange={(e) => setActTimeout(e.target.checked)} className="accent-brand-500" />
              Üyeyi zaman aşımına uğrat
              {actTimeout && (
                <select value={timeoutSec} onChange={(e) => setTimeoutSec(parseInt(e.target.value, 10))} className="ml-1 bg-surface-1 border border-line rounded px-2 py-0.5 text-xs">
                  <option value={60}>1 dk</option>
                  <option value={300}>5 dk</option>
                  <option value={600}>10 dk</option>
                  <option value={3600}>1 saat</option>
                  <option value={86400}>1 gün</option>
                </select>
              )}
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={create} disabled={busy || !name.trim()} className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {busy ? 'Oluşturuluyor…' : 'Oluştur'}
            </button>
            <button onClick={() => setCreating(false)} className="text-ink-tertiary hover:text-ink-primary text-sm px-3">İptal</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-tertiary">Yükleniyor…</p>
      ) : rules.length === 0 ? (
        <div className="text-center py-10 text-ink-tertiary">
          <ShieldAlert size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Henüz otomatik moderasyon kuralı yok.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => {
            const t = AUTOMOD_TRIGGERS.find((x) => x.value === r.trigger_type);
            return (
              <li key={r.id} className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3">
                <div className={'w-2 h-2 rounded-full ' + (r.enabled ? 'bg-emerald-500' : 'bg-ink-tertiary')} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-primary truncate">{r.name}</div>
                  <div className="text-xs text-ink-tertiary truncate">
                    {t?.label ?? r.trigger_type}
                    {(() => {
                      const td = r.trigger_data as any;
                      const list = td?.keywords ?? td?.domains ?? td?.patterns;
                      if (Array.isArray(list) && list.length) return ` · ${list.slice(0, 4).join(', ')}${list.length > 4 ? '…' : ''}`;
                      if (td?.threshold) return ` · eşik ${td.threshold}`;
                      return '';
                    })()}
                    {r.enabled ? '' : ' · devre dışı'}
                  </div>
                </div>
                <button
                  onClick={() => toggle(r.id, !r.enabled)}
                  title={r.enabled ? 'Devre dışı bırak' : 'Etkinleştir'}
                  className={'shrink-0 w-9 h-5 rounded-full transition-colors relative ' + (r.enabled ? 'bg-brand-500' : 'bg-surface-3')}
                  role="switch"
                  aria-checked={r.enabled}
                >
                  <span className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' + (r.enabled ? 'left-[18px]' : 'left-0.5')} />
                </button>
                <button onClick={() => remove(r.id)} className="text-ink-tertiary hover:text-accent-500" title="Sil" aria-label="Sil"><Trash2 size={15} /></button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Takip Edilenler — bu sunucuya duyuru ileten kaynak kanallar (Discord "followed channels" paritesi)
function FollowsTab({ guildId }: { guildId: string }) {
  const [follows, setFollows] = useState<
    Array<{
      id: string;
      source_channel_id: string;
      source_channel: string;
      source_guild: string;
      target_channel_id: string;
      target_channel: string;
      created_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.follows
      .listForGuild(guildId)
      .then(setFollows)
      .catch(() => setFollows([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [guildId]);

  const remove = (id: string) => {
    api.follows.remove(id).then(load).catch(() => {});
  };

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-primary mb-1">Takip Edilen Kanallar</h2>
      <p className="text-sm text-ink-tertiary mb-4">
        Başka sunucuların duyuru kanallarından bu sunucuya iletilen yayınlar. Bir duyuru kanalını
        takip etmek için kanalın başlığındaki "Takip Et" düğmesini kullan.
      </p>
      {loading ? (
        <div className="text-sm text-ink-tertiary">Yükleniyor...</div>
      ) : follows.length === 0 ? (
        <div className="text-sm text-ink-tertiary border border-dashed border-line rounded-xl p-6 text-center">
          Henüz takip edilen duyuru kanalı yok.
        </div>
      ) : (
        <ul className="space-y-2">
          {follows.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3"
            >
              <Megaphone size={18} className="text-brand-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-primary truncate">
                  {f.source_guild} <span className="text-ink-tertiary font-normal">/</span> #{f.source_channel}
                </div>
                <div className="text-xs text-ink-tertiary truncate">→ #{f.target_channel} kanalına iletiliyor</div>
              </div>
              <button
                onClick={() => remove(f.id)}
                className="w-8 h-8 rounded-lg hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center shrink-0"
                title="Takibi bırak" aria-label="Takibi bırak"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
