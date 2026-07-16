import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAppSelector } from '../../store';
import { api } from '../../api';
import { t } from '../../i18n';

const AUDIT_LABELS: Record<string, string> = {
  guild_update: t('audit.guildUpdate'),
  channel_create: t('audit.channelCreate'),
  channel_delete: t('audit.channelDelete'),
  channel_update: t('audit.channelUpdate'),
  role_create: t('audit.roleCreate'),
  role_delete: t('audit.roleDelete'),
  role_update: t('audit.roleUpdate'),
  role_assign: t('audit.roleAssign'),
  role_unassign: t('audit.roleRemove'),
  member_kick: t('audit.memberKick'),
  member_ban: t('audit.memberBan'),
  member_unban: t('audit.memberUnban'),
  member_timeout: t('audit.memberTimeout'),
  invite_create: t('audit.inviteCreate'),
  invite_delete: t('audit.inviteDelete'),
  message_delete_mod: t('audit.messageDelete'),
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
        <h2 className="text-2xl font-bold text-ink-primary">{t('audit.title')}</h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm text-ink-primary"
        >
          <option value="">{t('audit.allActions')}</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {AUDIT_LABELS[a] ?? a}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <p className="text-ink-tertiary text-sm">{t('common.loading')}</p>
      ) : shownLogs.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('audit.noRecords')}</p>
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
