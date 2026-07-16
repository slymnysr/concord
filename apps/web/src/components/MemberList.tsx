import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MessageSquare,
  User,
  AtSign,
  UserMinus,
  Ban as BanIcon,
  Clock,
  Shield,
  Copy,
  Check,
  ChevronRight,
  Search,
  Pencil,
} from 'lucide-react';
import { activityLabel } from '../activity';
import {
  useAppDispatch,
  useAppSelector,
  openProfileCard,
  setMode,
  selectDM,
  selectChannel,
  setPendingDM,
  fetchMembers,
  addToast,
} from '../store';
import { api, type APIMember, type APIRole } from '../api';
import { t } from '../i18n';

export function MemberList() {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const members = useAppSelector((s) => (guildId ? (s.members.byGuild[guildId] ?? []) : []));
  const roles = useAppSelector((s) =>
    guildId ? s.guilds.list.find((g) => g.id === guildId) : null,
  );
  const allRoles = useAppSelector((s) => s.guildRoles?.byGuild?.[guildId ?? ''] ?? []);
  const onlineIds = useAppSelector((s) =>
    guildId ? (s.presence.onlineByGuild[guildId] ?? []) : [],
  );

  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);
  const [query, setQuery] = useState('');
  const [hideOffline, setHideOffline] = useState(
    () => localStorage.getItem('concord_hide_offline') === '1',
  );

  if (!guildId) return null;

  const q = query.trim().toLowerCase();
  const searchResults = q
    ? members.filter(
        (m) =>
          m.display_name?.toLowerCase().includes(q) ||
          (m as any).username?.toLowerCase?.().includes(q),
      )
    : null;

  // Discord davranışı: hoist=true rollere göre üyeleri grupla
  // Her üye en yüksek hoist rolüne göre kümelenir
  const hoistRoles = allRoles
    .filter((r: any) => r.hoist && !r.is_everyone)
    .sort((a: any, b: any) => b.position - a.position);

  const onlineMembers: APIMember[] = [];
  const offlineMembers: APIMember[] = [];
  for (const m of members) {
    if (onlineSet.has(m.user_id)) onlineMembers.push(m);
    else offlineMembers.push(m);
  }

  // Her hoist rolü için online üyeleri topla
  const roleBuckets: { role: any; members: APIMember[] }[] = [];
  const assigned = new Set<string>();
  for (const r of hoistRoles) {
    const bucket: APIMember[] = [];
    for (const m of onlineMembers) {
      if (!assigned.has(m.user_id) && m.role_ids?.includes(r.id)) {
        bucket.push(m);
        assigned.add(m.user_id);
      }
    }
    if (bucket.length > 0) roleBuckets.push({ role: r, members: bucket });
  }
  const onlineRest = onlineMembers.filter((m) => !assigned.has(m.user_id));

  void roles;

  return (
    <aside className="w-60 bg-surface-1 border-l border-line overflow-y-auto py-3">
      <div className="px-3 pb-2 -mt-3 pt-3 mb-1 sticky top-0 z-10 bg-surface-1">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('member.searchPlaceholder')}
            className="w-full bg-surface-2 border border-line rounded-md pl-8 pr-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-brand-500/50"
          />
        </div>
      </div>

      {members.length === 0 && (
        <p className="px-4 text-sm text-ink-tertiary text-center py-6">Üye listesi yükleniyor...</p>
      )}

      {/* Arama modu: düz filtrelenmiş liste */}
      {searchResults !== null ? (
        searchResults.length === 0 ? (
          <p className="px-4 text-sm text-ink-tertiary text-center py-6">{t('member.noMatch')}</p>
        ) : (
          <Group
            label={t('member.searchResults')}
            count={searchResults.length}
            members={searchResults}
            online
          />
        )
      ) : (
        <>
          {roleBuckets.map((b) => (
            <Group
              key={b.role.id}
              label={b.role.name}
              count={b.members.length}
              members={b.members}
              online
              color={`#${(b.role.color as number).toString(16).padStart(6, '0')}`}
            />
          ))}
          {onlineRest.length > 0 && (
            <Group
              label={roleBuckets.length > 0 ? 'Online' : t('status.online')}
              count={onlineRest.length}
              members={onlineRest}
              online
            />
          )}
          {offlineMembers.length > 0 && (
            <>
              <button
                onClick={() => {
                  const n = !hideOffline;
                  setHideOffline(n);
                  localStorage.setItem('concord_hide_offline', n ? '1' : '0');
                }}
                className="w-full px-3 mt-2 mb-1 text-[11px] font-bold text-ink-tertiary uppercase tracking-[0.08em] hover:text-ink-secondary flex items-center justify-between"
              >
                <span>Çevrimdışı — {offlineMembers.length}</span>
                <span>{hideOffline ? t('common.show') : t('common.hide')}</span>
              </button>
              {!hideOffline && (
                <Group
                  label=""
                  count={offlineMembers.length}
                  members={offlineMembers}
                  online={false}
                />
              )}
            </>
          )}
        </>
      )}
    </aside>
  );
}

function Group({
  label,
  count,
  members,
  online,
  color,
}: {
  label: string;
  count: number;
  members: APIMember[];
  online: boolean;
  color?: string;
}) {
  return (
    <section className="mb-5">
      {label !== '' && (
        <div
          className="px-4 mb-2 text-[11px] font-bold uppercase tracking-[0.08em] flex items-center justify-between"
          style={{ color: color ?? undefined }}
        >
          <span className={color ? '' : 'text-ink-tertiary'}>{label}</span>
          <span className="text-ink-muted">{count}</span>
        </div>
      )}
      <ul className="px-2 space-y-0.5">
        {members.map((m) => (
          <MemberRow key={m.user_id} m={m} online={online} />
        ))}
      </ul>
    </section>
  );
}

function MemberRow({ m, online }: { m: APIMember; online: boolean }) {
  const dispatch = useAppDispatch();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const roles = useAppSelector((s) => s.guildRoles?.byGuild?.[m.guild_id] ?? []);
  const activity = useAppSelector((s) => s.presence.activityByGuild[m.guild_id]?.[m.user_id]);
  const liveStatus = useAppSelector((s) => s.presence.statusByGuild[m.guild_id]?.[m.user_id]);
  const topColor = useMemo(() => {
    const mine = roles.filter((r: any) => !r.is_everyone && m.role_ids?.includes(r.id) && r.color);
    if (mine.length === 0) return null;
    mine.sort((a: any, b: any) => b.position - a.position);
    return '#' + (mine[0].color as number).toString(16).padStart(6, '0');
  }, [roles, m.role_ids]);
  // En yüksek ikonu olan rolün ikonu (isim yanında gösterilir)
  const topIcon = useMemo(() => {
    const mine = roles.filter((r: any) => !r.is_everyone && m.role_ids?.includes(r.id) && r.icon);
    if (mine.length === 0) return null;
    mine.sort((a: any, b: any) => b.position - a.position);
    return mine[0].icon as string;
  }, [roles, m.role_ids]);

  return (
    <li>
      <button
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
          dispatch(openProfileCard({ userId: m.user_id, anchorRect: rect }));
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={
          roles
            .filter((r: any) => !r.is_everyone && m.role_ids?.includes(r.id))
            .map((r: any) => r.name)
            .join(', ') || undefined
        }
        className="w-full px-2 py-1.5 rounded-md hover:bg-surface-2 flex items-center gap-3 text-left transition-colors"
      >
        <div className="relative shrink-0">
          <div
            className={
              'w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold overflow-hidden ' +
              (online ? '' : 'opacity-40')
            }
            style={{ backgroundColor: m.avatar_color }}
          >
            {m.guild_avatar_url ? (
              <img src={m.guild_avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (m.nickname ?? m.display_name).slice(0, 1).toUpperCase()
            )}
          </div>
          <span
            className={
              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-surface-1 ' +
              (!online
                ? 'bg-status-offline'
                : liveStatus === 'idle'
                  ? 'bg-status-idle'
                  : liveStatus === 'dnd'
                    ? 'bg-status-dnd'
                    : 'bg-status-online')
            }
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={
                'text-sm truncate font-medium ' +
                (topColor ? '' : online ? 'text-ink-primary' : 'text-ink-tertiary')
              }
              style={topColor ? { color: topColor, opacity: online ? 1 : 0.5 } : undefined}
            >
              {m.nickname ?? m.display_name}
            </span>
            {topIcon &&
              (topIcon.startsWith('http') ? (
                <img src={topIcon} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
              ) : (
                <span
                  className="text-xs shrink-0"
                  title={t('role.icon')}
                  aria-label={t('role.icon')}
                >
                  {topIcon}
                </span>
              ))}
            {m.bot && (
              <span className="bg-brand-500/15 text-brand-500 text-[9px] font-semibold px-1 rounded">
                BOT
              </span>
            )}
            {m.timeout_until && new Date(m.timeout_until) > new Date() && (
              <Clock size={12} className="text-yellow-400 shrink-0" />
            )}
          </div>
          {online && activity && (
            <div className="text-[11px] text-ink-tertiary truncate" title={activityLabel(activity)}>
              {activityLabel(activity)}
            </div>
          )}
        </div>
      </button>
      {menu && <MemberContextMenu m={m} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </li>
  );
}

function MemberContextMenu({
  m,
  x,
  y,
  onClose,
}: {
  m: APIMember;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const me = useAppSelector((s) => s.auth.user);
  const ref = useRef<HTMLDivElement>(null);

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

  async function openDM() {
    try {
      const r = await api.dms.open(m.user_id);
      dispatch(setMode('dm'));
      dispatch(selectDM(r.channel_id));
      dispatch(selectChannel(r.channel_id));
      dispatch(setPendingDM({ channelId: r.channel_id, partnerId: m.user_id }));
    } catch (e: any) {
      dispatch(
        addToast({
          kind: 'error',
          message:
            e?.code === 'dm_restricted'
              ? 'Bu kullanıcı yalnızca arkadaşlarından mesaj alıyor'
              : t('dm.openFailed'),
        }),
      );
    }
    onClose();
  }

  async function kick() {
    if (!guildId) return;
    if (!confirm(t('member.kickConfirm', { name: m.display_name }))) {
      onClose();
      return;
    }
    await api.guilds.kick(guildId, m.user_id).catch(() => {});
    onClose();
  }

  async function ban() {
    if (!guildId) return;
    const reason = prompt(t('member.banReason', { name: m.display_name }));
    if (reason === null) {
      onClose();
      return;
    }
    // Discord paritesi: banla birlikte son mesajları silme seçeneği
    const hoursStr = prompt('Son kaç saatlik mesajları silinsin? (0 = silme, en fazla 168)', '0');
    const hours = Math.min(168, Math.max(0, parseInt(hoursStr ?? '0', 10) || 0));
    await api.guilds.ban(guildId, m.user_id, reason, hours).catch(() => {});
    onClose();
  }

  async function timeoutMember() {
    if (!guildId) return;
    const mins = prompt(t('member.timeoutPrompt'), '10');
    if (!mins) {
      onClose();
      return;
    }
    const sec = parseInt(mins, 10) * 60;
    if (sec > 0) await api.guilds.timeout(guildId, m.user_id, sec).catch(() => {});
    onClose();
  }

  const [rolesOpen, setRolesOpen] = useState(false);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [memberRoles, setMemberRoles] = useState<Set<string>>(new Set(m.role_ids ?? []));

  useEffect(() => {
    if (!rolesOpen || !guildId || roles.length > 0) return;
    api.guilds
      .roles(guildId)
      .then((rs) => setRoles(rs.filter((r) => !r.is_everyone)))
      .catch(() => {});
  }, [rolesOpen, guildId, roles.length]);

  async function toggleRole(roleId: string) {
    if (!guildId) return;
    const has = memberRoles.has(roleId);
    // İyimser güncelle
    setMemberRoles((prev) => {
      const next = new Set(prev);
      if (has) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
    try {
      if (has) await api.guilds.unassignRole(guildId, m.user_id, roleId);
      else await api.guilds.assignRole(guildId, m.user_id, roleId);
      dispatch(fetchMembers(guildId));
    } catch {
      // hata: geri al
      setMemberRoles((prev) => {
        const next = new Set(prev);
        if (has) next.add(roleId);
        else next.delete(roleId);
        return next;
      });
    }
  }

  function copyId() {
    navigator.clipboard?.writeText(m.user_id).catch(() => {});
    onClose();
  }

  async function changeNick() {
    if (!guildId) return;
    const next = prompt(t('member.nicknamePrompt'), m.nickname ?? '');
    if (next === null) {
      onClose();
      return;
    }
    try {
      await api.guilds.setNickname(guildId, m.user_id, next.trim());
      dispatch(fetchMembers(guildId));
    } catch {
      /* sessiz */
    }
    onClose();
  }

  const isMe = me?.id === m.user_id;
  const cardWidth = 220;
  let left = x;
  let top = y;
  if (left + cardWidth > window.innerWidth) left = window.innerWidth - cardWidth - 8;
  if (top + 280 > window.innerHeight) top = window.innerHeight - 280 - 8;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={ref}
        style={{ left, top, width: cardWidth }}
        className="absolute bg-surface-1 border border-line rounded-xl shadow-2xl p-1 pointer-events-auto ring-1 ring-white/5"
      >
        <Item
          icon={<User size={14} />}
          label={t('member.viewProfile')}
          onClick={() => {
            dispatch(openProfileCard({ userId: m.user_id, anchorRect: null }));
            onClose();
          }}
        />
        <Item icon={<Pencil size={14} />} label={t('member.changeNickname')} onClick={changeNick} />
        {!isMe && (
          <Item icon={<MessageSquare size={14} />} label={t('member.message')} onClick={openDM} />
        )}
        {!isMe && (
          <Item
            icon={<AtSign size={14} />}
            label={t('member.mention')}
            onClick={() => {
              const ev = new CustomEvent('concord:insert-text', {
                detail: { text: `<@${m.user_id}> ` },
              });
              window.dispatchEvent(ev);
              onClose();
            }}
          />
        )}
        {!isMe && (
          <>
            <div className="my-1 h-px bg-line" />
            {/* Rolleri Yönet — açılır alt liste */}
            <button
              onClick={() => setRolesOpen((v) => !v)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 text-ink-primary hover:bg-surface-2 transition-colors"
            >
              <span className="text-ink-tertiary">
                <Shield size={14} />
              </span>
              <span className="font-medium flex-1">{t('role.manage')}</span>
              <ChevronRight
                size={13}
                className={
                  'text-ink-tertiary transition-transform ' + (rolesOpen ? 'rotate-90' : '')
                }
              />
            </button>
            {rolesOpen && (
              <div className="max-h-44 overflow-y-auto bg-surface-2 rounded-lg mx-1 my-1 p-1">
                {roles.length === 0 ? (
                  <p className="text-xs text-ink-tertiary px-2 py-1.5">{t('role.none')}</p>
                ) : (
                  roles.map((r) => {
                    const has = memberRoles.has(r.id);
                    return (
                      <button
                        key={r.id}
                        onClick={() => toggleRole(r.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-3 text-left"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              '#' + (r.color as number).toString(16).padStart(6, '0'),
                          }}
                        />
                        <span className="text-sm text-ink-primary truncate flex-1">{r.name}</span>
                        {has && <Check size={13} className="text-brand-500 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <Item icon={<Clock size={14} />} label={t('member.timeout')} onClick={timeoutMember} />
            <Item icon={<UserMinus size={14} />} label="Sunucudan At" danger onClick={kick} />
            <Item icon={<BanIcon size={14} />} label="Yasakla" danger onClick={ban} />
          </>
        )}
        <div className="my-1 h-px bg-line" />
        <Item icon={<Copy size={14} />} label="Kullanıcı ID'sini Kopyala" onClick={copyId} />
      </div>
    </div>
  );
}

function Item({
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
      className={
        'w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2.5 transition-colors ' +
        (danger ? 'text-accent-500 hover:bg-accent-500/10' : 'text-ink-primary hover:bg-surface-2')
      }
    >
      <span className={danger ? 'text-accent-500' : 'text-ink-tertiary'}>{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
