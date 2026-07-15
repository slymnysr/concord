import { useEffect, useRef, useState } from 'react';
import { Volume2, ScreenShare, Video, PhoneCall, Mic, Users, MessageCircle, X } from 'lucide-react';
import { voice } from './voice';
import { ServerRail } from './components/ServerRail';
import { ChannelList } from './components/ChannelList';
import { ChannelHeader } from './components/ChannelHeader';
import { MessageList } from './components/MessageList';
import { MessageInput } from './components/MessageInput';
import { MemberList } from './components/MemberList';
import { AuthPage } from './pages/AuthPage';
import { Modal } from './components/Modal';
import { OnboardingGate } from './components/OnboardingGate';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DMSidebar } from './components/DMSidebar';
import { DMUserPanel } from './components/DMUserPanel';
import { DiscoverSidebar, DiscoverContent } from './components/DiscoverPage';
import { ForumView } from './components/ForumView';
import { MediaView } from './components/MediaView';
import { StageView } from './components/StageView';
import { QuickSwitcher } from './components/QuickSwitcher';
import { UserProfileCard } from './components/UserProfileCard';
import { ToastContainer } from './components/Toast';
import { ReconnectBanner } from './components/ReconnectBanner';
import {
  useAppDispatch,
  useAppSelector,
  fetchMe,
  fetchGuilds,
  fetchChannels,
  fetchMessages,
  fetchMembers,
  fetchReactions,
  pushMessage,
  updateMessage,
  removeMessage,
  upsertUser,
  setGuildPresence,
  setTyping,
  pruneTyping,
  openProfileCard,
  openModal,
  addToast,
  selectChannel,
  selectGuild,
  fetchReadStates,
  ackChannel,
  setMobileNav,
  toggleMemberList,
  fetchGuildRoles,
} from './store';
import { tokenStore, api } from './api';
import { connectGateway, joinGuild, joinUser, disconnectGateway, onGuildEvent, joinDMChannel, leaveDMChannel, setPresenceStatus } from './gateway';
import { playMessageSound, playMentionSound, showDesktopNotification } from './notifSound';
import { playSound, stopAllSounds, soundsPlaying, onSoundboardChange } from './soundboardAudio';

export default function App() {
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const channels = useAppSelector((s) => (guildId ? s.channels.byGuild[guildId] : undefined));
  const channel = channels?.find((c) => c.id === channelId);
  const mode = useAppSelector((s) => s.ui.mode);
  const showMembers = useAppSelector((s) => s.ui.showMemberList);
  const mobileNav = useAppSelector((s) => s.ui.mobileNav);
  const profileCardUserId = useAppSelector((s) => s.ui.profileCardUserId);
  const profileCardAnchor = useAppSelector((s) => s.ui.profileCardAnchor);

  // F5 flash önlemi: token varsa /me tamamlanana kadar splash göster
  const [bootChecking, setBootChecking] = useState<boolean>(!!tokenStore.access() && !user);

  useEffect(() => {
    if (tokenStore.access() && !user) {
      dispatch(fetchMe()).finally(() => setBootChecking(false));
    } else {
      setBootChecking(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Login sonrası guild'leri çek + user kanalına abone ol + read states
  useEffect(() => {
    if (user) {
      dispatch(fetchGuilds());
      dispatch(fetchReadStates());
      connectGateway();
      joinUser(user.id, {
        onDMMessage: (event: any) => {
          if (event.author) dispatch(upsertUser(event.author));
          if (event.message) {
            dispatch(pushMessage(event.message));
            // Başka kullanıcıdan DM → ses + masaüstü bildirimi
            if (event.message.author_id !== user.id) {
              playMentionSound();
              const who = event.author?.display_name ?? 'Yeni mesaj';
              showDesktopNotification(who, event.message.content || '📎 Dosya');
            }
          }
        },
        onNotification: (ev: any) => {
          // Bildirim gelen-kutusu (NotificationsBell) bu olayı dinler
          window.dispatchEvent(new CustomEvent('concord:notification', { detail: ev }));
          // Hatırlatıcı / mention bildirimi → ses + masaüstü bildirimi
          const n = ev?.notification;
          if (n?.type === 'reminder') {
            playMentionSound();
            showDesktopNotification('⏰ Hatırlatma', n.message_preview || 'Kaydettiğin mesajı hatırlatıyorum');
          }
        },
      });
    }
    return () => {
      if (!user) disconnectGateway();
    };
  }, [user, dispatch]);

  // Guild seçiminde kanalları + üyeleri çek + gateway topic'e abone ol
  useEffect(() => {
    if (!guildId) return;
    dispatch(fetchChannels(guildId));
    dispatch(fetchMembers(guildId));
    dispatch(fetchGuildRoles(guildId));
    joinGuild(guildId, {
      onMessage: (event: any) => {
        if (event.author) dispatch(upsertUser(event.author));
        if (event.message) {
          dispatch(pushMessage(event.message));
          const msg = event.message;
          if (msg.author_id !== user!.id) {
            const mentioned =
              msg.content?.includes(`<@${user!.id}>`) ||
              msg.content?.includes('@everyone') ||
              msg.content?.includes('@here');
            if (mentioned) {
              playMentionSound();
              const who = event.author?.display_name ?? 'Biri';
              showDesktopNotification(`${who} seni etiketledi`, msg.content || '');
            } else if (msg.channel_id !== channelId) playMessageSound();
          }
        }
      },
      onPresence: (ids, activities, statuses) => {
        dispatch(setGuildPresence({ guildId, userIds: Array.from(ids), activities, statuses }));
      },
    });
    const offEdit = onGuildEvent(guildId, 'MESSAGE_UPDATE', (ev: any) => {
      if (ev.message) dispatch(updateMessage(ev.message));
    });
    const offDel = onGuildEvent(guildId, 'MESSAGE_DELETE', (ev: any) => {
      if (ev.message) {
        dispatch(removeMessage({ channel_id: ev.message.channel_id, id: ev.message.id }));
      }
    });
    const offReactAdd = onGuildEvent(guildId, 'REACTION_ADD', (ev: any) => {
      if (ev.message_id) dispatch(fetchReactions(ev.message_id));
    });
    const offPoll = onGuildEvent(guildId, 'POLL_UPDATE', (ev: any) => {
      if (ev.message_id) window.dispatchEvent(new CustomEvent('concord:poll-update', { detail: { messageId: String(ev.message_id) } }));
    });
    // Kanal oluşturma/güncelleme/silme → kanal listesini gerçek-zamanlı tazele
    const offChCreate = onGuildEvent(guildId, 'CHANNEL_CREATE', () => dispatch(fetchChannels(guildId)));
    const offChUpdate = onGuildEvent(guildId, 'CHANNEL_UPDATE', () => dispatch(fetchChannels(guildId)));
    const offChDelete = onGuildEvent(guildId, 'CHANNEL_DELETE', () => dispatch(fetchChannels(guildId)));
    // Sunucu susturma/sağırlaştırma olayı → voice durumu UI'da güncellensin (gerekirse presence tazele)
    const offVoiceState = onGuildEvent(guildId, 'GUILD_VOICE_STATE_UPDATE', (ev: any) => {
      if (ev.user_id) window.dispatchEvent(new CustomEvent('concord:guild-voice-state', { detail: ev }));
    });
    const offReactRem = onGuildEvent(guildId, 'REACTION_REMOVE', (ev: any) => {
      if (ev.message_id) dispatch(fetchReactions(ev.message_id));
    });
    const offTyping = onGuildEvent(guildId, 'TYPING_START', (ev: any) => {
      if (ev.user_id && ev.channel_id) {
        dispatch(setTyping({ channelId: ev.channel_id, userId: ev.user_id }));
      }
    });
    // Soundboard event: kanaldaki herkes için ses çal. Gönderen kendi event'ini atlar
    // (zaten tıklarken lokal çaldı, çift çalmasın).
    const offSound = onGuildEvent(guildId, 'SOUNDBOARD_PLAY', (ev: any) => {
      if (ev?.sound?.file_url && String(ev.user_id) !== String(user!.id)) {
        playSound(ev.sound.file_url, ev.sound.volume ?? 1);
      }
    });
    const pruneInterval = setInterval(() => dispatch(pruneTyping()), 1000);
    return () => {
      offEdit();
      offDel();
      offReactAdd();
      offPoll();
      offChCreate();
      offChUpdate();
      offChDelete();
      offVoiceState();
      offSound();
      offReactRem();
      offTyping();
      clearInterval(pruneInterval);
    };
  }, [guildId, dispatch]);

  // Kanal seçiminde mesajları çek + ACK (okundu işaretle)
  const lastMsgId = useAppSelector((s) => {
    if (!channelId) return null;
    const list = s.messages.byChannel[channelId];
    return list && list.length > 0 ? list[list.length - 1].id : null;
  });
  useEffect(() => {
    if (!channelId) return;
    dispatch(fetchMessages(channelId));
  }, [channelId, dispatch]);
  useEffect(() => {
    if (channelId && lastMsgId) {
      dispatch(ackChannel({ channelId, lastMessageId: lastMsgId }));
    }
  }, [channelId, lastMsgId, dispatch]);

  // Markdown'da :emoji: render'ı için guild özel emojilerini global'e yükle
  useEffect(() => {
    if (!guildId) return;
    api.emojis
      .list(guildId)
      .then((list) => {
        (window as any).__concord_emojis = { ...((window as any).__concord_emojis ?? {}), [guildId]: list };
      })
      .catch(() => {});
  }, [guildId]);

  // Tarayıcı sekme başlığında okunmamış bildirim sayısı
  useEffect(() => {
    if (!user) return;
    let stop = false;
    async function tick() {
      try {
        const r = await api.notifications.count();
        if (!stop) document.title = r.unread > 0 ? `(${r.unread}) Concord` : 'Concord';
      } catch {}
    }
    tick();
    const t = setInterval(tick, 20000);
    return () => {
      stop = true;
      clearInterval(t);
      document.title = 'Concord';
    };
  }, [user]);

  // Ctrl/Cmd+K hızlı geçiş
  const [quickOpen, setQuickOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        dispatch(openModal('user_settings'));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  // Alt+↑/↓ ile kanal değiştir (Discord paritesi)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      if (mode !== 'guild' || !channels) return;
      const selectable = channels.filter((c) => c.type !== 'category');
      if (selectable.length === 0) return;
      e.preventDefault();
      const idx = selectable.findIndex((c) => c.id === channelId);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = selectable[(idx + delta + selectable.length) % selectable.length];
      if (next) dispatch(selectChannel(next.id));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channels, channelId, mode, dispatch]);

  // Ctrl/Cmd+Alt+↑/↓ ile sunucu değiştir (Discord paritesi)
  const guildList = useAppSelector((s) => s.guilds.list);
  const selectedGuildId = useAppSelector((s) => s.guilds.selectedId);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      if (guildList.length === 0) return;
      e.preventDefault();
      const idx = guildList.findIndex((g) => g.id === selectedGuildId);
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = guildList[(idx + delta + guildList.length) % guildList.length];
      if (next) dispatch(selectGuild(next.id));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guildList, selectedGuildId, dispatch]);

  // DM "yazıyor" göstergesi: açık DM kanalının dm: kanalına katıl, TYPING_START'ı dinle
  useEffect(() => {
    if (mode !== 'dm' || !channelId) return;
    joinDMChannel(channelId, (userId) => {
      dispatch(setTyping({ channelId, userId }));
    });
    return () => leaveDMChannel(channelId);
  }, [mode, channelId, dispatch]);

  // Esc ile mevcut kanalı okundu işaretle (yalnızca bir input'a yazmıyorken ve modal yokken)
  const anyModalOpen = useAppSelector((s) => !!s.ui.modal);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || anyModalOpen) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (!channelId) return;
      const lastMsgId = channels?.find((c) => c.id === channelId)?.last_message_id;
      if (lastMsgId) dispatch(ackChannel({ channelId, lastMessageId: lastMsgId }));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [channelId, channels, anyModalOpen, dispatch]);

  // Oturum açılınca presence durumunu DB'deki tercihle hizala (görünmez dahil)
  useEffect(() => {
    if (user?.status) setPresenceStatus(user.status as any);
  }, [user?.status]);

  // AFK/idle: 5 dk hareketsizlik → 'idle', hareket → 'online' (manuel dnd/offline'ı ezmez)
  const statusRef = useRef<string | undefined>(undefined);
  statusRef.current = useAppSelector((s) => s.auth.user?.status);
  const autoIdleRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const IDLE_MS = 5 * 60 * 1000;
    const goIdle = () => {
      if (statusRef.current === 'online') {
        autoIdleRef.current = true;
        setPresenceStatus('idle');
        api.updateStatus('idle').then(() => dispatch(fetchMe())).catch(() => {});
      }
    };
    const onActivity = () => {
      clearTimeout(timer);
      timer = setTimeout(goIdle, IDLE_MS);
      if (autoIdleRef.current && statusRef.current === 'idle') {
        autoIdleRef.current = false;
        setPresenceStatus('online');
        api.updateStatus('online').then(() => dispatch(fetchMe())).catch(() => {});
      }
    };
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    timer = setTimeout(goIdle, IDLE_MS);
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [user, dispatch]);

  // Mobil: kanal/mod değişince navigasyon çekmecesini kapat (sohbet görünsün)
  useEffect(() => {
    dispatch(setMobileNav(false));
  }, [channelId, mode, dispatch]);

  if (bootChecking) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg">
        <img
          src="/brand/logo.svg"
          width={80}
          height={80}
          alt="Concord"
          className="animate-pulse"
        />
      </div>
    );
  }
  if (!user) return <AuthPage />;

  const dmHubVisible = mode === 'dm' && !channelId;

  return (
    <div className="h-screen flex bg-bg text-ink-primary overflow-hidden">
      {/* Sol kolonlar — masaüstünde sabit, mobilde kayan çekmece */}
      <div
        className={
          'flex shrink-0 h-full max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-2xl max-md:transition-transform max-md:duration-200 ' +
          (mobileNav ? 'max-md:translate-x-0' : 'max-md:-translate-x-full')
        }
      >
        <ServerRail />
        {mode === 'dm' ? <DMSidebar /> : mode === 'discover' ? <DiscoverSidebar /> : <ChannelList />}
      </div>
      {/* Mobil backdrop */}
      {mobileNav && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => dispatch(setMobileNav(false))} />
      )}
      {mode === 'discover' ? (
        <DiscoverContent />
      ) : (
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <ChannelHeader />
        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {dmHubVisible ? (
              <FriendsHub />
            ) : channel?.type === 'stage' ? (
              <>
                <ErrorBoundary scope="Sahne" fallback={() => <div className="p-4 text-sm text-accent-500">Sahne hatası</div>}>
                  <StageView />
                </ErrorBoundary>
              </>
            ) : channel?.type === 'voice' ? (
              <>
                <ErrorBoundary
                  scope="Sesli sohbet"
                  onReset={() => {
                    // Çöken video/ekran yayınını temizle ki yeniden denerken tekrar patlamasın
                    voice.unpublishCamera().catch(() => {});
                    voice.unpublishScreen().catch(() => {});
                  }}
                  fallback={(err, reset) => (
                    <div className="shrink-0 px-5 py-4 border-b border-line bg-surface-1 flex items-center gap-3">
                      <Video size={20} className="text-accent-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink-primary">Video hatası</div>
                        <div className="text-xs text-accent-500 truncate" title={err.message}>
                          {err.message}
                        </div>
                      </div>
                      <button
                        onClick={reset}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold"
                      >
                        Yeniden dene
                      </button>
                    </div>
                  )}
                >
                  <VoiceStage />
                </ErrorBoundary>
                <div className="flex-1 min-h-0 flex flex-col border-t border-line">
                  <MessageList />
                </div>
              </>
            ) : channel?.type === 'forum' && channelId ? (
              <ForumView channelId={channelId} />
            ) : channel?.type === 'media' && channelId ? (
              <MediaView channelId={channelId} />
            ) : (
              <MessageList />
            )}
            {!dmHubVisible && channel?.type !== 'forum' && channel?.type !== 'stage' && <MessageInput />}
          </div>
          {showMembers && (mode === 'guild' || (mode === 'dm' && channelId)) && (
            <>
              <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => dispatch(toggleMemberList())} />
              <div className="max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-2xl shrink-0">
                {mode === 'guild' ? <MemberList /> : channelId ? <DMUserPanel channelId={channelId} /> : null}
              </div>
            </>
          )}
        </div>
      </main>
      )}
      <Modal />
      {profileCardUserId && (
        <UserProfileCard
          userId={profileCardUserId}
          anchorRect={profileCardAnchor}
          onClose={() => dispatch(openProfileCard(null))}
        />
      )}
      <ToastContainer />
      <ReconnectBanner />
      <OnboardingGate />
      <SoundboardStopBar />
      {quickOpen && <QuickSwitcher onClose={() => setQuickOpen(false)} />}
    </div>
  );
}

function FriendsHub() {
  const dispatch = useAppDispatch();
  const [tab, setTab] = useState<'online' | 'all' | 'pending' | 'blocked'>('online');
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof api.friends.list>>>(
    [],
  );

  async function refresh() {
    try {
      setFriends(await api.friends.list());
    } catch {}
  }
  useEffect(() => {
    refresh();
  }, []);

  const filtered = friends.filter((f) => {
    if (tab === 'online') return f.friendship === 'accepted' && f.status !== 'offline';
    if (tab === 'all') return f.friendship === 'accepted';
    if (tab === 'pending')
      return f.friendship === 'pending_sent' || f.friendship === 'pending_received';
    if (tab === 'blocked') return f.friendship === 'blocked';
    return false;
  });

  return (
    <div className="flex-1 flex flex-col bg-bg overflow-hidden">
      <div className="h-14 border-b border-line px-5 flex items-center gap-1">
        <Users size={20} className="text-ink-tertiary mr-2" />
        <h1 className="text-ink-primary font-semibold mr-4">Arkadaşlar</h1>
        <span className="w-px h-6 bg-line mx-1" />
        <FriendTab active={tab === 'online'} onClick={() => setTab('online')}>
          Çevrimiçi
        </FriendTab>
        <FriendTab active={tab === 'all'} onClick={() => setTab('all')}>
          Tümü
        </FriendTab>
        <FriendTab active={tab === 'pending'} onClick={() => setTab('pending')}>
          Bekleyen
          {friends.filter((f) => f.friendship === 'pending_received').length > 0 && (
            <span className="ml-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-500 text-white text-[10px] font-bold inline-flex items-center justify-center">
              {friends.filter((f) => f.friendship === 'pending_received').length}
            </span>
          )}
        </FriendTab>
        <FriendTab active={tab === 'blocked'} onClick={() => setTab('blocked')}>
          Engelli
        </FriendTab>
        <button
          onClick={() => dispatch(openModal('friends'))}
          className="ml-2 px-3 py-1.5 rounded-md bg-status-online/15 hover:bg-status-online/25 text-status-online text-sm font-semibold"
        >
          Arkadaş Ekle
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="text-[11px] font-bold uppercase text-ink-tertiary tracking-wider mb-3">
          {tab === 'online'
            ? 'Çevrimiçi'
            : tab === 'all'
              ? 'Tüm Arkadaşlar'
              : tab === 'pending'
                ? 'Bekleyen İstekler'
                : 'Engelli'}{' '}
          — {filtered.length}
        </div>

        {filtered.length === 0 ? (
          <p className="text-ink-tertiary text-center py-12">
            {tab === 'online'
              ? 'Hiçbir arkadaşın çevrimiçi değil. Yalnız değilsin sıkıntı yok.'
              : tab === 'pending'
                ? 'Bekleyen istek yok.'
                : tab === 'blocked'
                  ? 'Engellediğin kimse yok.'
                  : 'Henüz arkadaşın yok.'}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((f) => (
              <FriendRow key={f.user_id} f={f} tab={tab} onRefresh={refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FriendTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-1 rounded-md text-sm font-medium transition-colors ' +
        (active
          ? 'bg-surface-2 text-ink-primary'
          : 'text-ink-secondary hover:bg-surface-2/50 hover:text-ink-primary')
      }
    >
      {children}
    </button>
  );
}

function FriendRow({
  f,
  tab,
  onRefresh,
}: {
  f: any;
  tab: 'online' | 'all' | 'pending' | 'blocked';
  onRefresh: () => void;
}) {
  const dispatch = useAppDispatch();
  const statusColor: Record<string, string> = {
    online: 'bg-status-online',
    idle: 'bg-status-idle',
    dnd: 'bg-status-dnd',
    offline: 'bg-status-offline',
  };

  async function openDM() {
    try {
      const r = await api.dms.open(f.user_id);
      dispatch({ type: 'ui/setMode', payload: 'dm' });
      dispatch({ type: 'ui/selectDM', payload: r.channel_id });
      dispatch({ type: 'channels/selectChannel', payload: r.channel_id });
    } catch {}
  }

  async function remove() {
    await api.friends.remove(f.user_id).catch(() => {});
    onRefresh();
  }

  async function accept() {
    await api.friends.accept(f.user_id).catch(() => {});
    onRefresh();
  }

  async function unblock() {
    await api.unblock(f.user_id).catch(() => {});
    onRefresh();
  }

  return (
    <li className="flex items-center gap-3 py-3 group hover:bg-surface-1/40 -mx-2 px-2 rounded">
      <button
        onClick={(e) =>
          dispatch({
            type: 'ui/openProfileCard',
            payload: { userId: f.user_id, anchorRect: e.currentTarget.getBoundingClientRect() },
          })
        }
        className="relative shrink-0"
      >
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
          style={{ backgroundColor: f.avatar_color }}
        >
          {f.display_name.slice(0, 1).toUpperCase()}
        </div>
        <span
          className={
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-bg ' +
            (statusColor[f.status] ?? 'bg-status-offline')
          }
        />
      </button>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink-primary truncate">{f.display_name}</div>
        <div className="text-xs text-ink-tertiary truncate">
          @{f.username} ·{' '}
          {f.friendship === 'pending_sent'
            ? 'İstek gönderildi'
            : f.friendship === 'pending_received'
              ? 'Sana istek gönderdi'
              : f.friendship === 'blocked'
                ? 'Engelli'
                : f.status}
        </div>
      </div>
      <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
        {tab === 'pending' && f.friendship === 'pending_received' && (
          <button
            onClick={accept}
            className="px-3 py-1.5 rounded-md bg-status-online/15 hover:bg-status-online/25 text-status-online text-xs font-semibold"
          >
            Kabul Et
          </button>
        )}
        {tab !== 'blocked' && f.friendship === 'accepted' && (
          <button
            onClick={openDM}
            title="DM"
            className="w-9 h-9 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-secondary hover:text-ink-primary flex items-center justify-center"
          >
            <MessageCircle size={16} />
          </button>
        )}
        {tab === 'blocked' ? (
          <button
            onClick={unblock}
            className="px-3 py-1.5 rounded-md bg-surface-2 hover:bg-status-online/25 hover:text-status-online text-ink-secondary text-xs font-semibold"
          >
            Engeli Kaldır
          </button>
        ) : (
          <button
            onClick={remove}
            title="Arkadaşlıktan çıkar"
            className="w-9 h-9 rounded-full bg-surface-2 hover:bg-accent-500 hover:text-white text-ink-secondary flex items-center justify-center"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function VoiceStage() {
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const me = useAppSelector((s) => s.auth.user);
  const usersById = useAppSelector((s) => s.users.byId);
  const afkDispatch = useAppDispatch();
  const guildsList = useAppSelector((s) => s.guilds.list);
  const channelsByGuild = useAppSelector((s) => s.channels.byGuild);

  // AFK: sunucuda afk_channel_id ayarlıysa ve afk_timeout boyunca mikrofonda ses yoksa
  // kullanıcıyı AFK kanalına taşı (Discord davranışı; kontrol istemcide çalışır)
  useEffect(() => {
    const iv = setInterval(async () => {
      const vch = voice.channelId;
      if (!vch) return;
      let guild: (typeof guildsList)[number] | undefined;
      for (const gid of Object.keys(channelsByGuild)) {
        if ((channelsByGuild[gid] ?? []).some((c) => c.id === vch)) {
          guild = guildsList.find((x) => x.id === gid);
          break;
        }
      }
      const afkId = (guild as any)?.afk_channel_id as string | undefined;
      if (!guild || !afkId || afkId === vch) return;
      const timeoutMs = (((guild as any).afk_timeout_sec as number) || 300) * 1000;
      if (Date.now() - voice.lastLocalVoiceActivity > timeoutMs) {
        try {
          await voice.disconnect();
          await voice.connect(afkId);
          afkDispatch(addToast({ kind: 'info', message: '💤 Uzun süre ses aktivitesi olmadığı için AFK kanalına taşındın' }));
        } catch { /* taşıma başarısızsa bir sonraki turda tekrar denenir */ }
      }
    }, 30_000);
    return () => clearInterval(iv);
  }, [guildsList, channelsByGuild, afkDispatch]);
  const isStage = useAppSelector((s) => {
    const gid = s.guilds.selectedId;
    const ch = gid ? s.channels.byGuild[gid]?.find((c) => c.id === channelId) : null;
    return ch?.type === 'stage';
  });
  const guildMembers = useAppSelector((s) => {
    const gid = s.guilds.selectedId;
    return gid ? s.members.byGuild[gid] ?? [] : [];
  });
  const nameOf = (uid: string) => {
    if (uid === me?.id) return me?.display_name ?? 'Sen';
    return (
      usersById[uid]?.display_name ??
      guildMembers.find((m) => m.user_id === uid)?.display_name ??
      'Bağlanıyor…'
    );
  };
  const [hiddenCams, setHiddenCams] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(voice.channelId === channelId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [blurOn, setBlurOn] = useState(() => voice.isVideoBlurOn());
  const [localCamera, setLocalCamera] = useState<MediaStream | null>(null);
  const [localScreen, setLocalScreen] = useState<MediaStream | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const onChange = () => force((n) => n + 1);
    const onCamera = ({ stream }: any) => setLocalCamera(stream);
    const onScreen = ({ stream }: any) => setLocalScreen(stream);
    const onConn = () => setConnected(true);
    const onDisc = () => {
      setConnected(false);
      setCameraOn(false);
      setScreenOn(false);
    };
    voice.on('remotes:changed', onChange);
    voice.on('streams:changed', onChange);
    voice.on('local:camera', onCamera);
    voice.on('local:screen', onScreen);
    voice.on('connected', onConn);
    voice.on('disconnected', onDisc);
    return () => {
      voice.off('remotes:changed', onChange);
      voice.off('streams:changed', onChange);
      voice.off('local:camera', onCamera);
      voice.off('local:screen', onScreen);
      voice.off('connected', onConn);
      voice.off('disconnected', onDisc);
    };
  }, []);

  async function join() {
    if (!channelId) return;
    setBusy(true);
    setError(null);
    try {
      await voice.connect(channelId);
      setConnected(true);
    } catch (e: any) {
      setError(e?.message || 'Sese katılamadı');
    } finally {
      setBusy(false);
    }
  }

  async function toggleCamera() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (cameraOn) {
        await voice.unpublishCamera();
        setCameraOn(false);
      } else {
        await voice.publishCamera();
        setCameraOn(true);
      }
    } catch (e: any) {
      // Yarım kalmış yayını temizle ki durum tutarlı kalsın
      await voice.unpublishCamera().catch(() => {});
      setCameraOn(false);
      if (e?.name !== 'NotAllowedError') {
        setError(e?.message || 'Kamera açılamadı');
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleBlur() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await voice.setVideoBlur(!blurOn);
      setBlurOn(!blurOn);
    } catch (e: any) {
      setError(e?.message || 'Bulanıklaştırma başlatılamadı (model indirilemedi olabilir)');
    } finally {
      setBusy(false);
    }
  }

  async function toggleScreen() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (screenOn) {
        await voice.unpublishScreen();
        setScreenOn(false);
      } else {
        await voice.publishScreen();
        setScreenOn(true);
      }
    } catch (e: any) {
      await voice.unpublishScreen().catch(() => {});
      setScreenOn(false);
      if (e?.name !== 'NotAllowedError') {
        setError(e?.message || 'Ekran paylaşılamadı');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!connected) {
    return (
      <div className="shrink-0 px-5 py-4 border-b border-line bg-surface-1 flex items-center gap-3">
        <Volume2 size={20} className="text-brand-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-primary">{isStage ? '🎙️ Sahne kanalı' : 'Sesli sohbet'}</div>
          {error && <div className="text-xs text-accent-500 truncate">{error}</div>}
        </div>
        <button
          onClick={join}
          disabled={busy}
          className="shrink-0 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          <PhoneCall size={14} />
          {busy ? 'Bağlanıyor...' : 'Sese Katıl'}
        </button>
      </div>
    );
  }

  const videoTiles: { key: string; label: string; stream: MediaStream; me?: boolean; producerId?: string; source?: 'camera' | 'screen' }[] = [];
  if (localCamera) videoTiles.push({ key: 'self-cam', label: `${me?.display_name ?? 'Sen'} · kamera`, stream: localCamera, me: true });
  if (localScreen) videoTiles.push({ key: 'self-scr', label: `${me?.display_name ?? 'Sen'} · ekran`, stream: localScreen, me: true });
  const hiddenCamList: { producerId: string; name: string }[] = [];
  for (const r of voice.remoteStreams()) {
    if (r.kind === 'video') {
      // Lokal gizlenmiş kameralar tile yerine "Göster" pilinde
      if (r.source === 'camera' && hiddenCams.has(r.producerId)) {
        hiddenCamList.push({ producerId: r.producerId, name: nameOf(r.userId) });
        continue;
      }
      videoTiles.push({
        key: r.producerId,
        label: `${nameOf(r.userId)} · ${r.source === 'screen' ? 'ekran' : 'kamera'}`,
        stream: r.stream,
        producerId: r.producerId,
        source: r.source === 'screen' ? 'screen' : 'camera',
      });
    }
  }
  // İzlenmeyen yayınlar — yalnızca EKRAN paylaşımları (kamera otomatik gelir)
  const available = voice.availableStreams();
  const audioPeers = new Set<string>();
  for (const r of voice.remoteStreams()) if (r.kind === 'audio') audioPeers.add(r.userId);

  // Video/ekran paylaşımı varsa büyük ızgara; yalnızca ses varsa kompakt panel
  const hasVisual = videoTiles.length > 0 || available.length > 0 || hiddenCamList.length > 0;

  return (
    <div className={'shrink-0 flex flex-col bg-gradient-to-b from-surface-1 via-surface-1 to-brand-900/10 border-b border-line overflow-hidden ' + (hasVisual ? 'max-h-[55%]' : '')}>
      <div className={'overflow-y-auto ' + (hasVisual ? 'flex-1 p-4 min-h-[120px]' : 'px-4 py-2')}>
        {videoTiles.length === 0 && available.length === 0 && hiddenCamList.length === 0 ? (
          <div className="flex items-center gap-2">
            <Mic size={13} className="text-status-online shrink-0" />
            <span className="text-[11px] text-ink-secondary truncate">
              Sesli sohbet · {audioPeers.size + 1} kişi bağlı
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 auto-rows-fr">
            {/* Yalnızca EKRAN paylaşımı "İzle" gerektirir; kamera otomatik gelir */}
            {available.map((s) => (
              <button
                key={s.producerId}
                onClick={() => voice.watchStream(s.producerId).catch(() => {})}
                className="rounded-xl border-2 border-dashed border-brand-500/40 bg-surface-2 hover:bg-surface-3 hover:border-brand-500 flex flex-col items-center justify-center gap-2 min-h-[140px] transition-colors"
              >
                <ScreenShare size={28} className="text-brand-500" />
                <span className="text-sm font-semibold text-ink-primary">{nameOf(s.userId)} ekran paylaşıyor</span>
                <span className="px-3 py-1 rounded-full bg-brand-500 text-white text-xs font-bold">▶ İzle</span>
              </button>
            ))}
            {videoTiles.map((t) => (
              <VideoTile
                key={t.key}
                stream={t.stream}
                label={t.label}
                isLocal={t.me}
                onUnwatch={!t.me && t.source === 'screen' && t.producerId ? () => voice.unwatchStream(t.producerId!) : undefined}
                onHide={!t.me && t.source === 'camera' && t.producerId ? () => setHiddenCams((s) => new Set(s).add(t.producerId!)) : undefined}
              />
            ))}
            {/* Gizlenmiş kameralar */}
            {hiddenCamList.map((h) => (
              <button
                key={h.producerId}
                onClick={() => setHiddenCams((s) => { const n = new Set(s); n.delete(h.producerId); return n; })}
                className="rounded-xl border border-line bg-surface-2 hover:bg-surface-3 flex flex-col items-center justify-center gap-2 min-h-[140px] text-ink-tertiary hover:text-ink-primary"
              >
                <Video size={24} className="opacity-50" />
                <span className="text-sm">{h.name} · kamera gizli</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-surface-3">Göster</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {audioPeers.size > 0 && (
        <div className="shrink-0 border-t border-line px-2 py-1 max-h-28 overflow-y-auto space-y-0.5">
          {Array.from(audioPeers).map((uid) => (
            <PeerVolumeRow key={uid} userId={uid} />
          ))}
        </div>
      )}

      {error && (
        <div className="shrink-0 px-4 py-1.5 bg-accent-500/10 border-t border-accent-500/30 text-xs text-accent-400 text-center truncate" title={error}>
          {error}
        </div>
      )}

      <div className="border-t border-line bg-surface-2 px-4 py-2 flex items-center justify-center gap-2 shrink-0">
        <button
          onClick={toggleCamera}
          disabled={busy}
          className={
            'h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
            (cameraOn
              ? 'bg-brand-500 hover:bg-brand-400 text-white'
              : 'bg-surface-3 hover:bg-surface-1 text-ink-primary')
          }
          title={cameraOn ? 'Kamerayı kapat' : 'Kamerayı aç'}
        >
          <Video size={13} />
          {cameraOn ? 'Kamerayı Kapat' : 'Kamera'}
        </button>
        <button
          onClick={toggleBlur}
          disabled={busy}
          className={
            'h-8 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
            (blurOn
              ? 'bg-brand-500 hover:bg-brand-400 text-white'
              : 'bg-surface-3 hover:bg-surface-1 text-ink-primary')
          }
          title={blurOn ? 'Arka plan bulanıklaştırma açık' : 'Arka planı bulanıklaştır'}
          aria-label="Arka planı bulanıklaştır"
        >
          ✨ Blur
        </button>
        <button
          onClick={toggleScreen}
          disabled={busy}
          className={
            'h-8 px-3 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' +
            (screenOn
              ? 'bg-brand-500 hover:bg-brand-400 text-white'
              : 'bg-surface-3 hover:bg-surface-1 text-ink-primary')
          }
          title={screenOn ? 'Ekran paylaşımını kapat' : 'Ekran paylaş'}
        >
          <ScreenShare size={13} />
          {screenOn ? 'Ekranı Kapat' : 'Ekran Paylaş'}
        </button>
        {channelId && <SoundboardButton channelId={channelId} />}
      </div>
    </div>
  );
}

function SoundboardButton({ channelId }: { channelId: string }) {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const [open, setOpen] = useState(false);
  const [sounds, setSounds] = useState<Awaited<ReturnType<typeof api.sounds.list>>>(
    [],
  );
  const [playingCount, setPlayingCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => onSoundboardChange(() => setPlayingCount(soundsPlaying())), []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || !guildId) return;
    api.sounds.list(guildId).then(setSounds).catch(() => {});
  }, [open, guildId]);

  function play(sound: { id: string; file_url: string; volume?: number }) {
    // Tıklayan kişi sesi ANINDA lokal çalsın — tıklama bir user gesture olduğu için
    // tarayıcı autoplay engeline takılmaz (broadcast round-trip'e güvenmiyoruz).
    playSound(sound.file_url, sound.volume ?? 1);
    // Kanaldaki diğer üyelere yay (onlar SOUNDBOARD_PLAY ile duyar; gönderen kendi event'ini atlar)
    api.sounds.play(sound.id, channelId).catch(() => {});
  }

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Soundboard"
        className="h-8 px-3 rounded-md text-xs font-semibold bg-surface-3 hover:bg-surface-1 text-ink-primary flex items-center gap-1.5"
      >
        🔊 Soundboard
      </button>
      {playingCount > 0 && (
        <button
          onClick={stopAllSounds}
          title="Sesi durdur"
          className="h-8 px-3 rounded-md text-xs font-semibold bg-accent-500 hover:bg-accent-600 text-white flex items-center gap-1.5 animate-pulse"
        >
          ⏹ Durdur
        </button>
      )}
      {open && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-72 bg-surface-1 border border-line rounded-xl shadow-2xl p-2 z-30 max-h-64 overflow-y-auto">
          {playingCount > 0 && (
            <button
              onClick={stopAllSounds}
              className="w-full mb-2 py-1.5 rounded-lg bg-accent-500 hover:bg-accent-600 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
            >
              ⏹ Çalan sesi durdur
            </button>
          )}
          {sounds.length === 0 ? (
            <p className="text-xs text-ink-tertiary p-3 text-center">
              Henüz ses yok. Sunucu Ayarları &gt; Soundboard ile ekle.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {sounds.map((s) => (
                <button
                  key={s.id}
                  onClick={() => play(s)}
                  className="aspect-square flex flex-col items-center justify-center gap-1 rounded-lg bg-surface-2 hover:bg-brand-500/15 transition-colors"
                  title={s.name}
                >
                  <span className="text-2xl">{s.emoji ?? '🔊'}</span>
                  <span className="text-[10px] truncate w-full px-1 text-center text-ink-primary">
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Soundboard sesi çalarken ekranın altında her yerden görünen "Durdur" çubuğu
function SoundboardStopBar() {
  const [count, setCount] = useState(soundsPlaying());
  useEffect(() => onSoundboardChange(() => setCount(soundsPlaying())), []);
  if (count === 0) return null;
  return (
    <button
      onClick={stopAllSounds}
      title="Çalan soundboard sesini durdur"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-full bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold shadow-2xl flex items-center gap-2"
    >
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> ⏹ Sesi Durdur
    </button>
  );
}

function PeerVolumeRow({ userId }: { userId: string }) {
  const user = useAppSelector((s) => s.users.byId[userId]);
  const me = useAppSelector((s) => s.auth.user);
  const name = userId === me?.id ? `${me.display_name} (sen)` : user?.display_name ?? `Kullanıcı ${userId.slice(-4)}`;
  const color = user?.avatar_color ?? '#6B7280';
  const [vol, setVol] = useState(Math.round(voice.getUserVolume(userId) * 100));

  return (
    <div className="flex items-center gap-2 px-1 py-0.5">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
        style={{ backgroundColor: color }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="text-xs text-ink-secondary truncate w-24 shrink-0">{name}</span>
      <button
        onClick={() => {
          const next = vol === 0 ? 100 : 0;
          setVol(next);
          voice.setUserVolume(userId, next / 100);
        }}
        title={vol === 0 ? 'Sesi aç' : 'Sustur'}
        className="text-ink-tertiary hover:text-ink-primary shrink-0"
      >
        <Volume2 size={14} className={vol === 0 ? 'opacity-40' : ''} />
      </button>
      <input
        type="range"
        min={0}
        max={200}
        value={vol}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          setVol(v);
          voice.setUserVolume(userId, v / 100);
        }}
        className="flex-1 h-1 accent-brand-500 cursor-pointer"
      />
      <span className="text-[10px] text-ink-tertiary w-9 text-right shrink-0">{vol}%</span>
    </div>
  );
}

function VideoTile({ stream, label, isLocal, onUnwatch, onHide }: { stream: MediaStream; label: string; isLocal?: boolean; onUnwatch?: () => void; onHide?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream ?? null;
      el.play?.().catch(() => {});
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);

  function fullscreen() {
    const box = boxRef.current as any;
    if (!box) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (box.requestFullscreen?.() ?? box.webkitRequestFullscreen?.())?.catch?.(() => {});
  }

  return (
    <div ref={boxRef} className="group/vt relative bg-black rounded-2xl overflow-hidden border border-line aspect-video">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        onDoubleClick={fullscreen}
        className="w-full h-full object-contain bg-black cursor-pointer"
      />
      <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-white font-medium">
        {label}
        {isLocal && <span className="ml-1 text-brand-400">(sen)</span>}
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/vt:opacity-100 transition-opacity">
        <button
          onClick={fullscreen}
          title="Tam ekran (çift tıkla)"
          className="bg-black/70 hover:bg-brand-500 text-white text-xs font-semibold w-7 h-7 rounded flex items-center justify-center"
        >
          ⛶
        </button>
        {onHide && (
          <button onClick={onHide} title="Görüntüyü gizle (senin için)" className="bg-black/70 hover:bg-surface-1 text-white text-[11px] font-semibold px-2 h-7 rounded">
            🙈 Gizle
          </button>
        )}
        {onUnwatch && (
          <button onClick={onUnwatch} title="İzlemeyi bırak" className="bg-black/70 hover:bg-accent-500 text-white text-[11px] font-semibold px-2 h-7 rounded">
            ✕ Bırak
          </button>
        )}
      </div>
    </div>
  );
}
