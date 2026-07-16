import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useAppSelector, useAppDispatch, fetchGuilds } from '../../store';
import { api, type APIRole, type APIMember } from '../../api';
import { t } from '../../i18n';

export function MembersTab({ guildId }: { guildId: string }) {
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
    if (!confirm(t('member.kickConfirm', { name: m.display_name }))) return;
    await api.guilds.kick(guildId, m.user_id);
    setMembers((ms) => ms.filter((x) => x.user_id !== m.user_id));
  }
  async function ban(m: APIMember) {
    const reason = prompt(t('member.banReason', { name: m.display_name }));
    if (reason === null) return;
    await api.guilds.ban(guildId, m.user_id, reason);
    setMembers((ms) => ms.filter((x) => x.user_id !== m.user_id));
  }
  async function timeoutMember(m: APIMember) {
    const mins = prompt(t('member.timeoutPrompt'), '10');
    if (!mins) return;
    const sec = parseInt(mins, 10) * 60;
    if (!sec) return;
    await api.guilds.timeout(guildId, m.user_id, sec);
  }
  async function transferOwnership(m: APIMember) {
    if (!confirm(t('member.transferConfirm', { name: m.display_name }))) return;
    try {
      await api.guilds.update(guildId, { owner_id: m.user_id });
      await dispatch(fetchGuilds());
    } catch (e: any) {
      alert(e?.message || t('member.transferFailed'));
    }
  }

  async function toggleRole(m: APIMember, roleId: string) {
    const has = m.role_ids?.includes(roleId);
    try {
      if (has) {
        await api.guilds.unassignRole(guildId, m.user_id, roleId);
        setMembers((ms) =>
          ms.map((x) =>
            x.user_id === m.user_id
              ? { ...x, role_ids: x.role_ids.filter((r) => r !== roleId) }
              : x,
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
        placeholder={t('member.searchDots')}
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
                    <span className="bg-yellow-500/20 text-yellow-400 text-[10px] px-1.5 rounded">
                      SAHİP
                    </span>
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
                <RoleAssignDropdown
                  member={m}
                  roles={roles}
                  onToggle={(rid) => toggleRole(m, rid)}
                />
              )}
              {!isOwner && !isMe && (
                <div className="flex gap-1">
                  {iAmOwner && (
                    <button
                      onClick={() => transferOwnership(m)}
                      className="px-2 py-1 rounded text-xs bg-surface-3 hover:bg-yellow-500/20 hover:text-yellow-400 text-ink-secondary"
                      title={t('member.transferOwnership')}
                      aria-label={t('member.transferOwnership')}
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
