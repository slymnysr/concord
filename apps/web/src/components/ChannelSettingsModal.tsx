import { useEffect, useState } from 'react';
import { Settings, Shield, Link2, Plug, Trash2, Hash, Volume2, Check, Copy, X } from 'lucide-react';
import { api, type APIChannel, type APIRole } from '../api';
import { useAppDispatch, useAppSelector, closeModal, fetchChannels, openChannelPerms, addToast } from '../store';
import { t } from '../i18n';

type Tab = 'overview' | 'permissions' | 'invites' | 'integrations';

const VIEW_BIT = 1n << 10n; // Kanalı Görüntüle

const SLOW_MODES: { v: number; label: string }[] = [
  { v: 0, label: t('common.off') },
  { v: 5, label: '5sn' },
  { v: 10, label: '10sn' },
  { v: 15, label: '15sn' },
  { v: 30, label: '30sn' },
  { v: 60, label: '1dk' },
  { v: 300, label: '5dk' },
  { v: 900, label: '15dk' },
  { v: 3600, label: '1sa' },
  { v: 21600, label: '6sa' },
];

const ARCHIVE_OPTS: { v: number; label: string }[] = [
  { v: 0, label: t('common.off') },
  { v: 60, label: '1 saat' },
  { v: 1440, label: '24 saat' },
  { v: 4320, label: '3 gün' },
  { v: 10080, label: '1 hafta' },
];

export function ChannelSettingsModal({ channel }: { channel: APIChannel }) {
  const [tab, setTab] = useState<Tab>('overview');
  const isVoice = channel.type === 'voice';

  return (
    <div className="flex max-h-[80vh]" style={{ minHeight: '480px' }}>
      <nav className="w-48 bg-surface-2 border-r border-line p-3 space-y-1 overflow-y-auto rounded-l-2xl">
        <div className="text-xs font-bold uppercase text-ink-tertiary px-2 py-2 truncate flex items-center gap-1">
          {isVoice ? <Volume2 size={12} /> : <Hash size={12} />}
          {channel.name}
        </div>
        <TabBtn icon={<Settings size={16} />} active={tab === 'overview'} onClick={() => setTab('overview')}>
          Genel Görünüm
        </TabBtn>
        <TabBtn icon={<Shield size={16} />} active={tab === 'permissions'} onClick={() => setTab('permissions')}>
          İzinler
        </TabBtn>
        <TabBtn icon={<Link2 size={16} />} active={tab === 'invites'} onClick={() => setTab('invites')}>
          Davetler
        </TabBtn>
        <TabBtn icon={<Plug size={16} />} active={tab === 'integrations'} onClick={() => setTab('integrations')}>
          Entegrasyonlar
        </TabBtn>
        <div className="pt-1 mt-1 border-t border-line">
          <DeleteChannelButton channel={channel} />
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && <OverviewTab channel={channel} />}
        {tab === 'permissions' && <PermissionsTab channel={channel} />}
        {tab === 'invites' && <InvitesTab channel={channel} />}
        {tab === 'integrations' && <IntegrationsTab channel={channel} />}
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
        'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ' +
        (active ? 'bg-brand-500/15 text-brand-500' : 'text-ink-secondary hover:bg-surface-3 hover:text-ink-primary')
      }
    >
      {icon}
      {children}
    </button>
  );
}

function OverviewTab({ channel }: { channel: APIChannel }) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const isVoice = channel.type === 'voice';
  const isCategory = channel.type === 'category';
  const categories = useAppSelector((s) =>
    guildId ? (s.channels.byGuild[guildId] ?? []).filter((c) => c.type === 'category' && c.id !== channel.id) : [],
  );
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? '');
  const [nsfw, setNsfw] = useState(channel.nsfw);
  const [slow, setSlow] = useState(channel.rate_limit_sec);
  const [archive, setArchive] = useState(channel.auto_archive_minutes ?? 0);
  const [parent, setParent] = useState(channel.parent_id ?? '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    name !== channel.name ||
    topic !== (channel.topic ?? '') ||
    nsfw !== channel.nsfw ||
    slow !== channel.rate_limit_sec ||
    archive !== (channel.auto_archive_minutes ?? 0) ||
    parent !== (channel.parent_id ?? '');

  async function save() {
    if (!guildId || busy) return;
    setBusy(true);
    try {
      await api.channels.update(channel.id, {
        name: name.trim().toLowerCase().replace(/\s+/g, '-') || channel.name,
        topic,
        nsfw,
        rate_limit_sec: slow,
        auto_archive_minutes: archive,
        parent_id: parent || null,
      });
      await dispatch(fetchChannels(guildId));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-ink-primary mb-5">{t('channel.overview')}</h2>

      <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
        Kanal Adı
      </label>
      <div className="relative mb-5">
        {isVoice ? (
          <Volume2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
        ) : (
          <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
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
          <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
            Kanal Başlığı
          </label>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value.slice(0, 1024))}
            rows={2}
            placeholder={t('channel.topicPlaceholder')}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary resize-none"
          />
          <div className="text-[11px] text-ink-tertiary text-right mt-1 mb-5">{1024 - topic.length} karakter kaldı</div>

          <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-2">
            Yavaş Mod
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {SLOW_MODES.map((s) => (
              <button
                key={s.v}
                onClick={() => setSlow(s.v)}
                className={
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' +
                  (slow === s.v ? 'bg-brand-500 text-white' : 'bg-surface-2 text-ink-secondary hover:bg-surface-3')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-tertiary mb-5">
            Üyeler mesaj gönderdikten sonra belirtilen süre beklemek zorunda kalır.
          </p>

          <label className="flex items-center justify-between gap-3 mb-5 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold text-ink-primary">{t('msg.nsfwChannel')}</span>
              <span className="block text-xs text-ink-tertiary">
                Yaş sınırlı kanallar sakıncalı içerik filtresinden muaftır.
              </span>
            </span>
            <input type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} className="w-4 h-4 accent-brand-500 shrink-0" />
          </label>

          <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-2">
            Etkin Olmadığında Gizle
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {ARCHIVE_OPTS.map((a) => (
              <button
                key={a.v}
                onClick={() => setArchive(a.v)}
                className={
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ' +
                  (archive === a.v ? 'bg-brand-500 text-white' : 'bg-surface-2 text-ink-secondary hover:bg-surface-3')
                }
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-tertiary mb-2">
            Kanal belirtilen süre boyunca aktif olmazsa kanal listesinde gösterilmez.
          </p>
        </>
      )}

      {!isCategory && categories.length > 0 && (
        <div className="mb-5">
          <label className="block text-xs font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
            Kategori
          </label>
          <select
            value={parent}
            onChange={(e) => setParent(e.target.value)}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary"
          >
            <option value="">— Kategorisiz —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {channel.type === 'forum' && <ForumTagsManager channelId={channel.id} />}

      <div className="flex items-center gap-3 mt-4 sticky bottom-0">
        <button
          onClick={save}
          disabled={!dirty || busy}
          className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold"
        >
          {busy ? t('common.saving') : t('channel.saveChanges')}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <Check size={14} /> Kaydedildi
          </span>
        )}
      </div>
    </div>
  );
}

function ForumTagsManager({ channelId }: { channelId: string }) {
  const [tags, setTags] = useState<Array<{ id: string; name: string; emoji?: string; position: number }>>([]);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    api.forumTags.list(channelId).then(setTags).catch(() => setTags([]));
  }
  useEffect(load, [channelId]);

  async function add() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const t = await api.forumTags.create(channelId, { name, emoji: newEmoji.trim() || undefined });
      setTags((ts) => [...ts, t]);
      setNewName('');
      setNewEmoji('');
    } catch (e: any) {
      setErr(e?.detail || e?.message || t('forum.tagAddFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    await api.forumTags.delete(id).catch(() => {});
    setTags((ts) => ts.filter((t) => t.id !== id));
  }

  return (
    <div className="mt-6 pt-5 border-t border-line">
      <h3 className="text-sm font-bold text-ink-primary mb-1">{t('forum.tags')}</h3>
      <p className="text-xs text-ink-tertiary mb-3">Üyeler gönderi açarken bu etiketleri seçip filtreleyebilir (en fazla 20).</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.length === 0 && <span className="text-xs text-ink-tertiary">{t('forum.noTags')}</span>}
        {tags.map((tag) => (
          <span key={tag.id} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3 text-ink-secondary">
            {tag.emoji ? tag.emoji + ' ' : ''}{tag.name}
            <button onClick={() => remove(tag.id)} className="text-ink-tertiary hover:text-accent-500" title={t('common.delete')} aria-label={t('common.delete')}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={newEmoji}
          onChange={(e) => setNewEmoji(e.target.value.slice(0, 4))}
          placeholder="🏷️"
          className="w-14 text-center bg-surface-2 border border-line rounded-lg px-2 py-1.5 text-sm"
        />
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={40}
          placeholder={t('forum.tagPlaceholder')}
          className="flex-1 bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-ink-primary"
        />
        <button
          onClick={add}
          disabled={!newName.trim() || busy}
          className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold"
        >
          Ekle
        </button>
      </div>
      {err && <p className="text-accent-500 text-xs mt-1.5">{err}</p>}
    </div>
  );
}

function PermissionsTab({ channel }: { channel: APIChannel }) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const [everyone, setEveryone] = useState<APIRole | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!guildId) return;
    const [roles, overrides] = await Promise.all([
      api.guilds.roles(guildId).catch(() => [] as APIRole[]),
      api.channels.listOverrides(channel.id).catch(() => []),
    ]);
    const ev = roles.find((r) => r.is_everyone) ?? null;
    setEveryone(ev);
    if (ev) {
      const ov = overrides.find((o) => o.target_type === 'role' && o.target_id === ev.id);
      setIsPrivate(ov ? (BigInt(ov.deny) & VIEW_BIT) === VIEW_BIT : false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id, guildId]);

  async function togglePrivate(next: boolean) {
    if (!everyone || busy) return;
    setBusy(true);
    try {
      const overrides = await api.channels.listOverrides(channel.id).catch(() => []);
      const cur = overrides.find((o) => o.target_type === 'role' && o.target_id === everyone.id);
      let deny = cur ? BigInt(cur.deny) : 0n;
      const allow = cur ? BigInt(cur.allow) : 0n;
      if (next) deny |= VIEW_BIT;
      else deny &= ~VIEW_BIT;
      await api.channels.upsertOverride(channel.id, {
        target_type: 'role',
        target_id: everyone.id,
        allow: allow.toString(),
        deny: deny.toString(),
      });
      setIsPrivate(next);
      dispatch(addToast({ kind: 'success', message: next ? t('channel.madePrivate') : t('channel.madePublic') }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || t('common.updateFailed') }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-ink-primary mb-1">{t('channel.permissions')}</h2>
      <p className="text-sm text-ink-secondary mb-5">
        Bu kanalda kimin ne yapabileceğini özelleştirmek için izinleri kullan.
      </p>

      <label className="flex items-center justify-between gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3 cursor-pointer">
        <span>
          <span className="block text-sm font-semibold text-ink-primary">{t('channel.private')}</span>
          <span className="block text-xs text-ink-tertiary">
            Bir kanalı özel yapmak, sadece seçilen üyelerin ve rollerin bu kanalı görüntüleyebilmesini sağlar.
          </span>
        </span>
        <input
          type="checkbox"
          checked={isPrivate}
          disabled={busy || !everyone}
          onChange={(e) => togglePrivate(e.target.checked)}
          className="w-4 h-4 accent-brand-500 shrink-0"
        />
      </label>

      <button
        onClick={() => dispatch(openChannelPerms(channel.id))}
        className="mt-4 w-full flex items-center justify-between px-4 py-3 rounded-xl border border-line hover:border-brand-500/50 hover:bg-surface-2 transition-colors"
      >
        <span className="text-sm font-semibold text-ink-primary">{t('channel.advancedPerms')}</span>
        <span className="text-xs text-ink-tertiary">Roller / Üyeler →</span>
      </button>
    </div>
  );
}

function InvitesTab({ channel }: { channel: APIChannel }) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createLink() {
    if (!guildId || busy) return;
    setBusy(true);
    try {
      const inv = await api.guilds.createInvite(guildId, { max_uses: 0, expires_in_sec: 604800 });
      setLink(`${location.host}/davet/${inv.code}`);
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Davet oluşturulamadı' }));
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(
      () => dispatch(addToast({ kind: 'success', message: 'Bağlantı kopyalandı' })),
      () => {},
    );
  }

  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-bold text-ink-primary mb-1">{t('invite.listTitle')}</h2>
      <p className="text-sm text-ink-secondary mb-5">#{channel.name} için bir davet bağlantısı oluştur.</p>
      {link ? (
        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2.5 text-ink-primary font-mono text-sm"
          />
          <button onClick={copy} className="px-4 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-semibold flex items-center gap-1.5">
            <Copy size={15} /> Kopyala
          </button>
        </div>
      ) : (
        <button
          onClick={createLink}
          disabled={busy}
          className="px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {busy ? 'Oluşturuluyor...' : 'Davet Bağlantısı Oluştur'}
        </button>
      )}
    </div>
  );
}

function IntegrationsTab({ channel }: { channel: APIChannel }) {
  const dispatch = useAppDispatch();
  const [hooks, setHooks] = useState<Awaited<ReturnType<typeof api.webhooks.list>>>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newUrl, setNewUrl] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setHooks(await api.webhooks.list(channel.id));
    } catch {
      setHooks([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id]);

  async function create() {
    setCreating(true);
    setNewUrl(null);
    try {
      const wh = await api.webhooks.create(channel.id, 'Concord Webhook');
      setNewUrl(`${location.origin}/api/v1/webhooks/${wh.id}/${wh.token}`);
      await refresh();
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Webhook oluşturulamadı' }));
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Bu webhook silinsin mi?')) return;
    try {
      await api.webhooks.delete(id);
      await refresh();
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Silinemedi' }));
    }
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-ink-primary">{t('channel.integrations')}</h2>
        <button
          onClick={create}
          disabled={creating}
          className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white text-sm font-semibold"
        >
          {creating ? 'Oluşturuluyor...' : 'Yeni Webhook'}
        </button>
      </div>
      <p className="text-sm text-ink-secondary mb-4">
        Webhook'lar başka uygulamaların #{channel.name} kanalına mesaj göndermesini sağlar.
      </p>

      {newUrl && (
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-xl p-3 mb-4">
          <div className="text-xs font-bold text-brand-300 mb-1">Webhook URL'i (bir kez gösterilir, kopyala!)</div>
          <div className="flex gap-2">
            <input
              readOnly
              value={newUrl}
              className="flex-1 bg-surface-1 border border-line rounded-md px-2 py-1.5 text-xs text-ink-primary font-mono"
            />
            <button
              onClick={() => {
                navigator.clipboard?.writeText(newUrl);
                dispatch(addToast({ kind: 'success', message: 'Webhook URL kopyalandı' }));
              }}
              className="px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold flex items-center gap-1"
            >
              <Copy size={13} /> Kopyala
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-tertiary">Yükleniyor...</p>
      ) : hooks.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Henüz webhook yok.</p>
      ) : (
        <ul className="space-y-2">
          {hooks.map((wh) => (
            <li key={wh.id} className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3">
              <span className="w-9 h-9 rounded-full bg-brand-500/20 text-brand-500 flex items-center justify-center shrink-0">
                <Plug size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ink-primary truncate">{wh.name}</div>
                <div className="text-xs text-ink-tertiary">
                  {new Date(wh.created_at).toLocaleDateString('tr-TR')}
                </div>
              </div>
              <button onClick={() => remove(wh.id)} className="text-ink-tertiary hover:text-accent-500">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeleteChannelButton({ channel }: { channel: APIChannel }) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  async function del() {
    if (!confirm(`#${channel.name} kanalı silinsin mi? Bu işlem geri alınamaz.`)) return;
    try {
      await api.channels.delete(channel.id);
      if (guildId) await dispatch(fetchChannels(guildId));
      dispatch(closeModal());
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Silinemedi' }));
    }
  }
  return (
    <button
      onClick={del}
      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium text-accent-400 hover:bg-accent-500/10 transition-colors"
    >
      <Trash2 size={16} /> Kanalı Sil
    </button>
  );
}
