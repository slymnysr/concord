import { useState, useRef, useEffect, useMemo } from 'react';
import { PERM } from '../perms';
import clsx from 'clsx';
import { voice } from '../voice';
import { t } from '../i18n';
import { setPresenceStatus } from '../gateway';
import {
  Hash,
  Volume2,
  Megaphone,
  MessagesSquare,
  Mic,
  Image as ImageIcon,
  ChevronDown,
  Settings,
  LogOut,
  UserPlus,
  Pencil,
  Lock,
  Trash2,
  Link as LinkIcon,
  BellOff,
  Bell,
  Check,
  Copy,
  type LucideIcon,
} from 'lucide-react';
import {
  useAppDispatch,
  useAppSelector,
  selectChannel,
  logout,
  openModal,
  fetchVoicePresence,
  fetchChannels,
  openChannelPerms,
  openChannelSettings,
  openCreateChannel,
  addToast,
  ackChannel,
  switchToDM,
  fetchGuilds,
  upsertUser,
} from '../store';
import { api, type APIChannel } from '../api';
import { VoiceStatusBar } from './VoiceStatusBar';
import { GuildProfileModal } from './GuildProfileModal';

const ChannelIcon: Record<string, LucideIcon> = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
  forum: MessagesSquare,
  media: ImageIcon,
  stage: Mic,
  category: Hash,
};

export function ChannelList() {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const all = useAppSelector((s) => (guildId ? s.channels.byGuild[guildId] ?? [] : []));
  const selectedId = useAppSelector((s) => s.channels.selectedId);
  const voiceByChannel = useAppSelector((s) => s.presence.voiceByChannel);
  const meId = useAppSelector((s) => s.auth.user?.id);
  const isOwner = useAppSelector((s) => s.guilds.list.find((g) => g.id === s.guilds.selectedId)?.owner_id === meId);

  // Metin/Ses bölüm katlama (localStorage'da kalıcı)
  const [collapsedText, setCollapsedTextRaw] = useState(() => localStorage.getItem('concord_collapse_text') === '1');
  const [collapsedVoice, setCollapsedVoiceRaw] = useState(() => localStorage.getItem('concord_collapse_voice') === '1');
  const setCollapsedText = (v: boolean | ((p: boolean) => boolean)) =>
    setCollapsedTextRaw((p) => {
      const n = typeof v === 'function' ? v(p) : v;
      localStorage.setItem('concord_collapse_text', n ? '1' : '0');
      return n;
    });
  const setCollapsedVoice = (v: boolean | ((p: boolean) => boolean)) =>
    setCollapsedVoiceRaw((p) => {
      const n = typeof v === 'function' ? v(p) : v;
      localStorage.setItem('concord_collapse_voice', n ? '1' : '0');
      return n;
    });
  const usersById = useAppSelector((s) => s.users.byId);
  const dispatch = useAppDispatch();

  // Voice kanalları için periyodik presence çek
  useEffect(() => {
    const voiceChannels = all.filter((c) => c.type === 'voice' || c.type === 'stage').map((c) => c.id);
    if (voiceChannels.length === 0) return;
    const tick = () => {
      dispatch(fetchVoicePresence(voiceChannels));
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [all, dispatch]);

  // Sese bağlı kullanıcıların adlarını çöz: store'da yoksa profilini getir (ham ID gösterilmesin)
  useEffect(() => {
    const ids = new Set<string>();
    for (const cid in voiceByChannel) for (const uid of voiceByChannel[cid] ?? []) ids.add(uid);
    for (const uid of ids) {
      if (!usersById[uid]) {
        api.users.user(uid).then((u) => dispatch(upsertUser(u as any))).catch(() => {});
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceByChannel]);

  // Kategorilere göre grupla — kategori type='category', diğer kanallar parent_id'yi referans alır
  const categories = all
    .filter((c) => c.type === 'category')
    .sort((a, b) => a.position - b.position);
  const byParent: Record<string, APIChannel[]> = {};
  const uncategorized: APIChannel[] = [];
  for (const ch of all) {
    if (ch.type === 'category') continue;
    if (ch.parent_id) {
      (byParent[ch.parent_id] ??= []).push(ch);
    } else {
      uncategorized.push(ch);
    }
  }
  for (const k of Object.keys(byParent)) {
    byParent[k].sort((a, b) => a.position - b.position);
  }
  uncategorized.sort((a, b) => a.position - b.position);

  async function onDropChannel(
    e: React.DragEvent,
    target: { parentId: string | null; siblings: APIChannel[] },
    beforeId?: string,
  ) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/concord-channel');
    if (!draggedId || !guildId) return;
    const dragged = all.find((c) => c.id === draggedId);
    if (!dragged || dragged.type === 'category') return;
    // Yeni sıraya göre position hesapla: hedef siblings içine sırasıyla yeniden
    // yerleştir. Basit: dragged'i siblings'ten çıkar, beforeId'nin önüne ekle,
    // tüm pozisyonları yeniden ata.
    const list = target.siblings.filter((c) => c.id !== draggedId);
    let insertIdx = list.length;
    if (beforeId) {
      const idx = list.findIndex((c) => c.id === beforeId);
      if (idx >= 0) insertIdx = idx;
    }
    list.splice(insertIdx, 0, dragged);
    // Backend'e parent_id + position güncellemesi gönder
    try {
      await api.channels.update(draggedId, {
        parent_id: target.parentId ?? '',
      });
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.position !== i) {
          await api.channels.update(c.id, { position: i });
        }
      }
      await dispatch(fetchChannels(guildId));
    } catch (err) {
      console.warn('drop channel', err);
    }
  }

  function renderChannel(ch: APIChannel, siblings: APIChannel[], parentId: string | null) {
    const active = ch.id === selectedId;
    const Icon = ChannelIcon[ch.type] ?? Hash;
    const connected = ch.type === 'voice' || ch.type === 'stage' ? voiceByChannel[ch.id] ?? [] : [];
    return (
      <li
        key={ch.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/concord-channel', ch.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/concord-channel')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }
        }}
        onDrop={(e) => onDropChannel(e, { parentId, siblings }, ch.id)}
        className="relative group"
      >
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-brand-500 rounded-r-full" />
        )}
        <ChannelButton channel={ch} active={active} Icon={Icon} connectedCount={connected.length} />
        {(ch.type === 'voice' || ch.type === 'stage') && connected.length > 0 && (
          <ul className="ml-6 mt-0.5 space-y-0.5">
            {connected.map((uid: string) => (
              <VoiceConnectedRow key={uid} userId={uid} user={usersById[uid]} />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside className="w-64 bg-surface-1 flex flex-col border-r border-line">
      <GuildHeader />

      <div className="flex-1 overflow-y-auto py-3 px-2.5 space-y-3">
        {!guildId && (
          <p className="text-sm text-ink-tertiary px-2 py-6 text-center">
            {t('guild.pickOrCreate')}
          </p>
        )}
        {guildId && all.length === 0 && (
          <div className="px-2 py-6 text-center">
            <p className="text-sm text-ink-tertiary mb-3">{t('channel.empty')}</p>
            {isOwner && (
              <button
                onClick={() => dispatch(openCreateChannel('text'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold"
              >
                <span className="text-base leading-none">+</span> Kanal Oluştur
              </button>
            )}
          </div>
        )}

        {/* Kategorisiz kanallar — Metin / Ses olarak ayrılır */}
        {(() => {
          const uncatVoice = uncategorized.filter((c) => c.type === 'voice' || c.type === 'stage');
          const uncatText = uncategorized.filter((c) => c.type !== 'voice' && c.type !== 'stage');
          return (
            <>
              {uncatText.length > 0 && (
                <div className="group/sec">
                  <div className="px-1 mb-1 text-[11px] font-bold text-ink-tertiary uppercase tracking-[0.08em] flex items-center justify-between">
                    <button
                      onClick={() => setCollapsedText((v) => !v)}
                      className="flex items-center gap-0.5 flex-1 min-w-0 text-left hover:text-ink-secondary"
                    >
                      <ChevronDown size={12} className={'transition-transform ' + (collapsedText ? '-rotate-90' : '')} />
                      <span className="truncate">{t('channel.textChannels')}</span>
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => dispatch(openCreateChannel('text'))}
                        title={t('channel.createText')} aria-label={t('channel.createText')}
                        className="opacity-0 group-hover/sec:opacity-100 text-base leading-none hover:text-ink-primary transition-opacity px-1"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {!collapsedText && (
                    <ul
                      className="space-y-0.5 mb-3"
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes('text/concord-channel')) e.preventDefault();
                      }}
                      onDrop={(e) => onDropChannel(e, { parentId: null, siblings: uncategorized })}
                    >
                      {uncatText.map((ch) => renderChannel(ch, uncategorized, null))}
                    </ul>
                  )}
                </div>
              )}
              {uncatVoice.length > 0 && (
                <div className="group/sec">
                  <div className="px-1 mb-1 text-[11px] font-bold text-ink-tertiary uppercase tracking-[0.08em] flex items-center justify-between">
                    <button
                      onClick={() => setCollapsedVoice((v) => !v)}
                      className="flex items-center gap-0.5 flex-1 min-w-0 text-left hover:text-ink-secondary"
                    >
                      <ChevronDown size={12} className={'transition-transform ' + (collapsedVoice ? '-rotate-90' : '')} />
                      <span className="truncate">{t('channel.voiceChannels')}</span>
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => dispatch(openCreateChannel('voice'))}
                        title={t('channel.createVoice')} aria-label={t('channel.createVoice')}
                        className="opacity-0 group-hover/sec:opacity-100 text-base leading-none hover:text-ink-primary transition-opacity px-1"
                      >
                        +
                      </button>
                    )}
                  </div>
                  {!collapsedVoice && (
                    <ul
                      className="space-y-0.5 mb-3"
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes('text/concord-channel')) e.preventDefault();
                      }}
                      onDrop={(e) => onDropChannel(e, { parentId: null, siblings: uncategorized })}
                    >
                      {uncatVoice.map((ch) => renderChannel(ch, uncategorized, null))}
                    </ul>
                  )}
                </div>
              )}
            </>
          );
        })()}

        {/* Kategoriler ve altlarındaki kanallar */}
        {categories.map((cat) => (
          <CategorySection
            key={cat.id}
            category={cat}
            children={byParent[cat.id] ?? []}
            renderChannel={(ch) => renderChannel(ch, byParent[cat.id] ?? [], cat.id)}
            onDropEmpty={(e) => onDropChannel(e, { parentId: cat.id, siblings: byParent[cat.id] ?? [] })}
          />
        ))}
      </div>

      <VoiceStatusBar />
      <UserPanel />
    </aside>
  );
}

function CategorySection({
  category,
  children,
  renderChannel,
  onDropEmpty,
}: {
  category: APIChannel;
  children: APIChannel[];
  renderChannel: (ch: APIChannel) => React.ReactNode;
  onDropEmpty: (e: React.DragEvent) => void;
}) {
  const dispatch = useAppDispatch();
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  return (
    <section>
      <div
        onContextMenu={onContextMenu}
        className="px-2 mb-1 text-[11px] font-bold text-ink-tertiary uppercase tracking-[0.08em] flex items-center justify-between hover:text-ink-secondary group"
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          <ChevronDown
            size={10}
            className={'transition-transform ' + (collapsed ? '-rotate-90' : '')}
          />
          <span className="truncate">{category.name}</span>
        </button>
        <button
          type="button"
          onClick={() => dispatch(openModal('create_channel'))}
          title={t('channel.addToCategory')} aria-label={t('channel.addToCategory')}
          className="opacity-0 group-hover:opacity-100 text-base leading-none hover:text-ink-primary"
        >
          +
        </button>
      </div>
      {!collapsed && (
        <ul
          className="space-y-0.5 min-h-[8px]"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('text/concord-channel')) e.preventDefault();
          }}
          onDrop={onDropEmpty}
        >
          {children.map(renderChannel)}
        </ul>
      )}
      {menu && (
        <ChannelContextMenu
          channel={category}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

function VoiceConnectedRow({ userId, user }: { userId: string; user: any }) {
  const me = useAppSelector((s) => s.auth.user);
  const isSelf = userId === me?.id;
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === guildId));
  const member = useAppSelector((s) => (guildId ? s.members.byGuild[guildId]?.find((m) => m.user_id === userId) : null));
  const myRoleIds = useAppSelector((s) => (guildId ? s.members.byGuild[guildId]?.find((m) => m.user_id === me?.id)?.role_ids ?? [] : []));
  const roles = useAppSelector((s) => (guildId ? s.guildRoles?.byGuild?.[guildId] ?? [] : []));
  const dispatch = useAppDispatch();
  // Voice presence'ın taşıdığı görünen ad — ID→ad lookup'ı gerektirmez (en güvenilir kaynak)
  const voiceName = useAppSelector((s) => s.presence.voiceNamesByUser[userId]);
  // İsim çözümle: guild takma adı > üye adı > presence adı > props.user > tek-sefer çekilen
  const resolvedName = (member as any)?.nickname || member?.display_name || voiceName || user?.display_name;
  const [fetchedName, setFetchedName] = useState<string | null>(null);
  // Store'da yoksa kullanıcıyı tek sefer çek — "Yükleniyor…" takılı kalmasın
  useEffect(() => {
    if (isSelf || resolvedName) return;
    let cancelled = false;
    api.users.user(userId)
      .then((u) => {
        if (cancelled) return;
        setFetchedName(u.display_name);
        dispatch(upsertUser(u as any));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId, isSelf, resolvedName, dispatch]);
  const displayName = isSelf ? (me?.display_name ?? t('common.you')) : (resolvedName || fetchedName || t('common.loading'));
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(() => voice.getUserVolume(userId) === 0);
  const [volume, setVolume] = useState(() => Math.round(voice.getUserVolume(userId) * 100));
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [sv, setSv] = useState(() => voice.getServerVoice(userId));

  function changeVolume(v: number) {
    setVolume(v);
    setMuted(v === 0);
    voice.setUserVolume(userId, v / 100);
  }

  useEffect(() => {
    setSpeaking(voice.speakingSet().has(userId));
    const onSpeak = (ev: any) => { if (ev.userId === userId) setSpeaking(ev.speaking); };
    const onVs = (ev: any) => { if (String(ev.userId) === userId) setSv({ mute: ev.serverMute, deafen: ev.serverDeaf }); };
    voice.on('speaking:changed', onSpeak);
    voice.on('voiceState:changed', onVs);
    return () => { voice.off('speaking:changed', onSpeak); voice.off('voiceState:changed', onVs); };
  }, [userId]);

  // Yetki: owner / admin / MUTE_MEMBERS / DEAFEN_MEMBERS
  const myPerms = useMemo(() => {
    let p = 0n;
    for (const r of roles) {
      if (r.is_everyone || myRoleIds.includes(r.id)) {
        try { p |= BigInt(r.permissions); } catch { /* yoksay */ }
      }
    }
    return p;
  }, [roles, myRoleIds]);
  const isOwner = guild?.owner_id === me?.id;
  const isAdmin = isOwner || (myPerms & PERM.ADMINISTRATOR) !== 0n;
  const canMute = isAdmin || (myPerms & PERM.MUTE_MEMBERS) !== 0n;
  const canDeafen = isAdmin || (myPerms & PERM.DEAFEN_MEMBERS) !== 0n;

  function toggleLocalMute() {
    const next = !muted;
    setMuted(next);
    setVolume(next ? 0 : 100);
    voice.setUserVolume(userId, next ? 0 : 1);
    setMenu(null);
  }
  async function serverMute(mute: boolean) {
    setMenu(null);
    if (guildId) await api.guilds.setVoiceState(guildId, userId, { mute }).catch(() => {});
  }
  async function serverDeafen(deafen: boolean) {
    setMenu(null);
    if (guildId) await api.guilds.setVoiceState(guildId, userId, { deafen }).catch(() => {});
  }

  return (
    <li
      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}
      className="group flex items-center gap-1.5 px-2 py-0.5 text-xs text-ink-secondary relative"
    >
      <span
        className={
          'w-2 h-2 rounded-full transition-colors shrink-0 ' +
          (muted || sv.mute ? 'bg-ink-tertiary' : speaking ? 'bg-status-online ring-2 ring-status-online/40 animate-pulse' : 'bg-status-online')
        }
      />
      <span className={'truncate flex-1 ' + (muted ? 'opacity-50 line-through' : speaking ? 'text-status-online font-semibold' : '')}>
        {displayName}{isSelf && <span className="text-ink-tertiary"> (sen)</span>}
      </span>
      {sv.deafen && <span title={t('voice.serverDeafened')} aria-label={t('voice.serverDeafened')} className="shrink-0">🔇🎧</span>}
      {sv.mute && <span title={t('voice.serverMuted')} aria-label={t('voice.serverMuted')} className="shrink-0 text-accent-500">🔴</span>}
      {muted && !sv.mute && <span title={t('voice.mutedForYou')} aria-label={t('voice.mutedForYou')} className="shrink-0">🔇</span>}

      {menu && (
        <div className="fixed inset-0 z-50" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 200) }}
            className="absolute w-52 bg-surface-1 border border-line rounded-xl shadow-2xl p-1 text-sm"
          >
            {!isSelf && (
              <button onClick={toggleLocalMute} className="w-full text-left px-3 py-1.5 rounded-lg text-ink-primary hover:bg-surface-2">
                {muted ? '🔊 Sesi aç' : '🔇 Sustur'}{(canMute || canDeafen) ? ' (benim için)' : ''}
              </button>
            )}
            {!isSelf && (
              <div className="px-3 py-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-ink-tertiary">{t('voice.volume')}</span>
                  <span className="text-xs font-mono text-ink-secondary">{volume}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={volume}
                  onChange={(e) => changeVolume(parseInt(e.target.value, 10))}
                  className="w-full accent-brand-500"
                  aria-label={t('voice.userVolume')}
                />
              </div>
            )}
            {canMute && !isSelf && (
              <button onClick={() => serverMute(!sv.mute)} className="w-full text-left px-3 py-1.5 rounded-lg text-ink-primary hover:bg-surface-2">
                {sv.mute ? '🎙️ Sunucu susturmasını kaldır' : '🔴 Sunucuda Sustur'}
              </button>
            )}
            {canDeafen && !isSelf && (
              <button onClick={() => serverDeafen(!sv.deafen)} className="w-full text-left px-3 py-1.5 rounded-lg text-ink-primary hover:bg-surface-2">
                {sv.deafen ? '🎧 Sağırlaştırmayı kaldır' : '🎧 Sunucuda Sağırlaştır'}
              </button>
            )}
            {isSelf && <div className="px-3 py-1.5 text-ink-tertiary text-xs">{t('common.cannotActOnSelf')}</div>}
          </div>
        </div>
      )}
    </li>
  );
}

function ChannelButton({
  channel,
  active,
  Icon,
  connectedCount,
}: {
  channel: APIChannel;
  active: boolean;
  Icon: LucideIcon;
  connectedCount: number;
}) {
  const dispatch = useAppDispatch();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [inviteAt, setInviteAt] = useState<{ top: number; left: number } | null>(null);
  const readState = useAppSelector((s) => s.readStates.byChannel[channel.id]);
  const meId = useAppSelector((s) => s.auth.user?.id);
  const isOwner = useAppSelector(
    (s) => s.guilds.list.find((g) => g.id === channel.guild_id)?.owner_id === meId,
  );
  const unread =
    !active &&
    channel.last_message_id &&
    (!readState?.last_message_id || readState.last_message_id < channel.last_message_id);
  const mentionCount = readState?.mention_count ?? 0;

  function onContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  }

  function openInvite(e: React.MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setInviteAt({ top: r.bottom + 6, left: Math.max(8, r.right - 280) });
  }

  return (
    <>
      <button
        onClick={() => {
          dispatch(selectChannel(channel.id));
          // Discord davranışı: ses/sahne kanalına tıklamak = anında katıl
          if ((channel.type === 'voice' || channel.type === 'stage') && voice.channelId !== channel.id) {
            voice.connect(channel.id).catch(() => {});
          }
        }}
        onContextMenu={onContextMenu}
        className={clsx(
          'w-full text-left pl-3 pr-2 py-1.5 rounded-md flex items-center gap-2 transition-colors relative',
          active
            ? 'bg-brand-500/10 text-ink-primary'
            : unread
              ? 'text-ink-primary hover:bg-surface-2'
              : 'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary',
        )}
      >
        {unread && !active && (
          <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-2 rounded-r-full bg-ink-primary" />
        )}
        <Icon size={16} className={active ? 'text-brand-500' : 'text-ink-tertiary'} />
        <span className={clsx('text-sm truncate', unread ? 'font-semibold' : 'font-medium')}>
          {channel.name}
        </span>
        {channel.nsfw && <span className="text-[9px] text-accent-500 shrink-0" title={t('channel.nsfw')} aria-label={t('channel.nsfw')}>🔞</span>}
        {(channel.type === 'voice' || channel.type === 'stage') && (connectedCount > 0 || (channel.user_limit ?? 0) > 0) && (
          <span
            className={
              'ml-auto text-[10px] font-semibold ' +
              ((channel.user_limit ?? 0) > 0 && connectedCount >= (channel.user_limit ?? 0)
                ? 'text-accent-500'
                : 'text-brand-500')
            }
            title={(channel.user_limit ?? 0) > 0 ? `Kullanıcı limiti: ${channel.user_limit}` : undefined}
          >
            {connectedCount}
            {(channel.user_limit ?? 0) > 0 && `/${channel.user_limit}`}
          </span>
        )}
        {mentionCount > 0 && (
          <span className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center">
            {mentionCount > 99 ? '99+' : mentionCount}
          </span>
        )}
      </button>

      {/* Hover aksiyon ikonları (Discord: Kanala Davet Et + Kanalı Düzenle) */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <button
          onClick={openInvite}
          title={t('channel.invite')} aria-label={t('channel.invite')}
          className="w-5 h-5 flex items-center justify-center text-ink-tertiary hover:text-ink-primary"
        >
          <UserPlus size={15} />
        </button>
        {isOwner && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              dispatch(openChannelSettings(channel.id));
            }}
            title={t('channel.edit')} aria-label={t('channel.edit')}
            className="w-5 h-5 flex items-center justify-center text-ink-tertiary hover:text-ink-primary"
          >
            <Settings size={15} />
          </button>
        )}
      </div>

      {menu && (
        <ChannelContextMenu
          channel={channel}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
      )}
      {inviteAt && (
        <ChannelInvitePopover
          channel={channel}
          top={inviteAt.top}
          left={inviteAt.left}
          onClose={() => setInviteAt(null)}
        />
      )}
    </>
  );
}

function ChannelContextMenu({
  channel,
  x,
  y,
  onClose,
}: {
  channel: APIChannel;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const ref = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLevel, setNotifLevel] = useState<'all' | 'mentions' | 'nothing'>('all');

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  async function copyLink() {
    const url = `${location.origin}/channels/${channel.guild_id}/${channel.id}`;
    try {
      await navigator.clipboard.writeText(url);
      dispatch(addToast({ kind: 'success', message: t('channel.linkCopied') }));
    } catch {}
    onClose();
  }

  async function muteFor(seconds: number) {
    try {
      await api.channels.muteSettings(channel.id, {
        notif_level: 'nothing',
        mute_until_sec: seconds, // 0 = süresiz (açana kadar)
      });
      setMuted(true);
      dispatch(addToast({ kind: 'success', message: seconds > 0 ? t('channel.mutedTemp') : t('channel.muted') }));
    } catch {}
    onClose();
  }
  async function unmute() {
    try {
      await api.channels.muteSettings(channel.id, { notif_level: 'all', mute_until_sec: 0 });
      setMuted(false);
    } catch {}
    onClose();
  }
  async function setLevel(level: 'all' | 'mentions' | 'nothing') {
    try {
      await api.channels.muteSettings(channel.id, { notif_level: level });
      setNotifLevel(level);
      dispatch(addToast({ kind: 'success', message: t('channel.notifUpdated') }));
    } catch {}
    onClose();
  }

  async function doDelete() {
    if (!guildId) return;
    if (!confirm(`#${channel.name} kanalını silmek istediğine emin misin?`)) {
      onClose();
      return;
    }
    try {
      await api.channels.delete(channel.id);
      await dispatch(fetchChannels(guildId));
    } catch (e) {
      console.warn('delete channel', e);
    }
    onClose();
  }

  // Sağ tık menüsünü viewport içine sığdır
  const cardWidth = 220;
  const cardHeight = 320;
  let left = x;
  let top = y;
  if (left + cardWidth > window.innerWidth) left = window.innerWidth - cardWidth - 8;
  if (top + cardHeight > window.innerHeight) top = window.innerHeight - cardHeight - 8;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={ref}
        style={{ left, top, width: cardWidth }}
        className="absolute bg-surface-1 border border-line rounded-xl shadow-2xl p-1 pointer-events-auto ring-1 ring-white/5"
      >
        <CtxItem
          icon={<Pencil size={14} />}
          label="Kanal Ayarları"
          onClick={() => {
            dispatch(openChannelSettings(channel.id));
            onClose();
          }}
        />
        <CtxItem
          icon={<Lock size={14} />}
          label="Kanal İzinleri"
          onClick={() => {
            dispatch(openChannelPerms(channel.id));
            onClose();
          }}
        />
        <CtxItem
          icon={<Check size={14} />}
          label="Okundu İşaretle"
          onClick={() => {
            if (channel.last_message_id) {
              dispatch(ackChannel({ channelId: channel.id, lastMessageId: channel.last_message_id }));
            }
            onClose();
          }}
        />
        {muted ? (
          <CtxItem
            icon={<Bell size={14} />}
            label="Sesi Aç"
            onClick={unmute}
          />
        ) : (
          <>
            <CtxItem
              icon={<BellOff size={14} />}
              label="Kanalı Sustur"
              onClick={() => setMuteOpen((o) => !o)}
            />
            {muteOpen && (
              <div className="ml-6 mr-1 mb-1 rounded-lg bg-surface-2 border border-line overflow-hidden">
                {[
                  { label: '15 dakika', s: 15 * 60 },
                  { label: '1 saat', s: 60 * 60 },
                  { label: '3 saat', s: 3 * 60 * 60 },
                  { label: '8 saat', s: 8 * 60 * 60 },
                  { label: '24 saat', s: 24 * 60 * 60 },
                  { label: t('mute.untilReopen'), s: 0 },
                ].map((d) => (
                  <button
                    key={d.label}
                    onClick={() => muteFor(d.s)}
                    className="w-full text-left px-3 py-1.5 text-xs text-ink-secondary hover:bg-brand-500 hover:text-white transition-colors"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        <CtxItem
          icon={<Bell size={14} />}
          label="Bildirim Ayarları"
          onClick={() => setNotifOpen((o) => !o)}
        />
        {notifOpen && (
          <div className="ml-6 mr-1 mb-1 rounded-lg bg-surface-2 border border-line overflow-hidden">
            {[
              { level: 'all' as const, label: t('notif.allMessages') },
              { level: 'mentions' as const, label: t('notif.mentionsOnly') },
              { level: 'nothing' as const, label: t('notif.none') },
            ].map((o) => (
              <button
                key={o.level}
                onClick={() => setLevel(o.level)}
                className={
                  'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-brand-500 hover:text-white transition-colors ' +
                  (notifLevel === o.level ? 'text-brand-400' : 'text-ink-secondary')
                }
              >
                {o.label}
                {notifLevel === o.level && <Check size={12} />}
              </button>
            ))}
          </div>
        )}
        <CtxItem
          icon={<LinkIcon size={14} />}
          label="Davet Oluştur"
          onClick={() => {
            dispatch(openModal('invite_link'));
            onClose();
          }}
        />
        <CtxItem
          icon={<LinkIcon size={14} />}
          label="Kanal Linkini Kopyala"
          onClick={copyLink}
        />
        <CtxItem
          icon={<Copy size={14} />}
          label="Kanal ID'sini Kopyala"
          onClick={() => {
            navigator.clipboard?.writeText(channel.id).catch(() => {});
            dispatch(addToast({ kind: 'success', message: t('channel.idCopied') }));
            onClose();
          }}
        />
        <div className="my-1 h-px bg-line" />
        <CtxItem
          icon={<Trash2 size={14} />}
          label="Kanalı Sil"
          danger
          onClick={doDelete}
        />
      </div>
    </div>
  );
}

function CtxItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors',
        danger
          ? 'text-accent-500 hover:bg-accent-500/10'
          : 'text-ink-primary hover:bg-surface-2',
      )}
    >
      <span className={danger ? 'text-accent-500' : 'text-ink-tertiary'}>{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function GuildHeader() {
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === s.guilds.selectedId));
  const guildChannels = useAppSelector((s) =>
    guild ? s.channels.byGuild[guild.id] ?? [] : [],
  );
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [guildMuteOpen, setGuildMuteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (guild) setMuted(localStorage.getItem('concord_guildmute_' + guild.id) === '1');
  }, [guild?.id]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function markAllRead() {
    for (const c of guildChannels) {
      if (c.type !== 'category' && c.type !== 'voice' && c.last_message_id) {
        dispatch(ackChannel({ channelId: c.id, lastMessageId: c.last_message_id }));
      }
    }
    setOpen(false);
  }
  async function muteGuildFor(seconds: number) {
    if (!guild) return;
    setMuted(true);
    localStorage.setItem('concord_guildmute_' + guild.id, '1');
    await api.guilds.notifSettings(guild.id, 'nothing', seconds).catch(() => {});
    dispatch(addToast({ kind: 'success', message: seconds > 0 ? t('guild.mutedTemp') : t('guild.muted') }));
    setGuildMuteOpen(false);
    setOpen(false);
  }
  async function unmuteGuild() {
    if (!guild) return;
    setMuted(false);
    localStorage.setItem('concord_guildmute_' + guild.id, '0');
    await api.guilds.notifSettings(guild.id, 'all', 0).catch(() => {});
    setOpen(false);
  }
  async function leaveGuild() {
    if (!guild) return;
    if (!confirm(`"${guild.name}" sunucusundan ayrılmak istiyor musun?`)) return;
    try {
      await api.guilds.leave(guild.id);
      await dispatch(fetchGuilds());
      dispatch(switchToDM());
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || t('guild.leaveFailed') }));
    }
    setOpen(false);
  }

  if (!guild) {
    return (
      <div className="h-14 px-4 flex items-center border-b border-line">
        <h2 className="text-ink-tertiary font-semibold text-[15px]">{t('guild.select')}</h2>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          'w-full h-14 px-4 flex items-center gap-2 border-b border-line transition-colors relative overflow-hidden ' +
          (guild.banner_url ? 'hover:brightness-110' : 'hover:bg-surface-2 active:bg-surface-3')
        }
        style={
          guild.banner_url
            ? { background: `linear-gradient(to top, rgba(0,0,0,0.65), rgba(0,0,0,0.15)), url(${guild.banner_url}) center/cover` }
            : undefined
        }
      >
        <div className="flex-1 min-w-0 text-left">
          <h2 className={'font-semibold text-[15px] truncate ' + (guild.banner_url ? 'text-white drop-shadow' : 'text-ink-primary')}>
            {guild.name}
          </h2>
        </div>
        <ChevronDown
          size={18}
          className={'transition-transform ' + (guild.banner_url ? 'text-white' : 'text-ink-secondary') + (open ? ' rotate-180' : '')}
        />
      </button>

      {open && (
        <div className="absolute top-full left-2 right-2 mt-1 bg-surface-1 border border-line rounded-xl shadow-2xl p-1 z-50">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              dispatch(openModal('invite_link'));
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
          >
            <UserPlus size={16} className="text-brand-500" />
            <span className="text-sm font-medium">Arkadaşları Davet Et</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              dispatch(openModal('server_settings'));
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
          >
            <Settings size={16} className="text-brand-500" />
            <span className="text-sm font-medium">Sunucu Ayarları</span>
          </button>
          {muted ? (
            <button
              type="button"
              onClick={unmuteGuild}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
            >
              <Bell size={16} className="text-brand-500" />
              <span className="text-sm font-medium">Bildirimleri Aç</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setGuildMuteOpen((o) => !o)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
              >
                <BellOff size={16} className="text-brand-500" />
                <span className="text-sm font-medium flex-1">Sunucuyu Sustur</span>
                <span className="text-ink-tertiary text-xs">{guildMuteOpen ? '▾' : '▸'}</span>
              </button>
              {guildMuteOpen && (
                <div className="ml-6 mr-1 mb-1 rounded-lg bg-surface-2 border border-line overflow-hidden">
                  {[
                    { label: '15 dakika', s: 15 * 60 },
                    { label: '1 saat', s: 60 * 60 },
                    { label: '3 saat', s: 3 * 60 * 60 },
                    { label: '8 saat', s: 8 * 60 * 60 },
                    { label: '24 saat', s: 24 * 60 * 60 },
                    { label: t('mute.untilReopen'), s: 0 },
                  ].map((d) => (
                    <button
                      key={d.label}
                      onClick={() => muteGuildFor(d.s)}
                      className="w-full text-left px-3 py-1.5 text-xs text-ink-secondary hover:bg-brand-500 hover:text-white transition-colors"
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => { setProfileOpen(true); setOpen(false); }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
          >
            <Pencil size={16} className="text-brand-500" />
            <span className="text-sm font-medium">Sunucu Profilini Düzenle</span>
          </button>
          <button
            type="button"
            onClick={markAllRead}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
          >
            <Check size={16} className="text-brand-500" />
            <span className="text-sm font-medium">Tümünü Okundu İşaretle</span>
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(guild.id).catch(() => {});
              dispatch(addToast({ kind: 'success', message: 'Sunucu ID kopyalandı' }));
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2 text-ink-primary flex items-center gap-2"
          >
            <LinkIcon size={16} className="text-brand-500" />
            <span className="text-sm font-medium">Sunucu ID'sini Kopyala</span>
          </button>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            onClick={leaveGuild}
            className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent-500/10 text-accent-500 flex items-center gap-2"
          >
            <LogOut size={16} />
            <span className="text-sm font-medium">Sunucudan Ayrıl</span>
          </button>
        </div>
      )}
      {profileOpen && guild && (
        <GuildProfileModal guildId={guild.id} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}

function UserPanel() {
  const me = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const [status, setStatus] = useState<'online' | 'idle' | 'dnd' | 'offline'>(
    (me?.status as any) ?? 'online',
  );
  const [menuOpen, setMenuOpen] = useState(false);

  if (!me) return null;

  const statusColor: Record<string, string> = {
    online: 'bg-status-online',
    idle: 'bg-status-idle',
    dnd: 'bg-status-dnd',
    offline: 'bg-status-offline',
  };
  const statusLabel: Record<string, string> = {
    online: t('status.online'),
    idle: t('status.idle'),
    dnd: t('status.dnd'),
    offline: t('status.invisible'),
  };

  async function changeStatus(s: 'online' | 'idle' | 'dnd' | 'offline') {
    setStatus(s);
    setMenuOpen(false);
    // Presence'a anında yansıt — "Görünmez" (offline) seçilince diğerleri seni çevrimdışı görür
    setPresenceStatus(s);
    try {
      await api.updateStatus(s);
    } catch (e) {
      console.warn('status update', e);
    }
  }

  return (
    <div className="bg-surface-2 px-3 py-2.5 flex items-center gap-3 border-t border-line relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="relative shrink-0"
        title={t('status.change')} aria-label={t('status.change')}
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: me.avatar_color }}
        >
          {me.display_name.slice(0, 1).toUpperCase()}
        </div>
        {me.avatar_decoration && (
          <span className="absolute -top-1.5 -right-1.5 text-sm">{me.avatar_decoration}</span>
        )}
        <span
          className={
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-surface-2 ' +
            (statusColor[status] ?? 'bg-status-offline')
          }
        />
      </button>
      {menuOpen && (
        <div className="anim-pop-in absolute bottom-14 left-3 bg-surface-1 border border-line rounded-xl shadow-2xl p-1 z-30 w-44">
          {(['online', 'idle', 'dnd', 'offline'] as const).map((s) => (
            <button
              key={s}
              onClick={() => changeStatus(s)}
              className={
                'w-full text-left px-3 py-1.5 rounded flex items-center gap-2 ' +
                (s === status
                  ? 'bg-surface-2 text-ink-primary'
                  : 'text-ink-secondary hover:bg-surface-2 hover:text-ink-primary')
              }
            >
              <span className={'w-2 h-2 rounded-full ' + statusColor[s]} />
              <span className="text-sm">{statusLabel[s]}</span>
            </button>
          ))}
          <div className="h-px bg-line my-1" />
          <button
            onClick={() => { setMenuOpen(false); dispatch(openModal('user_settings')); }}
            className="w-full text-left px-3 py-1.5 rounded text-ink-secondary hover:bg-surface-2 hover:text-ink-primary text-sm"
          >
            {me.custom_status_text || me.custom_status_emoji ? t('status.editCustom') : t('status.setCustom')}
          </button>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-ink-primary text-sm font-semibold truncate">{me.display_name}</div>
        <div className="text-ink-tertiary text-xs truncate">
          {me.custom_status_text || me.custom_status_emoji ? (
            <span title={t('status.custom')} aria-label={t('status.custom')}>
              {me.custom_status_emoji ? me.custom_status_emoji + ' ' : ''}
              {me.custom_status_text}
            </span>
          ) : (
            statusLabel[status]
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dispatch(openModal('user_settings'))}
        title={t('settings.user')} aria-label={t('settings.user')}
        className="w-8 h-8 rounded-md hover:bg-surface-3 text-ink-secondary hover:text-brand-500 flex items-center justify-center transition-colors"
      >
        <Settings size={16} />
      </button>
      <button
        type="button"
        onClick={() => {
          if (confirm('Çıkış yapmak istediğine emin misin?')) dispatch(logout());
        }}
        title={t('common.logout')} aria-label={t('common.logout')}
        className="w-8 h-8 rounded-md hover:bg-surface-3 text-ink-secondary hover:text-accent-500 flex items-center justify-center transition-colors"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

// Kanal yanındaki "Kanala Davet Et" → arkadaş listesi + davet bağlantısı (kopyala) popover'ı
function ChannelInvitePopover({
  channel,
  top,
  left,
  onClose,
}: {
  channel: APIChannel;
  top: number;
  left: number;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDivElement>(null);
  const [friends, setFriends] = useState<
    { user_id: string; display_name: string; avatar_color: string; friendship: string }[]
  >([]);
  const [link, setLink] = useState('');
  const [sent, setSent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function k(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('keydown', k);
    };
  }, [onClose]);

  useEffect(() => {
    api.friends
      .list()
      .then((l) => setFriends(l.filter((f) => f.friendship === 'accepted')))
      .catch(() => setFriends([]));
    if (channel.guild_id) {
      api.guilds
        .createInvite(channel.guild_id, { max_uses: 0, expires_in_sec: 604800 })
        .then((inv) => setLink(`${location.host}/davet/${inv.code}`))
        .catch(() => {});
    }
  }, [channel.guild_id]);

  async function invite(userId: string) {
    if (!link) return;
    try {
      const dm = await api.dms.open(userId);
      await api.channels.sendMessage(dm.channel_id, link);
      setSent((s) => ({ ...s, [userId]: true }));
      dispatch(addToast({ kind: 'success', message: t('invite.sent') }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || t('common.sendFailed') }));
    }
  }

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(
      () => dispatch(addToast({ kind: 'success', message: t('common.linkCopied') })),
      () => {},
    );
  }

  return (
    <div
      ref={ref}
      style={{ top, left }}
      className="fixed z-50 w-72 bg-surface-1 border border-line rounded-xl shadow-2xl p-3"
    >
      <div className="text-xs font-bold text-ink-primary mb-2">
        Arkadaşlarını #{channel.name} kanalına davet et
      </div>
      <div className="max-h-52 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {friends.length === 0 ? (
          <p className="text-xs text-ink-tertiary py-3 text-center">Davet edilecek arkadaş yok.</p>
        ) : (
          friends.map((f) => (
            <div key={f.user_id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-surface-2">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                style={{ backgroundColor: f.avatar_color }}
              >
                {f.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="flex-1 text-sm text-ink-primary truncate">{f.display_name}</span>
              <button
                onClick={() => invite(f.user_id)}
                disabled={sent[f.user_id] || !link}
                className={
                  'px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 ' +
                  (sent[f.user_id]
                    ? 'bg-surface-3 text-ink-tertiary'
                    : 'bg-brand-500 hover:bg-brand-400 text-white disabled:opacity-50')
                }
              >
                {sent[f.user_id] ? t('common.sent') : 'Davet Et'}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="mt-2 pt-2 border-t border-line">
        <div className="text-[11px] text-ink-tertiary mb-1">veya bir davet bağlantısı yolla</div>
        <div className="flex gap-1.5">
          <input
            readOnly
            value={link}
            placeholder={t('invite.creating')}
            className="flex-1 bg-surface-2 border border-line rounded-md px-2 py-1.5 text-xs text-ink-primary font-mono"
          />
          <button
            onClick={copy}
            disabled={!link}
            className="px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-xs font-semibold"
          >
            Kopyala
          </button>
        </div>
      </div>
    </div>
  );
}
