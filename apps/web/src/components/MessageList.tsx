import { useEffect, useRef, useState } from 'react';
import { Hash, Smile, Pencil, Trash2, Check, X, Pin, MessagesSquare, Reply, Share2, ChevronDown, BarChart3 } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { ForwardModal } from './ForwardModal';
import { getLocale } from '../i18n';
import {
  useAppDispatch,
  useAppSelector,
  fetchReactions,
  toggleReactionThunk,
  updateMessage,
  removeMessage,
  openProfileCard,
  upsertUser,
  setReplyTo,
  acceptInviteThunk,
  addToast,
  selectGuild,
  setMode,
  markChannelUnread,
  loadOlderMessages,
  selectChannel,
} from '../store';
import { api, type APIReaction, type APIAttachment, type APIUser, type APIInvitePreview, type APIPoll, type APIPollAnswer, type RichEmbed } from '../api';
import { Markdown } from '../markdown';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀'];

export function MessageList() {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const mode = useAppSelector((s) => s.ui.mode);
  const channel = useAppSelector((s) =>
    mode === 'dm' && channelId
      ? { id: channelId, name: 'DM', type: 'text' as const, guild_id: '', position: 0, nsfw: false, rate_limit_sec: 0, created_at: '' }
      : guildId && channelId
        ? s.channels.byGuild[guildId]?.find((c) => c.id === channelId)
        : null,
  );
  const rawList = useAppSelector((s) => (channelId ? s.messages.byChannel[channelId] ?? [] : []));
  const initialLoading = useAppSelector(
    (s) => !!channelId && s.messages.loadingChannel === channelId && !(s.messages.byChannel[channelId]?.length),
  );
  const channelReadState = useAppSelector((s) => (channelId ? s.readStates.byChannel[channelId] : null));
  const ignoredUsers = useAppSelector((s) => s.ui.ignoredUsers);
  const list = ignoredUsers.length ? rawList.filter((m) => !ignoredUsers.includes(m.author_id)) : rawList;
  const users = useAppSelector((s) => s.users.byId);
  const me = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [nsfwOk, setNsfwOk] = useState<Set<string>>(new Set());
  const [olderLoading, setOlderLoading] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const loadingOlder = useRef(false);

  useEffect(() => {
    if (!channelId) return;
    api.channels.pins(channelId).then((p) => setPinnedIds(new Set(p.map((m) => m.id)))).catch(() => {});
  }, [channelId]);

  async function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
    if (el.scrollTop < 80 && !loadingOlder.current && channelId && list.length >= 50) {
      loadingOlder.current = true;
      setOlderLoading(true);
      const prevH = el.scrollHeight;
      const oldest = list[0]?.id;
      if (oldest) {
        await dispatch(loadOlderMessages(channelId, oldest));
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - prevH;
        });
      }
      loadingOlder.current = false;
      setOlderLoading(false);
    }
  }

  function scrollToBottom() {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }

  // "Mesaja git" — arama/sabit/yanıttan gelen jump isteği: elemana kaydır + vurgula.
  // Mesaj yüklü değilse birkaç kez eski mesajları yükleyip dener.
  useEffect(() => {
    async function onJump(e: Event) {
      const detail = (e as CustomEvent).detail as { messageId?: string; channelId?: string };
      if (!detail?.messageId || (detail.channelId && detail.channelId !== channelId)) return;
      const targetId = detail.messageId;
      for (let attempt = 0; attempt < 6; attempt++) {
        const el = document.getElementById('msg-' + targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('concord-jump-flash');
          setTimeout(() => el.classList.remove('concord-jump-flash'), 2000);
          return;
        }
        // Yüklü değil → eski mesajları getir ve tekrar dene
        const oldest = (scrollRef.current?.querySelector('li[id^="msg-"]') as HTMLElement | null)?.id?.slice(4);
        if (oldest && channelId) {
          await dispatch(loadOlderMessages(channelId, oldest));
          await new Promise((r) => setTimeout(r, 150));
        } else {
          break;
        }
      }
    }
    window.addEventListener('concord:jump-to-message', onJump as EventListener);
    return () => window.removeEventListener('concord:jump-to-message', onJump as EventListener);
  }, [channelId, dispatch]);

  const prevChannelRef = useRef(channelId);
  useEffect(() => {
    if (prevChannelRef.current !== channelId) {
      prevChannelRef.current = channelId;
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else if (atBottom && !loadingOlder.current) {
      // Yeni mesaj: sadece en alttaysak kaydır (eski mesaj yüklerken kaydırma)
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, channelId]);

  // Mesajlarda cache'de olmayan author'ları topluca çek (DM ve sunucu için)
  useEffect(() => {
    const missing = new Set<string>();
    for (const m of list) {
      if (!users[m.author_id] && m.author_id !== me?.id) missing.add(m.author_id);
    }
    if (missing.size === 0) return;
    let cancelled = false;
    (async () => {
      for (const id of missing) {
        try {
          const u = await api.users.user(id);
          if (!cancelled) {
            dispatch(
              upsertUser({
                id: u.id,
                username: u.username,
                email: '',
                display_name: u.display_name,
                avatar_color: u.avatar_color,
                avatar_url: u.avatar_url,
                bio: u.bio,
                status: u.status,
                bot: u.bot,
                created_at: u.created_at,
              } as APIUser),
            );
          }
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [list, users, me?.id, dispatch]);

  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-tertiary">
        Bir kanal seç
      </div>
    );
  }

  if (channel.nsfw && channelId && !nsfwOk.has(channelId)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
        <div className="w-14 h-14 rounded-2xl bg-accent-500/15 text-accent-500 flex items-center justify-center text-2xl">🔞</div>
        <h2 className="text-xl font-bold text-ink-primary">Yaş Sınırlı Kanal</h2>
        <p className="text-sm text-ink-secondary max-w-sm">
          Bu kanal hassas içerik barındırabilir. Devam etmek için 18 yaşından büyük olduğunu onayla.
        </p>
        <button
          onClick={() => setNsfwOk((s) => new Set(s).add(channelId))}
          className="mt-2 px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold"
        >
          18 yaşından büyüğüm, devam et
        </button>
      </div>
    );
  }

  // İlk yükleme + cache boş → Discord tarzı iskelet; cache varsa anında eski liste görünür
  if (initialLoading) {
    return (
      <div className="flex-1 overflow-hidden px-6 py-4" aria-label="Mesajlar yükleniyor" aria-busy="true">
        {[72, 40, 88, 56, 64, 32, 80, 48].map((w, i) => (
          <div key={i} className="flex gap-3 mb-6 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="w-10 h-10 rounded-full bg-surface-2 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-3.5 rounded bg-surface-2 mb-2" style={{ width: `${90 + (i % 3) * 30}px` }} />
              <div className="h-3 rounded bg-surface-2/70" style={{ width: `${w}%` }} />
              {i % 3 === 0 && <div className="h-3 rounded bg-surface-2/70 mt-1.5" style={{ width: `${Math.max(20, w - 30)}%` }} />}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
    {channelId && <ForumBackBar channelId={channelId} />}
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-6 py-4"
    >
      {olderLoading && (
        <div className="text-center text-xs text-ink-tertiary py-2 animate-pulse">Eski mesajlar yükleniyor…</div>
      )}
      {channel.type !== 'voice' && (
        <div className="mb-6 pb-6 border-b border-line">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/15 text-brand-500 flex items-center justify-center mb-3">
            <Hash size={28} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold text-ink-primary tracking-tight">#{channel.name}</h1>
          <p className="text-ink-secondary text-sm mt-1">
            Bu, <span className="text-ink-primary font-medium">#{channel.name}</span> kanalının başlangıcı.
          </p>
        </div>
      )}

      {list.length === 0 && (
        <div className="text-center text-ink-tertiary py-16">
          <p className="text-sm">Sessizlik... İlk mesajı sen yaz.</p>
        </div>
      )}

      <TypingIndicator />
      <UnreadDivider list={list} />
      <ul className="space-y-3">
        {list.map((m, i) => {
          const prev = list[i - 1];
          const author = users[m.author_id] ?? (m.author_id === me?.id ? me : null);
          const prevTs = prev ? new Date(prev.created_at).getTime() : 0;
          const curTs = new Date(m.created_at).getTime();
          const grouped = !!prev && prev.author_id === m.author_id && curTs - prevTs < 5 * 60 * 1000;
          // Yeni gün başladıysa tarih ayracı göster
          const showDateDivider =
            !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          // Sistem mesajı (örn. "X sunucuya katıldı") — ortalanmış, sade satır
          if ((m as any).system) {
            return (
              <div key={m.id}>
                {showDateDivider && <DateDivider date={new Date(m.created_at)} />}
                <div className="px-4 py-1.5 flex items-center gap-2 text-sm text-ink-tertiary">
                  <span className="text-status-online" aria-hidden>→</span>
                  <span>
                    {m.content}
                    <span className="ml-2 text-[10px]">
                      {new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id}>
              {showDateDivider && <DateDivider date={new Date(m.created_at)} />}
              <MessageItem
                messageId={m.id}
                authorId={m.author_id}
                authorName={m.webhook_username || author?.display_name || '...'}
                authorColor={author?.avatar_color ?? '#6B7280'}
                authorAvatar={m.webhook_avatar || author?.avatar_url}
                isBot={!!author?.bot}
                isWebhook={!!m.webhook_username}
                ts={curTs}
                editedAt={m.edited_at}
                content={m.content}
                attachments={m.attachments ?? []}
                embeds={m.embeds ?? []}
                grouped={grouped && !showDateDivider}
                repliedToId={m.replied_to_id}
                forwarded={!!(m as any).forwarded_from_message_id}
                pinned={pinnedIds.has(m.id)}
                publishedAt={m.published_at}
                isAnnouncement={channel?.type === 'announcement'}
              />
            </div>
          );
        })}
      </ul>
    </div>
    {channelReadState?.last_message_id && list.some((m) => m.id > channelReadState.last_message_id!) && (
      <button
        onClick={() => {
          document.getElementById('concord-unread-divider')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-accent-500 hover:brightness-110 text-white text-xs font-semibold shadow-lg flex items-center gap-1.5"
      >
        ↓ Yeni mesajlar — atla
      </button>
    )}
    {!atBottom && (
      <button
        onClick={scrollToBottom}
        className="absolute bottom-4 right-6 z-10 px-3 py-1.5 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold shadow-lg flex items-center gap-1.5"
      >
        <ChevronDown size={14} /> En alta atla
      </button>
    )}
    </div>
  );
}

// Forum gönderisi (thread) açıkken üstte "← Foruma dön" çubuğu
function ForumBackBar({ channelId }: { channelId: string }) {
  const dispatch = useAppDispatch();
  let ret: { forumId: string; threadId: string } | null = null;
  try {
    ret = JSON.parse(sessionStorage.getItem('concord_forum_return') || 'null');
  } catch {
    ret = null;
  }
  if (!ret || ret.threadId !== channelId) return null;
  return (
    <button
      onClick={() => {
        dispatch(selectChannel(ret!.forumId));
        try { sessionStorage.removeItem('concord_forum_return'); } catch { /* yoksay */ }
      }}
      className="shrink-0 flex items-center gap-1.5 px-4 py-2 border-b border-line bg-surface-1 text-sm text-ink-secondary hover:text-ink-primary"
    >
      <ChevronDown size={14} className="rotate-90" /> Foruma dön
    </button>
  );
}

function DateDivider({ date }: { date: Date }) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  let label: string;
  if (date.toDateString() === today.toDateString()) label = 'Bugün';
  else if (date.toDateString() === yesterday.toDateString()) label = 'Dün';
  else
    label = date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    });
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-line" />
      <span className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider">{label}</span>
      <div className="flex-1 h-px bg-line" />
    </div>
  );
}

function UnreadDivider({ list }: { list: any[] }) {
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const readState = useAppSelector((s) =>
    channelId ? s.readStates.byChannel[channelId] : null,
  );
  if (!readState?.last_message_id) return null;
  const firstUnreadIdx = list.findIndex((m) => m.id > readState.last_message_id!);
  if (firstUnreadIdx <= 0) return null;
  const m = list[firstUnreadIdx];
  return (
    <div id="concord-unread-divider" className="flex items-center gap-2 my-3" data-message-id={m.id}>
      <div className="flex-1 h-px bg-accent-500/60" />
      <span className="text-[10px] font-bold text-accent-500 uppercase tracking-wider">
        Yeni mesajlar
      </span>
      <div className="flex-1 h-px bg-accent-500/60" />
    </div>
  );
}

function TypingIndicator() {
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const me = useAppSelector((s) => s.auth.user);
  const users = useAppSelector((s) => s.users.byId);
  const typing = useAppSelector((s) => (channelId ? s.typing.byChannel[channelId] ?? [] : []));

  const others = typing.filter((t) => t.userId !== me?.id);
  if (others.length === 0) return null;

  const names = others
    .slice(0, 3)
    .map((t) => users[t.userId]?.display_name ?? 'biri')
    .join(', ');

  return (
    <div className="text-xs text-ink-tertiary px-2 mb-1 italic">
      <span className="inline-flex items-center gap-1.5">
        <span className="flex -space-x-1.5">
          {others.slice(0, 3).map((t) => {
            const u = users[t.userId];
            return (
              <span
                key={t.userId}
                title={u?.display_name}
                className="w-4 h-4 rounded-full ring-1 ring-bg flex items-center justify-center text-white text-[8px] font-bold"
                style={{ backgroundColor: u?.avatar_color ?? '#6B7280' }}
              >
                {(u?.display_name ?? '?').slice(0, 1).toUpperCase()}
              </span>
            );
          })}
        </span>
        <span className="flex gap-0.5">
          <span className="w-1 h-1 bg-ink-tertiary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 bg-ink-tertiary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 bg-ink-tertiary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
        {names} {others.length > 1 ? 'yazıyorlar...' : 'yazıyor...'}
      </span>
    </div>
  );
}

function MessageItem({
  messageId,
  authorId,
  authorName,
  authorColor,
  authorAvatar,
  isBot,
  isWebhook,
  ts,
  editedAt,
  content,
  attachments,
  embeds,
  grouped,
  repliedToId,
  forwarded,
  pinned,
  publishedAt,
  isAnnouncement,
}: {
  messageId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorAvatar?: string;
  isBot: boolean;
  isWebhook?: boolean;
  ts: number;
  editedAt?: string;
  content: string;
  attachments: APIAttachment[];
  embeds?: RichEmbed[];
  grouped: boolean;
  repliedToId?: string;
  forwarded?: boolean;
  pinned?: boolean;
  publishedAt?: string;
  isAnnouncement?: boolean;
}) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const reactions = useAppSelector((s) => s.reactions.byMessage[messageId] ?? []);
  const repliedTo = useAppSelector((s) =>
    repliedToId && channelId
      ? s.messages.byChannel[channelId]?.find((m) => m.id === repliedToId)
      : null,
  );
  const repliedAuthor = useAppSelector((s) =>
    repliedTo ? s.users.byId[repliedTo.author_id] : null,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullEmoji, setFullEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(content);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [remindMode, setRemindMode] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const isMine = me?.id === authorId;
  // Bu mesaj beni mi bahsediyor? (doğrudan mention veya @everyone/@here)
  const mentionsMe =
    !isMine &&
    !!me &&
    (content.includes(`<@${me.id}>`) || /@everyone\b|@here\b/.test(content));

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    dispatch(addToast({ kind: 'success', message: 'Kopyalandı' }));
    setCtx(null);
  }

  useEffect(() => {
    if (reactions.length === 0) dispatch(fetchReactions(messageId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  // ↑ ile "son mesajı düzenle" olayını dinle
  useEffect(() => {
    if (!isMine) return;
    function onEdit(e: Event) {
      if ((e as CustomEvent).detail?.id === messageId) {
        setEditValue(content);
        setEditing(true);
      }
    }
    window.addEventListener('concord:edit-message', onEdit);
    return () => window.removeEventListener('concord:edit-message', onEdit);
  }, [isMine, messageId, content]);

  function toggle(emoji: string) {
    const cur = reactions.find((r: APIReaction) => r.emoji === emoji);
    dispatch(toggleReactionThunk({ messageId, emoji, isAdding: !cur?.me }));
  }

  async function saveEdit() {
    const v = editValue.trim();
    if (!v || v === content) {
      setEditing(false);
      return;
    }
    try {
      const updated = await api.messages.edit(messageId, v);
      dispatch(updateMessage(updated));
      setEditing(false);
    } catch (e) {
      console.error('edit', e);
    }
  }

  async function doDelete() {
    if (!channelId) return;
    if (!confirm('Mesajı silmek istiyor musun?')) return;
    try {
      await api.messages.delete(messageId);
      dispatch(removeMessage({ channel_id: channelId, id: messageId }));
    } catch (e) {
      console.error('delete', e);
    }
  }

  function forwardMessage() {
    setForwardOpen(true);
  }

  async function translateMessage() {
    setCtx(null);
    if (!content.trim()) return;
    const target = getLocale(); // tr veya en
    setTranslated('…');
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(content)}`;
      const res = await fetch(url);
      const data = await res.json();
      const out = (data?.[0] ?? []).map((seg: any) => seg[0]).join('');
      setTranslated(out || '(çeviri yok)');
    } catch {
      setTranslated(null);
      dispatch(addToast({ kind: 'error', message: 'Çeviri başarısız' }));
    }
  }

  async function startThread() {
    if (!channelId) return;
    const name = prompt('Thread adı?');
    if (!name?.trim()) return;
    try {
      const t = await api.threads.create(channelId, {
        name: name.trim(),
        type: 'public_thread',
        starter_message_id: messageId,
      });
      // Yeni thread'e gir
      const guildId = (window as any).__concord_guildId;
      void guildId;
      dispatch({ type: 'channels/selectChannel', payload: t.id });
    } catch (e) {
      console.warn('start thread', e);
    }
  }

  async function remind(mins: number) {
    const when = new Date(Date.now() + mins * 60 * 1000).toISOString();
    try {
      await api.reminders.create(messageId, when);
      dispatch(addToast({ kind: 'success', message: 'Hatırlatıcı kuruldu ⏰' }));
    } catch {
      dispatch(addToast({ kind: 'error', message: 'Hatırlatıcı kurulamadı' }));
    }
    setRemindMode(false);
    setCtx(null);
  }

  async function togglePin() {
    try {
      await api.messages.pin(messageId);
    } catch (e) {
      // Zaten pin'liyse unpin'le
      try {
        await api.messages.unpin(messageId);
      } catch (e2) {
        console.warn('pin toggle', e2);
      }
    }
  }

  return (
    <li
      id={'msg-' + messageId}
      className={
        'group relative px-2 -mx-2 py-1 rounded transition-colors ' +
        (mentionsMe
          ? 'bg-brand-500/10 hover:bg-brand-500/15 border-l-2 border-brand-500'
          : 'hover:bg-surface-1/40')
      }
      onContextMenu={(e) => {
        if (editing) return;
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY });
      }}
      onDoubleClick={(e) => {
        // Discord kısayolu: mesaja çift tıkla → 👍 tepki (metin seçimi yoksa)
        if (editing || window.getSelection()?.toString()) return;
        if ((e.target as HTMLElement).closest('a,button,img,video,audio,input,textarea')) return;
        toggle('👍');
      }}
    >
      {repliedTo && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent('concord:jump-to-message', { detail: { messageId: repliedTo.id, channelId } }));
          }}
          className="flex items-center gap-1.5 text-xs text-ink-tertiary mb-1 pl-12 max-w-full hover:text-ink-secondary w-full text-left"
        >
          <span className="w-6 h-3 border-l-2 border-t-2 border-line rounded-tl-md inline-block ml-[-22px] shrink-0" />
          <span
            className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold shrink-0"
            style={{ backgroundColor: repliedAuthor?.avatar_color ?? '#6B7280' }}
          >
            {(repliedAuthor?.display_name ?? '?').slice(0, 1).toUpperCase()}
          </span>
          <span className="font-semibold text-ink-secondary">
            @{repliedAuthor?.display_name ?? '...'}
          </span>
          <span className="text-ink-tertiary truncate">{repliedTo.content || '<dosya>'}</span>
        </button>
      )}
      <div className="flex gap-3">
      {!grouped ? (
        <button
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
            dispatch(openProfileCard({ userId: authorId, anchorRect: rect }));
          }}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 hover:ring-2 hover:ring-brand-500/50 transition overflow-hidden"
          style={{ backgroundColor: authorAvatar ? undefined : authorColor }}
          title={authorName}
        >
          {authorAvatar ? (
            <img src={authorAvatar} alt={authorName} className="w-full h-full object-cover" />
          ) : (
            authorName.slice(0, 1).toUpperCase()
          )}
        </button>
      ) : (
        <div
          className="w-10 shrink-0 text-[10px] text-transparent group-hover:text-ink-tertiary text-right pr-2 leading-7 select-none"
          title={new Date(ts).toLocaleString('tr-TR')}
        >
          {formatTime(ts)}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {!grouped && (
          <div className="flex items-baseline gap-2 mb-1">
            <button
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                dispatch(openProfileCard({ userId: authorId, anchorRect: rect }));
              }}
              className="font-semibold text-ink-primary text-[15px] hover:underline"
            >
              {authorName}
            </button>
            {isWebhook ? (
              <span className="bg-accent-500/15 text-accent-500 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                WEBHOOK
              </span>
            ) : isBot && (
              <span className="bg-brand-500/15 text-brand-500 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                BOT
              </span>
            )}
            <span className="text-xs text-ink-tertiary">{formatFull(ts)}</span>
          </div>
        )}
        {pinned && (
          <div className="text-[11px] text-brand-400 flex items-center gap-1 mb-0.5">
            <Pin size={11} /> Sabitlenmiş
          </div>
        )}
        {forwarded && (
          <div className="text-[11px] text-ink-tertiary flex items-center gap-1 mb-0.5">
            <Share2 size={11} /> İletildi
          </div>
        )}
        {editing ? (
          <div className="flex items-center gap-2">
            <textarea
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  saveEdit();
                } else if (e.key === 'Escape') {
                  setEditing(false);
                  setEditValue(content);
                }
              }}
              rows={1}
              className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-ink-primary outline-none focus:border-brand-500/50 max-h-40 resize-none"
            />
            <button
              onClick={saveEdit}
              title="Kaydet" aria-label="Kaydet"
              className="w-7 h-7 rounded-md bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center"
            >
              <Check size={14} />
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditValue(content);
              }}
              title="İptal" aria-label="İptal"
              className="w-7 h-7 rounded-md bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        ) : isInviteOnly(content) ? (
          // İçerik yalnızca bir davet bağlantısıysa metin gösterme; aşağıda tek kart render edilir
          editedAt ? (
            <span className="text-[10px] text-ink-tertiary" title={new Date(editedAt).toLocaleString('tr-TR')}>
              (düzenlendi)
            </span>
          ) : null
        ) : (
          <div className="text-ink-primary leading-relaxed break-words">
            <Markdown content={content} />
            {editedAt && <EditedLabel messageId={messageId} editedAt={editedAt} />}
            {publishedAt && (
              <span
                className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide bg-surface-3 text-ink-tertiary rounded px-1 py-px align-middle"
                title={'Yayınlandı: ' + new Date(publishedAt).toLocaleString('tr-TR')}
              >
                📣 Yayınlandı
              </span>
            )}
          </div>
        )}
        {attachments.length > 0 && (
          <div
            className={
              'mt-2 gap-2 ' +
              (attachments.filter((a) => (a.content_type ?? '').startsWith('image/')).length >= 2
                ? 'grid grid-cols-2 max-w-md'
                : 'flex flex-wrap')
            }
          >
            {attachments.map((a) => (
              <AttachmentView key={a.id} a={a} />
            ))}
          </div>
        )}
        {translated && (
          <div className="mt-1 pl-2 border-l-2 border-brand-500/50 text-sm text-ink-secondary">
            <span className="text-[10px] uppercase font-bold text-ink-tertiary mr-1.5">çeviri</span>
            {translated}
            <button onClick={() => setTranslated(null)} className="text-[10px] text-ink-tertiary hover:text-ink-primary ml-2">gizle</button>
          </div>
        )}
        <InviteCard content={content} />
        {embeds && embeds.length > 0 && <RichEmbeds embeds={embeds} />}
        <EmbedsView messageId={messageId} content={content} />
        {!content?.trim() && attachments.length === 0 && <PollView messageId={messageId} />}
        {reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[...reactions].sort((a, b) => b.count - a.count).map((r: APIReaction) => (
              <ReactionChip key={r.emoji} messageId={messageId} reaction={r} onToggle={() => toggle(r.emoji)} />
            ))}
            <button
              onClick={() => setPickerOpen((v) => !v)}
              title="Tepki ekle" aria-label="Tepki ekle"
              className="px-2 py-0.5 rounded-full text-xs border border-line bg-surface-2 text-ink-tertiary hover:bg-surface-3 hover:text-ink-primary flex items-center"
            >
              <Smile size={13} />
            </button>
          </div>
        )}
      </div>

      <div className="opacity-0 group-hover:opacity-100 absolute right-2 top-1 flex gap-0.5 bg-surface-2 border border-line rounded-md transition-opacity">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-ink-primary rounded"
          title="Tepki ekle" aria-label="Tepki ekle"
        >
          <Smile size={14} />
        </button>
        <button
          onClick={() => dispatch(setReplyTo(messageId))}
          className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-brand-500 rounded"
          title="Yanıtla" aria-label="Yanıtla"
        >
          <Reply size={14} />
        </button>
        <button
          onClick={togglePin}
          className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-brand-500 rounded"
          title="Sabitle / Sabitlemeyi Kaldır" aria-label="Sabitle / Sabitlemeyi Kaldır"
        >
          <Pin size={14} />
        </button>
        <button
          onClick={startThread}
          className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-brand-500 rounded"
          title="Thread Başlat" aria-label="Thread Başlat"
        >
          <MessagesSquare size={14} />
        </button>
        <button
          onClick={forwardMessage}
          className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-brand-500 rounded"
          title="İlet" aria-label="İlet"
        >
          <Share2 size={14} />
        </button>
        {isMine && (
          <button
            onClick={() => setEditing(true)}
            className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-brand-500 rounded"
            title="Düzenle" aria-label="Düzenle"
          >
            <Pencil size={14} />
          </button>
        )}
        {isMine && (
          <button
            onClick={doDelete}
            className="hover:bg-surface-3 w-7 h-7 flex items-center justify-center text-ink-secondary hover:text-accent-500 rounded"
            title="Sil" aria-label="Sil"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {ctx && (
        <div className="fixed inset-0 z-50" onClick={() => { setCtx(null); setRemindMode(false); }} onContextMenu={(e) => { e.preventDefault(); setCtx(null); setRemindMode(false); }}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              left: Math.min(ctx.x, window.innerWidth - 230),
              top: Math.min(ctx.y, window.innerHeight - 360),
            }}
            className="anim-pop-in absolute w-56 bg-surface-1 border border-line rounded-xl shadow-2xl p-1 ring-1 ring-white/5 text-sm"
          >
            {remindMode ? (
              <>
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase text-ink-tertiary tracking-wider">Ne zaman hatırlatayım?</div>
                <MsgCtxItem label="⏰ 20 dakika sonra" onClick={() => remind(20)} />
                <MsgCtxItem label="⏰ 1 saat sonra" onClick={() => remind(60)} />
                <MsgCtxItem label="⏰ 3 saat sonra" onClick={() => remind(180)} />
                <MsgCtxItem label="⏰ Yarın" onClick={() => remind(60 * 24)} />
                <div className="my-1 h-px bg-line" />
                <MsgCtxItem label="← Geri" onClick={() => setRemindMode(false)} />
              </>
            ) : (
            <>
            <MsgCtxItem label="Yanıtla" onClick={() => { dispatch(setReplyTo(messageId)); setCtx(null); }} />
            <MsgCtxItem label="Tepki Ekle" onClick={() => { setCtx(null); setPickerOpen(true); }} />
            <MsgCtxItem label="Sabitle / Kaldır" onClick={() => { togglePin(); setCtx(null); }} />
            <MsgCtxItem label="Thread Başlat" onClick={() => { startThread(); setCtx(null); }} />
            <MsgCtxItem label="İlet" onClick={() => { forwardMessage(); setCtx(null); }} />
            {isAnnouncement && !publishedAt && (
              <MsgCtxItem
                label="📣 Yayınla"
                onClick={() => {
                  if (channelId) {
                    api.follows.crosspost(channelId, messageId)
                      .then((r) => dispatch(addToast({ kind: 'success', message: `Yayınlandı — ${r.delivered_to} takipçi kanala iletildi` })))
                      .catch((e: any) => dispatch(addToast({ kind: 'error', message: e?.message || 'Yayınlanamadı' })));
                  }
                  setCtx(null);
                }}
              />
            )}
            {isMine && <MsgCtxItem label="Düzenle" onClick={() => { setEditing(true); setCtx(null); }} />}
            <div className="my-1 h-px bg-line" />
            {content && <MsgCtxItem label="Metni Kopyala" onClick={() => copyToClipboard(content)} />}
            {content && <MsgCtxItem label="🌐 Çevir" onClick={translateMessage} />}
            <MsgCtxItem
              label="Bağlantıyı Kopyala"
              onClick={() => copyToClipboard(`${location.origin}/channels/${channelId}/${messageId}`)}
            />
            <MsgCtxItem label="Mesaj ID'sini Kopyala" onClick={() => copyToClipboard(messageId)} />
            <MsgCtxItem
              label="🔖 Kaydet"
              onClick={() => {
                api.savedMessages.save(messageId)
                  .then(() => dispatch(addToast({ kind: 'success', message: 'Mesaj kaydedildi' })))
                  .catch(() => dispatch(addToast({ kind: 'error', message: 'Kaydedilemedi' })));
                setCtx(null);
              }}
            />
            <MsgCtxItem label="👤 Profili Görüntüle" onClick={() => { dispatch(openProfileCard({ userId: authorId, anchorRect: null })); setCtx(null); }} />
            {!isMine && <MsgCtxItem label="@ Bahset" onClick={() => { window.dispatchEvent(new CustomEvent('concord:mention-user', { detail: { id: authorId } })); setCtx(null); }} />}
            <MsgCtxItem label="⏰ Beni Hatırlat" onClick={() => setRemindMode(true)} />
            {channelId && (
              <MsgCtxItem
                label="Okunmadı İşaretle"
                onClick={() => {
                  dispatch(markChannelUnread(channelId, messageId));
                  setCtx(null);
                }}
              />
            )}
            {isMine && (
              <>
                <div className="my-1 h-px bg-line" />
                <MsgCtxItem label="Mesajı Sil" danger onClick={() => { doDelete(); setCtx(null); }} />
              </>
            )}
            </>
            )}
          </div>
        </div>
      )}

      {forwardOpen && (
        <ForwardModal content={content} messageId={messageId} onClose={() => setForwardOpen(false)} />
      )}

      {pickerOpen && (
        <div className="absolute right-2 top-9 bg-surface-1 border border-line rounded-lg shadow-2xl p-1 flex gap-0.5 z-10 items-center">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                toggle(e);
                setPickerOpen(false);
              }}
              className="w-8 h-8 hover:bg-surface-2 rounded flex items-center justify-center text-lg"
            >
              {e}
            </button>
          ))}
          <button
            onClick={() => {
              setPickerOpen(false);
              setFullEmoji(true);
            }}
            title="Tüm emojiler" aria-label="Tüm emojiler"
            className="w-8 h-8 hover:bg-surface-2 rounded flex items-center justify-center text-ink-tertiary hover:text-ink-primary"
          >
            <Smile size={16} />
          </button>
        </div>
      )}
      {fullEmoji && (
        <div className="absolute right-2 top-9 z-20">
          <EmojiPicker
            onPick={(emoji) => {
              toggle(emoji);
              setFullEmoji(false);
            }}
            onClose={() => setFullEmoji(false)}
          />
        </div>
      )}
      </div>
    </li>
  );
}

function ReactionChip({ messageId, reaction, onToggle }: { messageId: string; reaction: APIReaction; onToggle: () => void }) {
  const [names, setNames] = useState<string | null>(null);
  const [burst, setBurst] = useState(0); // patlama tetikleyici
  async function loadNames() {
    if (names !== null) return;
    try {
      const us = await api.reactions.users(messageId, reaction.emoji);
      setNames(us.map((u) => u.display_name).join(', ') || ' ');
    } catch {
      setNames(' ');
    }
  }
  function handleClick() {
    // Tepki EKLENİYORSA (henüz ben vermediysem) süper-tepki patlaması
    if (!reaction.me) {
      setBurst((b) => b + 1);
      setTimeout(() => setBurst((b) => Math.max(0, b - 1)), 750);
    }
    onToggle();
  }
  return (
    <button
      onClick={handleClick}
      onMouseEnter={loadNames}
      title={names ? `${names} bu emojiyle tepki verdi` : undefined}
      className={
        'relative px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border transition-all active:scale-90 hover:scale-105 ' +
        (reaction.me
          ? 'bg-brand-500/15 border-brand-500/50 text-brand-500'
          : 'bg-surface-2 border-line text-ink-secondary hover:bg-surface-3')
      }
    >
      {burst > 0 && [...Array(6)].map((_, i) => (
        <span
          key={`${burst}-${i}`}
          className="concord-burst-particle"
          style={{ ['--bx' as any]: `${(i - 2.5) * 12}px`, animationDelay: `${i * 30}ms` }}
        >
          {reaction.emoji}
        </span>
      ))}
      <span>{reaction.emoji}</span>
      <span className="font-semibold">{reaction.count}</span>
    </button>
  );
}

function AttachmentView({ a }: { a: APIAttachment }) {
  const ct = a.content_type ?? '';
  const [lightbox, setLightbox] = useState(false);
  const isSpoiler = /^SPOILER_/i.test(a.filename ?? '');
  const [revealed, setRevealed] = useState(false);
  if (isSpoiler && !revealed) {
    return (
      <button
        onClick={() => setRevealed(true)}
        className="relative inline-flex items-center justify-center max-w-xs w-48 h-32 rounded-lg border border-line overflow-hidden group/sp"
      >
        {ct.startsWith('image/') && (
          <img src={a.url} alt="" className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60" />
        )}
        <span className="relative z-10 px-3 py-1 rounded-full bg-black/70 text-white text-xs font-bold uppercase tracking-wider group-hover/sp:bg-black/90">
          Spoiler
        </span>
      </button>
    );
  }
  if (ct.startsWith('image/')) {
    return (
      <>
        <div className="relative group/att inline-block max-w-xs">
          <img
            src={a.url}
            alt={a.filename}
            onClick={() => setLightbox(true)}
            className="rounded-lg max-h-80 border border-line cursor-zoom-in"
          />
          <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover/att:opacity-100 transition-opacity">
            <a
              href={a.url}
              download={a.filename}
              onClick={(e) => e.stopPropagation()}
              title="İndir" aria-label="İndir"
              className="w-7 h-7 rounded bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-xs"
            >
              ⬇
            </a>
            <button
              onClick={() => navigator.clipboard?.writeText(a.url)}
              title="Bağlantıyı kopyala" aria-label="Bağlantıyı kopyala"
              className="w-7 h-7 rounded bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
            >
              <Share2 size={12} />
            </button>
          </div>
        </div>
        {lightbox && (
          <div
            className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-6"
            onClick={() => setLightbox(false)}
          >
            <img src={a.url} alt={a.filename} className="max-w-full max-h-full rounded-lg" onClick={(e) => e.stopPropagation()} />
            <a
              href={a.url}
              download={a.filename}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-surface-1 text-ink-primary text-sm font-semibold"
            >
              İndir
            </a>
          </div>
        )}
      </>
    );
  }
  if (ct.startsWith('video/')) {
    return (
      <video controls src={a.url} className="rounded-lg max-h-80 max-w-md border border-line" />
    );
  }
  if (ct.startsWith('audio/')) {
    return (
      <div className="bg-surface-2 border border-line rounded-lg px-3 py-2 max-w-sm">
        <div className="text-xs text-ink-secondary mb-1 truncate">🎵 {a.filename}</div>
        <audio controls src={a.url} className="w-full h-8" />
      </div>
    );
  }
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 bg-surface-2 hover:bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm transition-colors"
    >
      <span className="text-ink-secondary">{fileIcon(a.filename)}</span>
      <span className="text-ink-primary font-medium truncate max-w-[200px]">{a.filename}</span>
      <span className="text-ink-tertiary text-xs">{formatBytes(a.size_bytes)}</span>
    </a>
  );
}

function fileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['pdf'].includes(ext)) return '📕';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return '📄';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📽️';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return '🎵';
  if (['js', 'ts', 'tsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'html', 'css', 'json'].includes(ext)) return '💻';
  return '📎';
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatFull(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  // Çok yeni mesajlar için göreli zaman
  const diffSec = Math.round((now.getTime() - ts) / 1000);
  if (diffSec >= 0 && diffSec < 60) return 'az önce';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
  if (d.toDateString() === now.toDateString()) return `Bugün ${formatTime(ts)}`;
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Dün ${formatTime(ts)}`;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


// "(düzenlendi)" etiketi — tıklayınca düzenleme geçmişini (eski sürümler) gösterir
function EditedLabel({ messageId, editedAt }: { messageId: string; editedAt: string }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<Array<{ id: string; old_content: string; edited_at: string }> | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    api.messages.edits(messageId).then(setEdits).catch(() => setEdits([]));
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, messageId]);

  return (
    <span className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] text-ink-tertiary ml-1 hover:text-brand-400 hover:underline"
        title={new Date(editedAt).toLocaleString('tr-TR')}
      >
        (düzenlendi)
      </button>
      {open && (
        <div className="absolute z-50 bottom-full left-0 mb-1 w-72 max-h-72 overflow-y-auto bg-surface-1 border border-line rounded-xl shadow-2xl p-2">
          <div className="text-[10px] uppercase font-bold text-ink-tertiary px-1 pb-1">Düzenleme Geçmişi</div>
          {edits === null ? (
            <p className="text-xs text-ink-tertiary p-2">Yükleniyor…</p>
          ) : edits.length === 0 ? (
            <p className="text-xs text-ink-tertiary p-2">Eski sürüm kaydı yok.</p>
          ) : (
            <ul className="space-y-1.5">
              {edits.map((e) => (
                <li key={e.id} className="bg-surface-2 rounded-lg p-2">
                  <div className="text-[10px] text-ink-tertiary mb-0.5">{new Date(e.edited_at).toLocaleString('tr-TR')}</div>
                  <div className="text-xs text-ink-secondary whitespace-pre-wrap break-words line-through decoration-ink-muted/40">{e.old_content}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  );
}

// Zengin embed (rich embed) render — renk şeridi, author, başlık, alanlar, footer
function RichEmbeds({ embeds }: { embeds: RichEmbed[] }) {
  return (
    <div className="mt-2 space-y-2">
      {embeds.map((e, idx) => {
        const color = typeof e.color === 'number' ? '#' + e.color.toString(16).padStart(6, '0') : '#00D9A6';
        return (
          <div
            key={idx}
            className="max-w-md bg-surface-2 border border-line rounded-r-lg rounded-l-sm p-3"
            style={{ borderLeft: `4px solid ${color}` }}
          >
            {e.author_name && (
              <div className="flex items-center gap-1.5 mb-1">
                {e.author_icon && <img src={e.author_icon} alt="" className="w-5 h-5 rounded-full object-cover" />}
                {e.author_url ? (
                  <a href={e.author_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-ink-primary hover:underline">{e.author_name}</a>
                ) : (
                  <span className="text-xs font-semibold text-ink-primary">{e.author_name}</span>
                )}
              </div>
            )}
            {e.title && (
              e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-500 hover:underline text-sm block">{e.title}</a>
              ) : (
                <div className="font-semibold text-ink-primary text-sm">{e.title}</div>
              )
            )}
            {e.description && <div className="text-xs text-ink-secondary mt-1 whitespace-pre-wrap break-words">{e.description}</div>}
            {e.fields && e.fields.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {e.fields.map((f, i) => (
                  <div key={i} className={f.inline ? '' : 'col-span-2'}>
                    <div className="text-[11px] font-bold text-ink-primary">{f.name}</div>
                    <div className="text-xs text-ink-secondary whitespace-pre-wrap break-words">{f.value}</div>
                  </div>
                ))}
              </div>
            )}
            {e.image_url && <img src={e.image_url} alt="" className="mt-2 rounded max-h-72 w-full object-cover" />}
            {e.thumbnail_url && !e.image_url && <img src={e.thumbnail_url} alt="" className="mt-2 rounded max-h-20 object-cover" />}
            {(e.footer_text || e.timestamp) && (
              <div className="flex items-center gap-1.5 mt-2 text-[10px] text-ink-tertiary">
                {e.footer_icon && <img src={e.footer_icon} alt="" className="w-4 h-4 rounded-full object-cover" />}
                {e.footer_text && <span>{e.footer_text}</span>}
                {e.footer_text && e.timestamp && <span>•</span>}
                {e.timestamp && <span>{new Date(e.timestamp).toLocaleString('tr-TR')}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmbedsView({ messageId, content }: { messageId: string; content: string }) {
  const [embeds, setEmbeds] = useState<Awaited<ReturnType<typeof api.embeds.forMessage>>>([]);

  useEffect(() => {
    if (!/https?:\/\//.test(content)) {
      setEmbeds([]);
      return;
    }
    // Mesaj geldikten birkaç saniye sonra embed'ler hazır olabilir (backend asenkron parse eder)
    let attempts = 0;
    const tick = async () => {
      try {
        const list = await api.embeds.forMessage(messageId);
        setEmbeds(list);
        if (list.length === 0 && attempts++ < 3) {
          setTimeout(tick, 2000);
        }
      } catch {}
    };
    tick();
  }, [messageId, content]);

  if (embeds.length === 0) return null;
  return (
    <div className="mt-2 space-y-2">
      {embeds.map((e) => (
        <a
          key={e.id}
          href={e.url}
          target="_blank"
          rel="noreferrer"
          className="block max-w-md bg-surface-2 hover:bg-surface-3 border-l-4 border-brand-500 border-y border-r border-line rounded-r-lg p-3 transition-colors"
        >
          {e.site_name && (
            <div className="text-[10px] uppercase font-semibold text-ink-tertiary tracking-wider mb-0.5">
              {e.site_name}
            </div>
          )}
          {e.title && <div className="font-semibold text-brand-500 text-sm">{e.title}</div>}
          {e.description && (
            <div className="text-xs text-ink-secondary mt-1 line-clamp-3">{e.description}</div>
          )}
          {e.image_url && (
            <img
              src={e.image_url}
              alt=""
              className="mt-2 rounded max-h-48 object-cover"
            />
          )}
        </a>
      ))}
    </div>
  );
}

function pollTimeLeft(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Anket bitti';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} dk kaldı`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} saat kaldı`;
  return `${Math.round(hrs / 24)} gün kaldı`;
}

// Anket kartı — mesaja bağlı anketi getirir, oy verme + sonuç çubukları
function PollView({ messageId }: { messageId: string }) {
  const me = useAppSelector((s) => s.auth.user);
  const [poll, setPoll] = useState<APIPoll | null>(null);
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState(false);
  const [voters, setVoters] = useState<Record<string, string>>({});

  async function loadVoters(answerId: string) {
    if (!poll || poll.anonymous || voters[answerId] !== undefined) return;
    try {
      const us = await api.polls.voters(poll.id, answerId);
      setVoters((v) => ({ ...v, [answerId]: us.map((u) => u.display_name).join(', ') || ' ' }));
    } catch {
      setVoters((v) => ({ ...v, [answerId]: ' ' }));
    }
  }

  useEffect(() => {
    let alive = true;
    api.polls
      .forMessage(messageId)
      .then((p) => { if (alive) setPoll(p); })
      .catch(() => { if (alive) setPoll(null); });
    return () => { alive = false; };
  }, [messageId, ver]);

  // Başka kullanıcı oy verince canlı güncelle (gateway → window event)
  useEffect(() => {
    function onUpdate(e: Event) {
      if ((e as CustomEvent).detail?.messageId === messageId) setVer((v) => v + 1);
    }
    window.addEventListener('concord:poll-update', onUpdate);
    return () => window.removeEventListener('concord:poll-update', onUpdate);
  }, [messageId]);

  if (!poll) return null;
  const total = poll.total_votes;

  async function vote(a: APIPollAnswer) {
    if (!poll || poll.expired || busy) return;
    setBusy(true);
    try {
      if (a.me_voted) await api.polls.unvote(poll.id, a.id);
      else await api.polls.vote(poll.id, a.id);
      setVer((v) => v + 1);
    } catch {
      /* yoksay */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 max-w-md bg-surface-2 border border-line rounded-xl p-3">
      <div className="font-semibold text-ink-primary mb-2 flex items-center gap-2">
        <BarChart3 size={15} className="text-brand-500 shrink-0" />
        <span className="break-words">{poll.question}</span>
      </div>
      <div className="space-y-1.5">
        {poll.answers.map((a) => {
          const pct = total > 0 ? Math.round((a.count / total) * 100) : 0;
          return (
            <button
              key={a.id}
              onClick={() => vote(a)}
              onMouseEnter={() => { if (a.count > 0) loadVoters(a.id); }}
              title={a.count > 0 && voters[a.id] && voters[a.id].trim() ? `Oy verenler: ${voters[a.id]}` : undefined}
              disabled={poll.expired || busy}
              className={
                'relative w-full text-left rounded-lg border overflow-hidden transition-colors ' +
                (a.me_voted ? 'border-brand-500' : 'border-line hover:border-brand-500/40') +
                (poll.expired ? ' cursor-default' : '')
              }
            >
              <div className="absolute inset-y-0 left-0 bg-brand-500/15 transition-all" style={{ width: pct + '%' }} />
              <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-ink-primary flex items-center gap-1.5 min-w-0">
                  {a.me_voted && <Check size={13} className="text-brand-500 shrink-0" />}
                  {a.emoji && <span className="shrink-0">{a.emoji}</span>}
                  <span className="truncate">{a.answer_text}</span>
                </span>
                <span className="text-xs text-ink-tertiary ml-2 shrink-0">{pct}% · {a.count}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-ink-tertiary mt-2 flex items-center justify-between">
        <span>{total} oy · {poll.allow_multiselect ? 'çoklu seçim' : 'tek seçim'}{poll.anonymous ? ' · anonim' : ''}</span>
        <span className="flex items-center gap-2">
          {!poll.expired && me?.id === poll.created_by && (
            <button
              onClick={async () => { if (confirm('Anketi şimdi kapatmak istiyor musun?')) { await api.polls.close(poll.id).catch(() => {}); setVer((v) => v + 1); } }}
              className="text-accent-400 hover:text-accent-500 font-medium"
            >
              Anketi kapat
            </button>
          )}
          <span>{poll.expired ? 'Anket bitti' : poll.expires_at ? pollTimeLeft(poll.expires_at) : ''}</span>
        </span>
      </div>
    </div>
  );
}

// Mesaj içeriğinde concord davet bağlantısı varsa Discord tarzı "Sunucuya Katıl" kartı göster.
const INVITE_RE = /(?:concord\.com|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)\/(?:invite|davet)\/([a-z0-9]{4,16})/i;

function MsgCtxItem({ label, danger, onClick }: { label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full text-left px-3 py-1.5 rounded-lg font-medium transition-colors ' +
        (danger ? 'text-accent-500 hover:bg-accent-500/10' : 'text-ink-primary hover:bg-surface-2')
      }
    >
      {label}
    </button>
  );
}

// İçerik sadece bir davet bağlantısından mı ibaret? (metin gizlenip yalnızca kart gösterilir)
function isInviteOnly(content: string): boolean {
  if (!INVITE_RE.test(content)) return false;
  return content.replace(INVITE_RE, '').trim() === '';
}

function InviteCard({ content }: { content: string }) {
  const dispatch = useAppDispatch();
  const myGuilds = useAppSelector((s) => s.guilds.list);
  const [preview, setPreview] = useState<APIInvitePreview | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);

  const match = content.match(INVITE_RE);
  const code = match?.[1] ?? null;
  const linkText = match?.[0] ?? '';

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    api.invites
      .preview(code)
      .then((p) => !cancelled && setPreview(p))
      .catch(() => !cancelled && setNotFound(true));
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code || notFound) return null;

  const joined = preview ? myGuilds.some((g) => g.id === preview.guild.id) : false;

  async function join() {
    if (!code || joining) return;
    setJoining(true);
    try {
      const guild = await dispatch(acceptInviteThunk(code)).unwrap();
      dispatch(setMode('guild'));
      dispatch(selectGuild(guild.id));
      dispatch(addToast({ kind: 'success', message: `${guild.name} sunucusuna katıldın` }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Katılınamadı' }));
    } finally {
      setJoining(false);
    }
  }

  const g = preview?.guild;
  const iconText = g?.name?.slice(0, 2).toUpperCase() ?? '';

  return (
   <div className="mt-1">
    {/* Tıklanınca katılan link (kartın üstünde) */}
    <a
      href={`https://${linkText}`}
      onClick={(e) => {
        e.preventDefault();
        join();
      }}
      className="text-sm text-brand-400 hover:underline break-all cursor-pointer"
    >
      {linkText}
    </a>
    <div className="mt-1 max-w-sm bg-surface-2 border border-line rounded-xl p-3">
      <div className="text-[10px] uppercase font-bold text-ink-tertiary tracking-wider mb-2">
        Bir sunucuya davet edildin
      </div>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-brand-500 flex items-center justify-center text-white font-bold shrink-0">
          {preview ? iconText : '…'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink-primary truncate">
            {preview ? g!.name : 'Yükleniyor...'}
          </div>
          {preview && (
            <div className="flex items-center gap-2.5 text-xs text-ink-tertiary mt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-status-online" />
                {preview.online_count} çevrimiçi
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-status-offline" />
                {preview.member_count} üye
              </span>
            </div>
          )}
          {preview?.channel && (
            <div className="text-xs text-ink-secondary truncate mt-0.5 flex items-center gap-1">
              <Hash size={11} className="shrink-0" />
              {preview.channel.name}
            </div>
          )}
        </div>
        {joined ? (
          <span className="px-3 py-2 rounded-lg bg-surface-3 text-ink-tertiary text-sm font-semibold shrink-0">
            Katıldın
          </span>
        ) : (
          <button
            onClick={join}
            disabled={joining || !preview}
            className="px-4 py-2 rounded-lg bg-status-online hover:brightness-110 disabled:opacity-60 text-white text-sm font-semibold shrink-0 transition"
          >
            {joining ? 'Katılınıyor...' : 'Sunucuya Katıl'}
          </button>
        )}
      </div>
      {preview && (
        <div className="mt-2 pt-2 border-t border-line text-[11px] text-ink-tertiary">
          Kuruluş:{' '}
          {new Date(preview.guild.created_at).toLocaleDateString('tr-TR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </div>
      )}
    </div>
   </div>
  );
}
