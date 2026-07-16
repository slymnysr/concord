import { useEffect, useRef, useState } from 'react';
import { httpUrl } from '../serverConfig';
import { MessageSquare, UserPlus, X, Check, Clock } from 'lucide-react';
import { api, type APIPublicUser } from '../api';
import { useAppDispatch, useAppSelector, selectChannel, setMode, selectDM, setPendingDM, addToast } from '../store';
import { ProfileBadges } from './ProfileBadges';
import { ConnectionChips } from './connectionMeta';
import { activityVerb, activityElapsed } from '../activity';
import { t } from '../i18n';

type AnchorRect = { top: number; left: number; right: number; bottom: number; width: number; height: number };

interface Props {
  userId: string;
  onClose: () => void;
  anchorRect?: AnchorRect | null;
}

export function UserProfileCard({ userId, onClose, anchorRect }: Props) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const activity = useAppSelector((s) => {
    const gid = s.guilds.selectedId;
    return gid ? s.presence.activityByGuild[gid]?.[userId] : undefined;
  });
  const [user, setUser] = useState<APIPublicUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.users
      .user(userId)
      .then(setUser)
      .catch((e) => setError(e?.message ?? t('common.loadFailed')));
  }, [userId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  // Pozisyon: anchor varsa yanına yerleştir, yoksa merkez
  const style: React.CSSProperties = {};
  if (anchorRect) {
    const cardWidth = 320;
    let left = anchorRect.right + 8;
    if (left + cardWidth > window.innerWidth) {
      left = anchorRect.left - cardWidth - 8;
    }
    if (left < 8) left = 8;
    style.left = left;
    style.top = Math.min(anchorRect.top, window.innerHeight - 420);
  } else {
    style.left = '50%';
    style.top = '50%';
    style.transform = 'translate(-50%, -50%)';
  }

  async function sendFriendRequest() {
    if (!user) return;
    setBusy(true);
    try {
      await fetch(httpUrl('/api/v1/friends'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('concord_access'),
        },
        body: JSON.stringify({ user_id: user.id }),
      });
      setUser({ ...user, friendship_state: 'pending_sent' });
    } finally {
      setBusy(false);
    }
  }

  async function acceptFriend() {
    if (!user) return;
    setBusy(true);
    try {
      await fetch(httpUrl(`/api/v1/friends/${user.id}/accept`), {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('concord_access') },
      });
      setUser({ ...user, friendship_state: 'accepted' });
    } finally {
      setBusy(false);
    }
  }

  async function openDM() {
    if (!user) return;
    setBusy(true);
    try {
      const channelID =
        user.dm_channel_id ??
        (await api.dms.open(user.id)).channel_id;
      dispatch(setMode('dm'));
      dispatch(selectDM(channelID));
      dispatch(selectChannel(channelID));
      // Mesajsız DM olabilir; DMSidebar'a pinned olarak göster
      dispatch(setPendingDM({ channelId: channelID, partnerId: user.id }));
      onClose();
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.code === 'dm_restricted' ? 'Bu kullanıcı yalnızca arkadaşlarından mesaj alıyor' : t('dm.openFailed') }));
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={ref}
        style={style}
        className="absolute w-80 bg-surface-1 border border-line rounded-2xl shadow-2xl ring-1 ring-white/5 pointer-events-auto overflow-hidden"
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-md hover:bg-surface-2 text-ink-secondary hover:text-ink-primary flex items-center justify-center z-10"
        >
          <X size={14} />
        </button>

        {error && (
          <div className="p-6 text-center text-accent-500 text-sm">{error}</div>
        )}

        {!user && !error && (
          <div className="p-6 text-center text-ink-tertiary text-sm">{t('common.loading')}</div>
        )}

        {user && (
          <>
            <div
              className="h-20"
              style={{
                background: user.banner_url
                  ? `url(${user.banner_url}) center/cover`
                  : `linear-gradient(135deg, ${user.accent_color ?? user.avatar_color}, ${(user.accent_color ?? user.avatar_color)}80)`,
              }}
            />
            <div className="px-5 pb-5 -mt-10 relative">
              <div className="flex items-end justify-between mb-3">
                <div className="relative">
                  <div
                    className="w-20 h-20 rounded-full ring-4 ring-surface-1 flex items-center justify-center text-white text-2xl font-bold"
                    style={{ backgroundColor: user.avatar_color }}
                  >
                    {user.display_name.slice(0, 1).toUpperCase()}
                  </div>
                  <span
                    className={
                      'absolute bottom-1 right-1 w-5 h-5 rounded-full ring-4 ring-surface-1 ' +
                      statusColor[user.status]
                    }
                  />
                  {user.avatar_decoration && (
                    <span className="absolute -top-1 -right-1 text-lg drop-shadow" title={t('profile.avatarDecoration')} aria-label={t('profile.avatarDecoration')}>{user.avatar_decoration}</span>
                  )}
                </div>
              </div>

              <div className="bg-surface-2 rounded-xl p-3">
                <h2 className="text-lg font-bold text-ink-primary flex items-center gap-2">
                  {user.display_name}
                  {user.bot && (
                    <span className="bg-brand-500/15 text-brand-500 text-[10px] font-bold px-1.5 py-0.5 rounded">
                      BOT
                    </span>
                  )}
                </h2>
                <p className="text-sm text-ink-secondary">
                  @{user.username}
                  {user.pronouns && <span className="text-ink-tertiary"> · {user.pronouns}</span>}
                </p>
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

                {activity && (
                  <div className="mt-3 bg-surface-2 border border-line rounded-xl px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider mb-0.5">
                      {activityVerb(activity.type)}
                    </div>
                    <div className="text-sm font-semibold text-ink-primary truncate">{activity.name}</div>
                    {activity.started_at && (
                      <div className="text-xs text-ink-tertiary mt-0.5">{activityElapsed(activity.started_at)}</div>
                    )}
                  </div>
                )}

                {user.bio && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <h3 className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider mb-1">
                      Hakkımda
                    </h3>
                    <p className="text-sm text-ink-primary leading-snug">{user.bio}</p>
                  </div>
                )}

                {user.connections && user.connections.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <ConnectionChips connections={user.connections} />
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-line">
                  <h3 className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider mb-1">
                    Concord Üye
                  </h3>
                  <p className="text-xs text-ink-secondary">
                    {new Date(user.created_at).toLocaleDateString('tr-TR', {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </p>
                </div>

                {user.mutual_guilds && user.mutual_guilds.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <h3 className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider mb-2">
                      Ortak Sunucular — {user.mutual_guilds.length}
                    </h3>
                    <div className="space-y-1.5">
                      {user.mutual_guilds.slice(0, 4).map((g) => (
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
                      {user.mutual_guilds.length > 4 && (
                        <div className="text-[10px] text-ink-tertiary">
                          +{user.mutual_guilds.length - 4} daha
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {user.mutual_friends && user.mutual_friends.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-line">
                    <h3 className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider mb-2">
                      Ortak Arkadaşlar — {user.mutual_friends.length}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {user.mutual_friends.slice(0, 8).map((f) => (
                        <div
                          key={f.user_id}
                          title={f.display_name}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: f.avatar_color }}
                        >
                          {f.display_name.slice(0, 1).toUpperCase()}
                        </div>
                      ))}
                      {user.mutual_friends.length > 8 && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold bg-surface-3 text-ink-secondary">
                          +{user.mutual_friends.length - 8}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {user.id !== me?.id && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={openDM}
                      disabled={busy}
                      className="flex-1 px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      <MessageSquare size={14} />
                      Mesaj
                    </button>
                    {user.friendship_state === 'accepted' && (
                      <span className="px-3 py-2 rounded-lg bg-surface-3 text-ink-tertiary text-xs font-semibold flex items-center gap-1.5">
                        <Check size={14} /> Arkadaş
                      </span>
                    )}
                    {user.friendship_state === 'pending_sent' && (
                      <span className="px-3 py-2 rounded-lg bg-surface-3 text-ink-tertiary text-xs font-semibold flex items-center gap-1.5">
                        <Clock size={14} /> İstek gönderildi
                      </span>
                    )}
                    {user.friendship_state === 'pending_received' && (
                      <button
                        onClick={acceptFriend}
                        disabled={busy}
                        className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-primary text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Check size={14} /> Kabul
                      </button>
                    )}
                    {!user.friendship_state && (
                      <button
                        onClick={sendFriendRequest}
                        disabled={busy}
                        className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-primary text-xs font-semibold flex items-center gap-1.5"
                      >
                        <UserPlus size={14} /> Arkadaş Ekle
                      </button>
                    )}
                    {user.friendship_state !== 'blocked' && (
                      <button
                        onClick={async () => {
                          if (!confirm(`${user.display_name} engellensin mi?`)) return;
                          await api.block(user.id).catch(() => {});
                          setUser({ ...user, friendship_state: 'blocked' });
                        }}
                        className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary text-xs font-semibold"
                      >
                        Engelle
                      </button>
                    )}
                    {user.friendship_state !== 'self' && (
                      <button
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent('concord:mention-user', { detail: { id: user.id } }));
                          onClose();
                        }}
                        title={t('profile.mentionHint')} aria-label={t('profile.mentionHint')}
                        className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-primary text-xs font-semibold"
                      >
                        Bahset
                      </button>
                    )}
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(user.id);
                        setCopiedId(true);
                        setTimeout(() => setCopiedId(false), 1200);
                      }}
                      title={t('profile.copyUserId')} aria-label={t('profile.copyUserId')}
                      className="px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-secondary text-xs font-semibold"
                    >
                      {copiedId ? '✓ Kopyalandı' : 'ID Kopyala'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
