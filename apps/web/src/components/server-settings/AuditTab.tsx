import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAppSelector } from '../../store';
import { api } from '../../api';

const AUDIT_LABELS: Record<string, string> = {
  guild_update: 'Sunucu güncellendi',
  channel_create: 'Kanal oluşturuldu',
  channel_delete: 'Kanal silindi',
  channel_update: 'Kanal güncellendi',
  role_create: 'Rol oluşturuldu',
  role_delete: 'Rol silindi',
  role_update: 'Rol güncellendi',
  role_assign: 'Rol atandı',
  role_unassign: 'Rol kaldırıldı',
  member_kick: 'Üye atıldı',
  member_ban: 'Üye yasaklandı',
  member_unban: 'Yasak kaldırıldı',
  member_timeout: 'Üye zaman aşımına uğradı',
  invite_create: 'Davet oluşturuldu',
  invite_delete: 'Davet silindi',
  message_delete_mod: 'Mesaj silindi (mod)',
};

export function AuditTab({ guildId }: { guildId: string }) {
  const users = useAppSelector((s) => s.users.byId);
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof api.guilds.auditLog>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.guilds
      .auditLog(guildId)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [guildId]);
  const [filter, setFilter] = useState('');
  const shownLogs = filter ? logs.filter((l) => l.action === filter) : logs;
  const actions = Array.from(new Set(logs.map((l) => l.action)));
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">Denetim Günlüğü</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm text-ink-primary"
        >
          <option value="">Tüm işlemler</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {AUDIT_LABELS[a] ?? a}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-ink-tertiary text-sm">Yükleniyor...</p>
      ) : shownLogs.length === 0 ? (
        <p className="text-ink-tertiary text-sm">Kayıt yok.</p>
      ) : (
        <ul className="space-y-1.5">
          {shownLogs.map((l) => {
            const actor = users[l.actor_id]?.display_name ?? `Kullanıcı ${l.actor_id.slice(-4)}`;
            return (
              <li
                key={l.id}
                className="bg-surface-2 border border-line rounded-lg px-3 py-2 flex items-center gap-3"
              >
                <span className="w-7 h-7 rounded-full bg-brand-500/15 text-brand-500 flex items-center justify-center shrink-0">
                  <ScrollText size={14} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-primary">
                    <span className="font-semibold">{actor}</span>{' '}
                    {AUDIT_LABELS[l.action] ?? l.action}
                    {l.reason ? <span className="text-ink-tertiary"> — {l.reason}</span> : null}
                  </div>
                  <div className="text-[11px] text-ink-tertiary">
                    {new Date(l.created_at).toLocaleString('tr-TR')}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
