import { useEffect, useRef, useState } from 'react';
import { Hash, Volume2, Megaphone, MessagesSquare, Mic, Users, UserPlus, Bell, Search, AtSign, Pin, Clock, Menu, type LucideIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector, toggleMemberList, setMobileNav, openModal, openProfileCard, selectChannel, switchToGuild, switchToDM, selectDM } from '../store';
import { api, type APIPublicUser } from '../api';
import { t } from '../i18n';

const Icon: Record<string, LucideIcon> = {
  text: Hash,
  voice: Volume2,
  announcement: Megaphone,
  forum: MessagesSquare,
  stage: Mic,
  category: Hash,
};

export function ChannelHeader() {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const mode = useAppSelector((s) => s.ui.mode);
  const me = useAppSelector((s) => s.auth.user);
  const channel = useAppSelector((s) =>
    guildId && channelId ? s.channels.byGuild[guildId]?.find((c) => c.id === channelId) : null,
  );
  const showMembers = useAppSelector((s) => s.ui.showMemberList);
  const memberCount = useAppSelector((s) => (guildId ? s.members.byGuild[guildId]?.length ?? 0 : 0));
  const dispatch = useAppDispatch();
  const Ico = mode === 'dm' ? AtSign : channel ? Icon[channel.type] ?? Hash : Hash;

  const [dmPartner, setDmPartner] = useState<APIPublicUser | null>(null);
  useEffect(() => {
    if (mode !== 'dm' || !channelId || !me) {
      setDmPartner(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const dms = await api.dms.list();
        const dm = dms.find((d) => d.id === channelId);
        if (!dm) return;
        const otherId = dm.participants.find((p) => p !== me.id);
        if (!otherId) return;
        const u = await api.users.user(otherId);
        if (!cancelled) setDmPartner(u);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, channelId, me]);

  return (
    <header className="h-14 px-3 md:px-5 flex items-center gap-2 md:gap-3 border-b border-line bg-bg">
      <button
        onClick={() => dispatch(setMobileNav(true))}
        className="md:hidden w-8 h-8 -ml-1 rounded-lg flex items-center justify-center text-ink-secondary hover:bg-surface-2 shrink-0"
        title={t('common.menu')} aria-label={t('common.menu')}
      >
        <Menu size={20} />
      </button>
      <Ico size={20} className="text-ink-tertiary shrink-0" />
      <div className="flex items-baseline gap-3 min-w-0">
        <h1 className="text-ink-primary font-semibold truncate">
          {mode === 'dm'
            ? dmPartner?.display_name ?? (channelId ? t('common.loading') : t('dm.pickConversation'))
            : channel?.name ?? '—'}
        </h1>
        {channel?.type === 'announcement' && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-brand-500/15 text-brand-400 px-1.5 py-0.5 rounded shrink-0">
            Duyuru
          </span>
        )}
        {channel?.type === 'stage' && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-accent-500/15 text-accent-400 px-1.5 py-0.5 rounded shrink-0">
            🎙️ Sahne
          </span>
        )}
        {channel && channel.rate_limit_sec > 0 && (
          <span className="text-ink-tertiary text-[11px] flex items-center gap-0.5 shrink-0" title={t('channel.slowmodeActive')} aria-label={t('channel.slowmodeActive')}>
            <Clock size={12} /> {channel.rate_limit_sec}sn
          </span>
        )}
        {channel?.topic ? (
          <span className="text-ink-tertiary text-xs hidden md:inline truncate border-l border-line pl-3 max-w-md">
            {channel.topic}
          </span>
        ) : (
          <span className="text-ink-tertiary text-xs hidden md:inline">
            {mode === 'dm'
              ? dmPartner
                ? `@${dmPartner.username}`
                : ''
              : channel?.type === 'voice'
                ? t('channel.voiceChannel')
                : channel?.type === 'announcement'
                  ? t('channel.announcementChannel')
                  : t('channel.chat')}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {channel?.type === 'announcement' && (
          <button
            type="button"
            onClick={() => dispatch(openModal('follow_channel'))}
            title={t('channel.followHint')}
            aria-label={t('channel.follow')}
            className="h-9 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-secondary hover:text-ink-primary text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Megaphone size={16} />
            <span className="hidden md:inline">{t('channel.followBtn')}</span>
          </button>
        )}
        {channelId && mode !== 'dm' && <ThreadsButton channelId={channelId} />}
        {channelId && mode !== 'dm' && <PinsButton channelId={channelId} />}
        <button
          onClick={() => dispatch(openModal('search'))}
          title={t('common.search')} aria-label={t('common.search')}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors"
        >
          <Search size={18} />
        </button>
        <NotificationsBell />
        {guildId && (
          <button
            type="button"
            onClick={() => dispatch(openModal('invite_link'))}
            title={t('guild.createInviteLink')} aria-label={t('guild.createInviteLink')}
            className="h-9 px-3 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold flex items-center gap-1.5 transition-colors"
          >
            <UserPlus size={16} />
            <span>{t('guild.inviteBtn')}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => dispatch(toggleMemberList())}
          title={mode === 'dm' ? t('profile.toggle') : t('member.toggleList')}
          aria-label={mode === 'dm' ? t('profile.toggle') : t('member.toggleList')}
          className={
            'h-9 px-2 min-w-9 rounded-lg flex items-center justify-center gap-1 transition-colors text-ink-secondary ' +
            (showMembers ? 'bg-brand-500/15 text-brand-500' : 'hover:bg-surface-2 hover:text-ink-primary')
          }
        >
          <Users size={18} />
          {mode === 'guild' && memberCount > 0 && (
            <span className="text-[11px] font-semibold">{memberCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}

function NotificationsBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<import('../api').APINotification[]>([]);

  async function refreshCount() {
    try {
      const r = await api.notifications.count();
      setCount(r.unread);
    } catch {}
  }
  async function refreshList() {
    try {
      const list = await api.notifications.list();
      setItems(list);
    } catch {}
  }

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 15000);
    // Gerçek-zamanlı: yeni bildirim gelince (App → gateway → window) anında tazele
    function onNotif() { refreshCount(); }
    window.addEventListener('concord:notification', onNotif);
    return () => {
      clearInterval(t);
      window.removeEventListener('concord:notification', onNotif);
    };
  }, []);

  useEffect(() => {
    if (open) refreshList();
  }, [open]);

  async function markAll() {
    await api.notifications.markAllRead().catch(() => {});
    setCount(0);
    setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Bildirimler" aria-label="Bildirimler"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors relative"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-80 max-h-[480px] flex flex-col bg-surface-1 border border-line rounded-xl shadow-2xl z-30">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
            <h3 className="font-semibold text-ink-primary">{t('settings.notifications')}</h3>
            {count > 0 && (
              <button onClick={markAll} className="text-xs text-brand-500 hover:underline">
                Hepsini okundu işaretle
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="text-sm text-ink-tertiary px-4 py-6 text-center">Yeni bildirim yok.</p>
            ) : (
              <ul>
                {items.map((n) => (
                  <NotificationItem key={n.id} n={n} />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ n }: { n: import('../api').APINotification }) {
  const dispatch = useAppDispatch();
  const unread = !n.read_at;
  const actor = n.actor_display_name ?? n.actor_username ?? 'Birisi';
  const color = n.actor_avatar_color ?? '#6B7280';
  // Mesaj veya mention bildirimine tıklayınca kanala git
  function goToMessage() {
    if (!n.channel_id) return;
    // Çapraz-sunucu/DM jump: önce doğru sunucuya/DM'e geç
    if (n.guild_id) {
      dispatch(switchToGuild(n.guild_id));
    } else {
      dispatch(switchToDM());
      dispatch(selectDM(n.channel_id));
    }
    dispatch(selectChannel(n.channel_id));
    setTimeout(() => {
      if (n.message_id) {
        const el = document.getElementById('msg-' + n.message_id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-brand-500/20');
          setTimeout(() => el.classList.remove('bg-brand-500/20'), 1500);
        }
      }
    }, 600);
  }

  let title = '';
  let body = '';
  if (n.type === 'mention') {
    const where = n.channel_name
      ? `#${n.channel_name}${n.guild_name ? ` · ${n.guild_name}` : ''}`
      : '';
    title = `${actor} senden bahsetti`;
    body = n.message_preview ? `${where} — ${n.message_preview}` : where;
  } else if (n.type === 'friend_request') {
    title = `${actor} sana arkadaşlık isteği gönderdi`;
  } else if (n.type === 'reply') {
    title = `${actor} mesajına yanıt verdi`;
    body = n.message_preview ?? '';
  } else if (n.type === 'reminder') {
    title = '⏰ Hatırlatma';
    const where = n.channel_name ? `#${n.channel_name}` : '';
    body = n.message_preview ? `${where} — ${n.message_preview}` : (where || 'Kaydettiğin mesaj');
  } else {
    title = n.type;
    body = n.message_preview ?? '';
  }

  function onClick() {
    if (n.type === 'friend_request' && n.actor_id) {
      dispatch(openProfileCard({ userId: n.actor_id, anchorRect: null }));
    } else if (n.channel_id) {
      goToMessage();
    }
  }

  const dt = new Date(n.created_at);
  const rel = formatRel(dt);

  return (
    <li>
      <button
        onClick={onClick}
        className={
          'w-full text-left px-4 py-3 flex gap-3 border-b border-line hover:bg-surface-2 transition-colors ' +
          (unread ? 'bg-brand-500/5' : '')
        }
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: color }}
        >
          {actor.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-ink-primary leading-snug">{title}</div>
          {body && (
            <div className="text-xs text-ink-tertiary truncate mt-0.5">{body}</div>
          )}
          <div className="text-[10px] text-ink-muted mt-1">{rel}</div>
        </div>
        {unread && <span className="w-2 h-2 rounded-full bg-brand-500 mt-2 shrink-0" />}
      </button>
    </li>
  );
}

function formatRel(d: Date): string {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'şimdi';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} gün önce`;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
}

function PinsButton({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<import('../api').APIMessage[]>([]);
  const users = useAppSelector((s) => s.users.byId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [count, setCount] = useState(0);
  useEffect(() => {
    api.channels.pins(channelId).then((p) => { setItems(p); setCount(p.length); }).catch(() => {});
  }, [channelId]);
  useEffect(() => {
    if (!open) return;
    api.channels.pins(channelId).then((p) => { setItems(p); setCount(p.length); }).catch(() => {});
  }, [open, channelId]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('msg.pinnedMessages')} aria-label={t('msg.pinnedMessages')}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors relative"
      >
        <Pin size={18} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-brand-500 text-white text-[9px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-96 max-h-[500px] flex flex-col bg-surface-1 border border-line rounded-xl shadow-2xl z-30">
          <div className="px-4 py-3 border-b border-line">
            <h3 className="font-semibold text-ink-primary text-sm">Sabitlenmiş Mesajlar</h3>
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
                Bu kanalda sabitlenmiş mesaj yok.
              </p>
            ) : (
              <ul>
                {items.map((m) => {
                  const u = users[m.author_id];
                  const name = u?.display_name ?? '…';
                  const color = u?.avatar_color ?? '#6B7280';
                  return (
                    <li
                      key={m.id}
                      className="px-4 py-3 border-b border-line hover:bg-surface-2 cursor-pointer"
                      onClick={() => {
                        setOpen(false);
                        setTimeout(() => {
                          window.dispatchEvent(new CustomEvent('concord:jump-to-message', { detail: { messageId: m.id, channelId } }));
                        }, 100);
                      }}
                    >
                      <div className="flex gap-2.5 items-start">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-ink-primary">{name}</span>
                            <span className="text-[10px] text-ink-tertiary">
                              {new Date(m.created_at).toLocaleDateString('tr-TR', {
                                day: '2-digit',
                                month: 'short',
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-ink-secondary break-words mt-0.5 whitespace-pre-wrap line-clamp-3">
                            {m.content}
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            await api.messages.unpin(m.id).catch(() => {});
                            setItems((xs) => xs.filter((x) => x.id !== m.id));
                          }}
                          title={t('msg.unpin')} aria-label={t('msg.unpin')}
                          className="text-ink-tertiary hover:text-accent-500 text-xs shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadsButton({ channelId }: { channelId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.threads.list>>>([]);
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api.threads.list(channelId).then(setItems).catch(() => setItems([]));
  }, [open, channelId]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Thread'ler" aria-label="Thread'ler"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-secondary hover:bg-surface-2 hover:text-ink-primary transition-colors"
      >
        <MessagesSquare size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-80 max-h-[420px] flex flex-col bg-surface-1 border border-line rounded-xl shadow-2xl z-30">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <h3 className="font-semibold text-ink-primary text-sm">Aktif Thread'ler</h3>
            <span className="text-xs text-ink-tertiary">{items.length}</span>
          </div>
          <div className="overflow-y-auto flex-1">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-tertiary">
                Henüz thread yok. Bir mesajın yanındaki 💬 ikonuyla başlat.
              </p>
            ) : (
              <ul>
                {items.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => {
                        dispatch(selectChannel(t.id));
                        setOpen(false);
                      }}
                      className="w-full px-4 py-3 text-left border-b border-line hover:bg-surface-2 flex items-start gap-2"
                    >
                      <MessagesSquare size={14} className="text-ink-tertiary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink-primary truncate">{t.name}</div>
                        <div className="text-[10px] text-ink-tertiary mt-0.5">
                          {(t.message_count ?? 0)} mesaj · {(t.member_count ?? 0)} katılımcı
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
