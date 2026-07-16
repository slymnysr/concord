import { useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useAppSelector } from '../../store';
import { api, type APIRole } from '../../api';
import { PERM, PERM_LABELS, has, toggle } from '../../perms';
import { t } from '../../i18n';

export function RolesTab({ guildId }: { guildId: string }) {
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const members = useAppSelector((s) => s.members.byGuild[guildId] ?? []);
  const roleCount = (roleId: string) => members.filter((m) => m.role_ids?.includes(roleId)).length;

  async function refresh() {
    const list = await api.guilds.roles(guildId).catch(() => []);
    setRoles(list);
    if (!selectedId && list.length > 0) setSelectedId(list[0].id);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, [guildId]);

  const selected = roles.find((r) => r.id === selectedId);

  async function createRole() {
    const name = prompt(t('role.newNamePrompt'));
    if (!name?.trim()) return;
    const r = await api.guilds.createRole(guildId, { name: name.trim(), permissions: '0' });
    await refresh();
    setSelectedId(r.id);
  }

  async function updateSelected(patch: Partial<APIRole>) {
    if (!selected) return;
    const updated = await api.guilds.updateRole(guildId, selected.id, {
      name: patch.name ?? selected.name,
      color: patch.color ?? selected.color,
      permissions: patch.permissions ?? selected.permissions,
      hoist: patch.hoist ?? selected.hoist,
      mentionable: patch.mentionable ?? selected.mentionable,
      icon: patch.icon !== undefined ? patch.icon : selected.icon,
    });
    setRoles((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function remove() {
    if (!selected || selected.is_everyone) return;
    if (!confirm(`"${selected.name}" rolünü silmek istiyor musun?`)) return;
    await api.guilds.deleteRole(guildId, selected.id);
    setSelectedId(null);
    refresh();
  }

  // Rolü yukarı/aşağı taşı. Liste position DESC sıralı; tüm rolleri yeniden numaralandırıp
  // (üst = en yüksek position) kaydeder — başlangıçta pozisyonlar eşit (0) olsa bile çalışır.
  async function moveRole(index: number, dir: -1 | 1) {
    const a = roles[index];
    const b = roles[index + dir];
    if (!a || !b || a.is_everyone || b.is_everyone) return;
    const next = [...roles];
    next[index] = b;
    next[index + dir] = a;
    setRoles(next); // iyimser
    const nonEveryone = next.filter((r) => !r.is_everyone);
    try {
      await Promise.all(
        nonEveryone.map((r, i) =>
          api.guilds.updateRole(guildId, r.id, { position: nonEveryone.length - i }),
        ),
      );
      await refresh();
    } catch {
      await refresh();
    }
  }

  if (loading) return <p className="text-ink-tertiary">{t('common.loading')}</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">{t('role.title')}</h2>
        <button
          onClick={createRole}
          className="bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        >
          <Plus size={14} /> Yeni Rol
        </button>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-4">
        <ul className="space-y-1">
          {roles.map((r, i) => (
            <li key={r.id} className="group flex items-center gap-0.5">
              <button
                onClick={() => setSelectedId(r.id)}
                className={
                  'flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 ' +
                  (r.id === selectedId
                    ? 'bg-brand-500/15 text-brand-500'
                    : 'hover:bg-surface-2 text-ink-secondary')
                }
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    backgroundColor: r.color
                      ? `#${r.color.toString(16).padStart(6, '0')}`
                      : '#6B7280',
                  }}
                />
                <span className="truncate flex-1">{r.name}</span>
                {!r.is_everyone && (
                  <span className="text-[10px] text-ink-tertiary shrink-0">{roleCount(r.id)}</span>
                )}
              </button>
              {!r.is_everyone && (
                <span className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveRole(i, -1)}
                    disabled={i === 0 || roles[i - 1]?.is_everyone}
                    title={t('role.moveUp')}
                    aria-label={t('role.moveUp')}
                    className="text-ink-tertiary hover:text-ink-primary disabled:opacity-30 leading-none text-[10px]"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveRole(i, 1)}
                    disabled={i >= roles.length - 1 || roles[i + 1]?.is_everyone}
                    title={t('role.moveDown')}
                    aria-label={t('role.moveDown')}
                    className="text-ink-tertiary hover:text-ink-primary disabled:opacity-30 leading-none text-[10px]"
                  >
                    ▼
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>

        {selected && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">
                Ad
              </label>
              <input
                value={selected.name}
                disabled={selected.is_everyone}
                onChange={(e) =>
                  setRoles((rs) =>
                    rs.map((r) => (r.id === selected.id ? { ...r, name: e.target.value } : r)),
                  )
                }
                onBlur={(e) => updateSelected({ name: e.target.value })}
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none disabled:opacity-60"
              />
            </div>

            {!selected.is_everyone && (
              <div>
                <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">
                  Rol İkonu
                </label>
                <div className="flex items-center gap-2">
                  <input
                    value={selected.icon ?? ''}
                    placeholder={t('role.iconPlaceholder')}
                    onChange={(e) =>
                      setRoles((rs) =>
                        rs.map((r) => (r.id === selected.id ? { ...r, icon: e.target.value } : r)),
                      )
                    }
                    onBlur={(e) => updateSelected({ icon: e.target.value })}
                    className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
                  />
                  {selected.icon &&
                    (selected.icon.startsWith('http') ? (
                      <img src={selected.icon} alt="" className="w-6 h-6 object-contain" />
                    ) : (
                      <span className="text-xl">{selected.icon}</span>
                    ))}
                </div>
                <p className="text-[11px] text-ink-tertiary mt-1">{t('role.iconHint')}</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase text-ink-secondary mb-2">
                İzinler
              </label>
              <div className="grid grid-cols-2 gap-2 bg-surface-2 rounded-xl border border-line p-3 max-h-96 overflow-y-auto">
                {Object.entries(PERM).map(([key, bit]) => {
                  const checked = has(selected.permissions, bit);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer hover:bg-surface-3 rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          updateSelected({ permissions: toggle(selected.permissions, bit) })
                        }
                        className="rounded accent-brand-500"
                      />
                      <span className="text-sm text-ink-primary">{PERM_LABELS[key] ?? key}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {!selected.is_everyone && (
              <button
                onClick={remove}
                className="bg-accent-500 hover:bg-accent-600 text-white text-sm font-semibold px-3 py-2 rounded-lg flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Rolü Sil
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
