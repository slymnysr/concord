import { useEffect, useState } from 'react';
import { Check, Minus, X as XIcon, Search, Plus } from 'lucide-react';
import { api, type APIChannel, type APIRole, type APIMember } from '../api';
import { useAppDispatch, useAppSelector, closeModal } from '../store';
import { t } from '../i18n';

interface Props {
  channel: APIChannel;
}

// Discord paritesi permission bitleri (perms.go ile bire bir)
const PERMS: { key: string; bit: bigint; label: string; section: 'general' | 'text' | 'voice' }[] = [
  { key: 'view', bit: 1n << 10n, label: t('perm.viewChannel'), section: 'general' },
  { key: 'invite', bit: 1n << 0n, label: t('perm.createInvite'), section: 'general' },
  { key: 'manage_channel', bit: 1n << 4n, label: t('perm.manageChannel'), section: 'general' },
  { key: 'manage_roles', bit: 1n << 28n, label: t('perm.managePerms'), section: 'general' },

  { key: 'send', bit: 1n << 11n, label: t('perm.sendMessages'), section: 'text' },
  { key: 'embed', bit: 1n << 14n, label: t('perm.embedLinks'), section: 'text' },
  { key: 'attach', bit: 1n << 15n, label: t('perm.attachFiles'), section: 'text' },
  { key: 'add_reactions', bit: 1n << 6n, label: t('perm.addReactions'), section: 'text' },
  { key: 'mention_everyone', bit: 1n << 17n, label: '@everyone Bahset', section: 'text' },
  { key: 'manage_msgs', bit: 1n << 13n, label: t('perm.manageMessages'), section: 'text' },
  { key: 'read_history', bit: 1n << 16n, label: t('perm.readHistory'), section: 'text' },

  { key: 'connect', bit: 1n << 20n, label: t('perm.connect'), section: 'voice' },
  { key: 'speak', bit: 1n << 21n, label: t('perm.speak'), section: 'voice' },
  { key: 'video', bit: 1n << 9n, label: t('perm.video'), section: 'voice' },
  { key: 'mute_members', bit: 1n << 22n, label: t('perm.muteMembers'), section: 'voice' },
  { key: 'deafen_members', bit: 1n << 23n, label: t('perm.deafenMembers'), section: 'voice' },
  { key: 'move_members', bit: 1n << 24n, label: t('perm.moveMembers'), section: 'voice' },
  { key: 'priority_speaker', bit: 1n << 8n, label: t('perm.prioritySpeaker'), section: 'voice' },
];

type Tri = 'inherit' | 'allow' | 'deny';
type Target = { type: 'role' | 'user'; id: string };

interface Override {
  target_type: 'role' | 'user';
  target_id: string;
  allow: string;
  deny: string;
}

export function ChannelPermissionsModal({ channel }: Props) {
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [members, setMembers] = useState<APIMember[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [selected, setSelected] = useState<Target | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!guildId) return;
    (async () => {
      const [rs, ms, ovs] = await Promise.all([
        api.guilds.roles(guildId),
        api.guilds.members(guildId),
        api.channels.listOverrides(channel.id),
      ]);
      setRoles(rs);
      setMembers(ms);
      setOverrides(ovs);
      const everyone = rs.find((r) => r.is_everyone);
      if (everyone) setSelected({ type: 'role', id: everyone.id });
    })();
  }, [guildId, channel.id]);

  const currentOverride =
    selected &&
    overrides.find((o) => o.target_type === selected.type && o.target_id === selected.id);
  const allowBits = currentOverride ? BigInt(currentOverride.allow) : 0n;
  const denyBits = currentOverride ? BigInt(currentOverride.deny) : 0n;

  function tri(bit: bigint): Tri {
    if ((allowBits & bit) === bit) return 'allow';
    if ((denyBits & bit) === bit) return 'deny';
    return 'inherit';
  }

  async function setTri(bit: bigint, value: Tri) {
    if (!selected) return;
    let newAllow = allowBits;
    let newDeny = denyBits;
    newAllow &= ~bit;
    newDeny &= ~bit;
    if (value === 'allow') newAllow |= bit;
    if (value === 'deny') newDeny |= bit;

    setBusy(true);
    try {
      if (newAllow === 0n && newDeny === 0n) {
        await api.channels.deleteOverride(channel.id, selected.type, selected.id);
        setOverrides((xs) =>
          xs.filter((o) => !(o.target_type === selected.type && o.target_id === selected.id)),
        );
      } else {
        await api.channels.upsertOverride(channel.id, {
          target_type: selected.type,
          target_id: selected.id,
          allow: newAllow.toString(),
          deny: newDeny.toString(),
        });
        setOverrides((xs) => {
          const idx = xs.findIndex(
            (o) => o.target_type === selected.type && o.target_id === selected.id,
          );
          const next = { ...selected, allow: newAllow.toString(), deny: newDeny.toString() };
          if (idx >= 0) {
            const cp = xs.slice();
            cp[idx] = {
              target_type: selected.type,
              target_id: selected.id,
              allow: next.allow,
              deny: next.deny,
            };
            return cp;
          }
          return [
            ...xs,
            {
              target_type: selected.type,
              target_id: selected.id,
              allow: next.allow,
              deny: next.deny,
            },
          ];
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function addTarget(t: Target) {
    setSelected(t);
    setPickerOpen(false);
    // Override boş başlatılır — kullanıcı bir izni allow/deny yapınca yazılacak
    if (!overrides.find((o) => o.target_type === t.type && o.target_id === t.id)) {
      setOverrides((xs) => [...xs, { target_type: t.type, target_id: t.id, allow: '0', deny: '0' }]);
    }
  }

  function targetLabel(tgt: { type: 'role' | 'user'; id: string }): string {
    if (tgt.type === 'role') {
      const r = roles.find((x) => x.id === tgt.id);
      return r ? (r.is_everyone ? '@everyone' : r.name) : t('perm.unknownRole');
    }
    const m = members.find((x) => x.user_id === tgt.id);
    return m ? (m.nickname ?? m.display_name) : t('perm.unknownMember');
  }

  function targetColor(t: { type: 'role' | 'user'; id: string }): string {
    if (t.type === 'role') {
      const r = roles.find((x) => x.id === t.id);
      return r ? '#' + r.color.toString(16).padStart(6, '0') : '#6B7280';
    }
    const m = members.find((x) => x.user_id === t.id);
    return m?.avatar_color ?? '#6B7280';
  }

  const targetList: Target[] = [
    ...(roles.find((r) => r.is_everyone)
      ? [{ type: 'role' as const, id: roles.find((r) => r.is_everyone)!.id }]
      : []),
    ...overrides
      .filter((o) => !(o.target_type === 'role' && roles.find((r) => r.id === o.target_id)?.is_everyone))
      .map((o) => ({ type: o.target_type, id: o.target_id } as Target)),
  ];

  const sections: { label: string; section: 'general' | 'text' | 'voice' }[] = [
    { label: t('perm.general'), section: 'general' },
    { label: t('perm.textPerms'), section: 'text' },
    { label: t('perm.voicePerms'), section: 'voice' },
  ];

  return (
    <div className="flex h-[560px] max-h-[80vh]">
      {/* Sol: Rol/Üye listesi */}
      <div className="w-56 border-r border-line flex flex-col">
        <div className="p-4 border-b border-line">
          <h2 className="text-base font-bold text-ink-primary">{t('perm.title')}</h2>
          <p className="text-xs text-ink-tertiary mt-0.5 truncate">#{channel.name}</p>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {targetList.map((t) => {
            const active = selected?.type === t.type && selected.id === t.id;
            return (
              <button
                key={`${t.type}-${t.id}`}
                onClick={() => setSelected(t)}
                className={
                  'w-full px-3 py-1.5 text-left flex items-center gap-2 transition-colors ' +
                  (active ? 'bg-brand-500/10 text-ink-primary' : 'text-ink-secondary hover:bg-surface-2')
                }
              >
                <span
                  className={
                    'w-2.5 h-2.5 rounded-full shrink-0 ' + (t.type === 'role' ? '' : '')
                  }
                  style={{ backgroundColor: targetColor(t) }}
                />
                <span className="text-sm truncate font-medium">{targetLabel(t)}</span>
                <span className="ml-auto text-[10px] text-ink-tertiary uppercase">
                  {t.type === 'role' ? 'Rol' : 'Üye'}
                </span>
              </button>
            );
          })}
        </div>
        <div className="p-2 border-t border-line">
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="w-full px-3 py-2 rounded-lg bg-surface-2 hover:bg-surface-3 text-ink-primary text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Plus size={14} />
            Rol/Üye Ekle
          </button>
        </div>
      </div>

      {/* Sağ: izin matrisi */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">
            {selected ? targetLabel(selected) : '—'} için kanal izinleri
          </h3>
          <button
            onClick={() => dispatch(closeModal())}
            className="w-7 h-7 rounded-md hover:bg-surface-2 text-ink-secondary flex items-center justify-center"
          >
            <XIcon size={14} />
          </button>
        </div>

        {selected ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {sections.map((s) => (
              <div key={s.section}>
                <div className="text-[11px] font-bold uppercase text-ink-tertiary tracking-wider mb-2">
                  {s.label}
                </div>
                <ul className="space-y-1">
                  {PERMS.filter((p) => p.section === s.section).map((p) => {
                    const cur = tri(p.bit);
                    return (
                      <li
                        key={p.key}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-2"
                      >
                        <span className="text-sm text-ink-primary">{p.label}</span>
                        <TriToggle
                          value={cur}
                          disabled={busy}
                          onChange={(v) => setTri(p.bit, v)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-ink-tertiary text-sm">
            Sol listeden bir rol/üye seç
          </div>
        )}
      </div>

      {pickerOpen && (
        <TargetPicker
          roles={roles}
          members={members}
          existing={overrides}
          onClose={() => setPickerOpen(false)}
          onPick={addTarget}
        />
      )}
    </div>
  );
}

function TriToggle({
  value,
  onChange,
  disabled,
}: {
  value: Tri;
  onChange: (v: Tri) => void;
  disabled?: boolean;
}) {
  const opts: { v: Tri; icon: any; cls: string; title: string }[] = [
    { v: 'deny', icon: XIcon, cls: 'text-accent-500', title: t('perm.deny') },
    { v: 'inherit', icon: Minus, cls: 'text-ink-tertiary', title: t('perm.inherit') },
    { v: 'allow', icon: Check, cls: 'text-status-online', title: t('perm.allow') },
  ];
  return (
    <div className="flex gap-0.5 bg-surface-3 rounded-md p-0.5">
      {opts.map((o) => {
        const Icon = o.icon;
        const active = o.v === value;
        return (
          <button
            key={o.v}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.v)}
            title={o.title}
            className={
              'w-7 h-6 rounded flex items-center justify-center transition-colors ' +
              (active ? 'bg-surface-1 ' + o.cls : 'text-ink-tertiary hover:bg-surface-2')
            }
          >
            <Icon size={12} />
          </button>
        );
      })}
    </div>
  );
}

function TargetPicker({
  roles,
  members,
  existing,
  onClose,
  onPick,
}: {
  roles: APIRole[];
  members: APIMember[];
  existing: Override[];
  onClose: () => void;
  onPick: (t: Target) => void;
}) {
  const [q, setQ] = useState('');
  const existingSet = new Set(existing.map((o) => `${o.target_type}-${o.target_id}`));

  const filteredRoles = roles.filter(
    (r) =>
      !r.is_everyone &&
      !existingSet.has(`role-${r.id}`) &&
      r.name.toLowerCase().includes(q.toLowerCase()),
  );
  const filteredMembers = members.filter(
    (m) =>
      !existingSet.has(`user-${m.user_id}`) &&
      ((m.nickname ?? m.display_name).toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-1 border border-line rounded-xl shadow-2xl w-full max-w-md max-h-[400px] flex flex-col overflow-hidden"
      >
        <div className="p-3 border-b border-line relative">
          <Search size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('perm.searchPlaceholder')}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-ink-primary placeholder:text-ink-tertiary"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {filteredRoles.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase text-ink-tertiary tracking-wider">
                Roller
              </div>
              {filteredRoles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => onPick({ type: 'role', id: r.id })}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-2"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: '#' + r.color.toString(16).padStart(6, '0') }}
                  />
                  <span className="text-sm text-ink-primary">{r.name}</span>
                </button>
              ))}
            </>
          )}
          {filteredMembers.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase text-ink-tertiary tracking-wider">
                Üyeler
              </div>
              {filteredMembers.map((m) => (
                <button
                  key={m.user_id}
                  onClick={() => onPick({ type: 'user', id: m.user_id })}
                  className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-2"
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                    style={{ backgroundColor: m.avatar_color }}
                  >
                    {(m.nickname ?? m.display_name).slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-sm text-ink-primary">{m.nickname ?? m.display_name}</span>
                </button>
              ))}
            </>
          )}
          {filteredRoles.length === 0 && filteredMembers.length === 0 && (
            <p className="text-sm text-ink-tertiary p-4 text-center">Sonuç bulunamadı.</p>
          )}
        </div>
      </div>
    </div>
  );
}
