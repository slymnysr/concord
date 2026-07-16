import { useEffect, useRef, useState } from 'react';
import {
  UserPlus,
  UserCheck,
  Clock,
  MoreHorizontal,
  Ban,
  Flag,
  EyeOff,
  Send,
  ChevronRight,
  Users,
} from 'lucide-react';
import { t } from '../i18n';
import { api, type APIPublicUser } from '../api';
import { ConnectionChips } from './connectionMeta';
import { useAppDispatch, useAppSelector, addToast, toggleIgnore, switchToDM } from '../store';
import { ProfileBadges } from './ProfileBadges';

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
  offline: t('status.offline'),
};

// DM görünümünde sağ taraftaki kullanıcı profil paneli.
export function DMUserPanel({ channelId }: { channelId: string }) {
  const me = useAppSelector((s) => s.auth.user);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isGroup, setIsGroup] = useState(false);

  // DM kanalının karşı tarafını çöz
  useEffect(() => {
    let cancelled = false;
    setPartnerId(null);
    setIsGroup(false);
    (async () => {
      try {
        const dms = await api.dms.list();
        const dm = dms.find((d) => d.id === channelId);
        if (!dm || cancelled) return;
        if (dm.type === 'group_dm') {
          setIsGroup(true);
          return;
        }
        const other = dm.participants.find((p) => p !== me?.id);
        if (other) setPartnerId(other);
      } catch {
        /* sessiz */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, me?.id]);

  if (isGroup) {
    return <GroupMembersPanel channelId={channelId} />;
  }

  if (!partnerId) {
    return (
      <aside className="w-72 bg-surface-1 border-l border-line flex items-center justify-center">
        <p className="text-sm text-ink-tertiary">{t('common.loading')}</p>
      </aside>
    );
  }

  return <ProfileContent userId={partnerId} channelId={channelId} key={partnerId} />;
}

function ProfileContent({ userId, channelId }: { userId: string; channelId: string }) {
  const dispatch = useAppDispatch();
  const myGuilds = useAppSelector((s) => s.guilds.list);
  const [user, setUser] = useState<APIPublicUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showAllGuilds, setShowAllGuilds] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isIgnored = useAppSelector((s) => s.ui.ignoredUsers.includes(userId));

  function openMenu() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setMenuOpen((v) => !v);
    setInviteOpen(false);
  }

  useEffect(() => {
    api.users.user(userId).then(setUser).catch(() => setUser(null));
  }, [userId]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setInviteOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  if (!user) {
    return (
      <aside className="w-72 bg-surface-1 border-l border-line flex items-center justify-center">
        <p className="text-sm text-ink-tertiary">{t('common.loading')}</p>
      </aside>
    );
  }

  async function toggleFriend() {
    if (!user || busy) return;
    setBusy(true);
    try {
      if (user.friendship_state === 'accepted') {
        if (confirm(t('friend.removeConfirm', { name: user.display_name }))) {
          await api.friends.remove(user.id);
          setUser({ ...user, friendship_state: undefined });
          dispatch(addToast({ kind: 'info', message: t('friend.removed') }));
        }
      } else if (user.friendship_state === 'pending_received') {
        await api.friends.accept(user.id);
        setUser({ ...user, friendship_state: 'accepted' });
        dispatch(addToast({ kind: 'success', message: t('friend.accepted') }));
      } else if (!user.friendship_state) {
        await api.friends.send({ user_id: user.id });
        setUser({ ...user, friendship_state: 'pending_sent' });
        dispatch(addToast({ kind: 'success', message: t('friend.requestSent') }));
      }
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || t('common.actionFailed') }));
    } finally {
      setBusy(false);
    }
  }

  async function block() {
    if (!user) return;
    if (!confirm(`${user.display_name} engellensin mi?`)) return;
    try {
      await api.block(user.id);
      setUser({ ...user, friendship_state: 'blocked' });
      dispatch(addToast({ kind: 'info', message: t('user.blocked') }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || t('user.blockFailed') }));
    }
    setMenuOpen(false);
  }

  async function inviteToGuild(guildId: string, guildName: string) {
    try {
      const inv = await api.guilds.createInvite(guildId, { max_uses: 0, expires_in_sec: 604800 });
      // Sadece bağlantı gönder → alıcıda tek bir davet kartı olarak render edilir (metin yok)
      const link = `${location.host}/davet/${inv.code}`;
      const msg = await api.channels.sendMessage(channelId, link);
      // Gönderenin kendi ekranında anında görünsün (gateway echo'sunu beklemeden)
      dispatch({
        type: 'messages/send/fulfilled',
        payload: msg,
        meta: { arg: { channelId, content: link } },
      });
      dispatch(addToast({ kind: 'success', message: t('invite.sentTo', { guild: guildName }) }));
    } catch (e: any) {
      // Davet izni yoksa backend hata döner → kullanıcıyı bilgilendir
      dispatch(
        addToast({
          kind: 'error',
          message: e?.message?.includes('forbidden')
            ? t('invite.noPermission')
            : t('invite.createFailed'),
        }),
      );
    }
    setMenuOpen(false);
    setInviteOpen(false);
  }

  const fs = user.friendship_state;
  const visibleGuilds = showAllGuilds ? myGuilds : myGuilds.slice(0, 6);

  return (
    <aside className="w-72 bg-surface-1 border-l border-line flex flex-col overflow-y-auto">
      {/* Banner */}
      <div
        className="h-24 shrink-0 relative"
        style={{
          background: user.banner_url
            ? `url(${user.banner_url}) center/cover`
            : `linear-gradient(135deg, ${user.avatar_color}, ${user.avatar_color}80)`,
        }}
      >
        {/* Üst sağ aksiyonlar */}
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          <button
            onClick={toggleFriend}
            disabled={busy || fs === 'pending_sent' || fs === 'blocked'}
            title={
              fs === 'accepted'
                ? t('friend.areFriends')
                : fs === 'pending_sent'
                  ? t('friend.requestPending')
                  : fs === 'pending_received'
                    ? t('friend.acceptRequest')
                    : t('friend.add')
            }
            className={
              'w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ' +
              (fs === 'accepted'
                ? 'bg-status-online/90 text-white'
                : 'bg-black/40 text-white hover:bg-black/60')
            }
          >
            {fs === 'accepted' ? (
              <UserCheck size={16} />
            ) : fs === 'pending_sent' ? (
              <Clock size={16} />
            ) : (
              <UserPlus size={16} />
            )}
          </button>
          <div ref={menuRef}>
            <button
              ref={triggerRef}
              onClick={openMenu}
              title={t('common.more')} aria-label={t('common.more')}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-black/40 text-white hover:bg-black/60 backdrop-blur-sm"
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div
                style={{ top: menuPos.top, right: menuPos.right }}
                className="fixed w-56 bg-surface-2 border border-line rounded-xl shadow-2xl z-50 py-1.5 text-sm"
              >
                {/* Sunucuya davet et — üstüne gelince yan fly-out menü açılır (tıklamaya gerek yok) */}
                <div
                  className="relative"
                  onMouseEnter={() => setInviteOpen(true)}
                  onMouseLeave={() => {
                    setInviteOpen(false);
                    setShowAllGuilds(false);
                  }}
                >
                  <div
                    className={
                      'w-full px-3 py-2 flex items-center justify-between cursor-default ' +
                      (inviteOpen ? 'bg-surface-3 text-ink-primary' : 'text-ink-primary hover:bg-surface-3')
                    }
                  >
                    <span className="flex items-center gap-2">
                      <Send size={15} /> Sunucuya davet et
                    </span>
                    <ChevronRight size={14} className="text-ink-tertiary" />
                  </div>
                  {inviteOpen && (
                    <div className="absolute right-full top-0 mr-1 w-52 max-h-60 overflow-y-auto bg-surface-2 border border-line rounded-xl shadow-2xl py-1.5">
                      {myGuilds.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-ink-tertiary">{t('guild.noneOwned')}</p>
                      ) : (
                        <>
                          {visibleGuilds.map((g) => (
                            <button
                              key={g.id}
                              onClick={() => inviteToGuild(g.id, g.name)}
                              className="w-full px-3 py-1.5 flex items-center gap-2 text-ink-secondary hover:bg-surface-3 hover:text-ink-primary text-left"
                            >
                              <span className="w-5 h-5 rounded-md bg-brand-500/80 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {g.name.slice(0, 1).toUpperCase()}
                              </span>
                              <span className="truncate text-xs">{g.name}</span>
                            </button>
                          ))}
                          {myGuilds.length > 6 && !showAllGuilds && (
                            <button
                              onClick={() => setShowAllGuilds(true)}
                              className="w-full px-3 py-1.5 text-[11px] text-brand-400 hover:underline text-left"
                            >
                              +{myGuilds.length - 6} sunucu daha
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    dispatch(toggleIgnore(user.id));
                    dispatch(addToast({ kind: 'info', message: isIgnored ? t('user.unignored') : t('user.ignored') }));
                    setMenuOpen(false);
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2 text-ink-primary hover:bg-surface-3"
                >
                  <EyeOff size={15} /> {isIgnored ? t('user.unignore') : t('user.ignore')}
                </button>
                <button
                  onClick={block}
                  className="w-full px-3 py-2 flex items-center gap-2 text-accent-400 hover:bg-accent-500/10"
                >
                  <Ban size={15} /> Engelle
                </button>
                <button
                  onClick={async () => {
                    setMenuOpen(false);
                    const reason = prompt(t('report.reasonPrompt')) ?? undefined;
                    try {
                      await api.users.report(user.id, reason);
                      dispatch(addToast({ kind: 'success', message: t('report.received') }));
                    } catch (e: any) {
                      dispatch(addToast({ kind: 'error', message: e?.message || t('report.failed') }));
                    }
                  }}
                  className="w-full px-3 py-2 flex items-center gap-2 text-accent-400 hover:bg-accent-500/10"
                >
                  <Flag size={15} /> Profili bildir
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 -mt-9 relative">
        {/* Avatar */}
        <div className="relative w-[72px] mb-2">
          <div
            className="w-[72px] h-[72px] rounded-full ring-[6px] ring-surface-1 flex items-center justify-center text-white text-2xl font-bold overflow-hidden"
            style={{ backgroundColor: user.avatar_color }}
          >
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name} className="w-full h-full object-cover" />
            ) : (
              user.display_name.slice(0, 1).toUpperCase()
            )}
          </div>
          <span
            className={
              'absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full ring-[4px] ring-surface-1 ' +
              statusColor[user.status]
            }
          />
        </div>

        {/* İsim kartı */}
        <div className="bg-surface-2 rounded-xl p-3">
          <h2 className="text-base font-bold text-ink-primary flex items-center gap-2">
            {user.display_name}
            {user.bot && (
              <span className="bg-brand-500/15 text-brand-500 text-[10px] font-bold px-1.5 py-0.5 rounded">
                BOT
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-secondary">@{user.username}</p>
          <ProfileBadges user={user} />
          <div className="mt-2 flex items-center gap-1.5 text-xs">
            <span className={'w-2 h-2 rounded-full ' + statusColor[user.status]} />
            <span className="text-ink-tertiary">{statusLabel[user.status]}</span>
          </div>

          {(user.custom_status_text || user.custom_status_emoji) && (
            <p className="mt-2 text-sm text-ink-secondary">
              {user.custom_status_emoji ? user.custom_status_emoji + ' ' : ''}
              {user.custom_status_text}
            </p>
          )}

          {fs === 'blocked' && (
            <div className="mt-2 text-xs text-accent-400 font-medium">{t('user.isBlocked')}</div>
          )}

          {user.bio && (
            <Section title={t('profile.about')} aria-label={t('profile.about')}>
              <p className="text-sm text-ink-primary leading-snug whitespace-pre-wrap">{user.bio}</p>
            </Section>
          )}

          {user.connections && user.connections.length > 0 && (
            <div className="mt-3">
              <ConnectionChips connections={user.connections} />
            </div>
          )}

          <Section title={t('profile.concordMembership')} aria-label={t('profile.concordMembership')}>
            <p className="text-xs text-ink-secondary">
              {new Date(user.created_at).toLocaleDateString('tr-TR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </Section>

          {user.mutual_guilds && user.mutual_guilds.length > 0 && (
            <Section title={`Ortak Sunucular — ${user.mutual_guilds.length}`}>
              <div className="space-y-1.5">
                {user.mutual_guilds.map((g) => (
                  <div key={g.id} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: g.icon_color }}
                    >
                      {g.icon_text}
                    </div>
                    <span className="text-xs text-ink-primary truncate">{g.name}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {user.mutual_friends && user.mutual_friends.length > 0 && (
            <Section title={t('profile.mutualFriends', { n: user.mutual_friends.length })}>
              <div className="flex flex-wrap gap-1">
                {user.mutual_friends.map((f) => (
                  <div
                    key={f.user_id}
                    title={f.display_name}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: f.avatar_color }}
                  >
                    {f.display_name.slice(0, 1).toUpperCase()}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Not" aria-label="Not">
            <UserNote userId={user.id} />
          </Section>
        </div>
      </div>
    </aside>
  );
}

function UserNote({ userId }: { userId: string }) {
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    let cancelled = false;
    api.users
      .getNote(userId)
      .then((r) => !cancelled && setNote(r.note))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return (
    <textarea
      value={note}
      onChange={(e) => {
        setNote(e.target.value);
        setSaved(false);
      }}
      onBlur={() => {
        if (saved) return;
        api.users.setNote(userId, note).then(() => setSaved(true)).catch(() => {});
      }}
      rows={2}
      placeholder={t('profile.notePlaceholder')}
      className="w-full bg-surface-1 border border-line rounded-lg px-2.5 py-2 text-sm text-ink-primary placeholder:text-ink-tertiary resize-none focus:outline-none focus:border-brand-500/50"
    />
  );
}

function GroupMembersPanel({ channelId }: { channelId: string }) {
  const me = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const [members, setMembers] = useState<APIPublicUser[]>([]);
  const [groupName, setGroupName] = useState('Grup Sohbeti');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [friends, setFriends] = useState<{ user_id: string; display_name: string; avatar_color: string; friendship: string }[]>([]);

  async function renameGroup() {
    const v = prompt('Grubun yeni adı:', groupName);
    if (v === null) return;
    const name = v.trim();
    if (!name) return;
    try {
      await api.channels.update(channelId, { name });
      setGroupName(name);
      dispatch(addToast({ kind: 'success', message: 'Grup adı güncellendi' }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Ad değiştirilemedi' }));
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(t('dm.removeFromGroupConfirm', { name }))) return;
    try {
      await api.dms.removeRecipient(channelId, userId);
      setReloadKey((k) => k + 1);
      dispatch(addToast({ kind: 'success', message: t('dm.removedFromGroup', { name }) }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Çıkarılamadı' }));
    }
  }

  useEffect(() => {
    api.friends.list().then((l) => setFriends(l.filter((f) => f.friendship === 'accepted'))).catch(() => {});
  }, []);

  async function addMember(userId: string) {
    try {
      await api.dms.addRecipient(channelId, userId);
      setReloadKey((k) => k + 1);
      setAddOpen(false);
      dispatch(addToast({ kind: 'success', message: 'Kişi eklendi' }));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Eklenemedi' }));
    }
  }
  async function leaveGroup() {
    if (!me || !confirm('Gruptan ayrılmak istiyor musun?')) return;
    try {
      await api.dms.removeRecipient(channelId, me.id);
      dispatch(switchToDM());
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'Ayrılınamadı' }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const dms = await api.dms.list();
        const dm = dms.find((d) => d.id === channelId);
        if (!dm || cancelled) return;
        if (dm.name) setGroupName(dm.name);
        setOwnerId(dm.owner_id ?? null);
        const users = await Promise.all(
          dm.participants.map((id) => api.users.user(id).catch(() => null)),
        );
        if (!cancelled) setMembers(users.filter((u): u is APIPublicUser => !!u));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, reloadKey]);

  return (
    <aside className="w-72 bg-surface-1 border-l border-line flex flex-col overflow-y-auto">
      <div className="px-4 pt-5 pb-3 flex flex-col items-center text-center border-b border-line">
        <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center mb-2">
          <Users size={28} className="text-white" />
        </div>
        <h2 className="text-base font-bold text-ink-primary flex items-center gap-1.5">
          {groupName}
          <button
            onClick={renameGroup}
            className="text-ink-tertiary hover:text-ink-primary"
            title={t('dm.renameGroup')} aria-label={t('dm.renameGroup')}
          >
            ✏️
          </button>
        </h2>
        <p className="text-xs text-ink-tertiary">{members.length} üye</p>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <h3 className="px-2 py-1.5 text-[10px] font-bold uppercase text-ink-tertiary tracking-wider">
          Üyeler — {members.length}
        </h3>
        {loading ? (
          <p className="px-2 py-3 text-sm text-ink-tertiary">{t('common.loading')}</p>
        ) : (
          members.map((u) => (
            <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2">
              <div className="relative shrink-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                  style={{ backgroundColor: u.avatar_color }}
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.display_name} className="w-full h-full object-cover" />
                  ) : (
                    u.display_name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span
                  className={
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-surface-1 ' +
                    statusColor[u.status]
                  }
                />
              </div>
              <span className="text-sm text-ink-primary truncate flex-1">
                {u.display_name}
                {u.id === me?.id && <span className="text-ink-tertiary text-xs"> (sen)</span>}
                {u.id === ownerId && <span className="ml-1 text-[10px]" title="Grup kurucusu">👑</span>}
              </span>
              {ownerId === me?.id && u.id !== me?.id && (
                <button
                  onClick={() => removeMember(u.id, u.display_name)}
                  className="shrink-0 w-6 h-6 rounded hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center text-xs"
                  title={t('dm.removeFromGroup')} aria-label={u.display_name + ' kullanıcısını gruptan çıkar'}
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>
      <div className="p-2 border-t border-line space-y-1.5">
        <button
          onClick={() => setAddOpen((v) => !v)}
          className="w-full px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-primary text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <UserPlus size={15} /> Kişi Ekle
        </button>
        {addOpen && (
          <div className="max-h-40 overflow-y-auto bg-surface-2 rounded-lg p-1">
            {friends.filter((f) => !members.some((m) => m.id === f.user_id)).length === 0 ? (
              <p className="text-xs text-ink-tertiary px-2 py-1.5">Eklenecek arkadaş yok.</p>
            ) : (
              friends
                .filter((f) => !members.some((m) => m.id === f.user_id))
                .map((f) => (
                  <button
                    key={f.user_id}
                    onClick={() => addMember(f.user_id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-3 text-left"
                  >
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: f.avatar_color }}>
                      {f.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm text-ink-primary truncate">{f.display_name}</span>
                  </button>
                ))
            )}
          </div>
        )}
        <button
          onClick={leaveGroup}
          className="w-full px-3 py-2 rounded-lg text-accent-500 hover:bg-accent-500/10 text-sm font-semibold"
        >
          Gruptan Ayrıl
        </button>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 pt-3 border-t border-line">
      <h3 className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider mb-1.5">
        {title}
      </h3>
      {children}
    </div>
  );
}
