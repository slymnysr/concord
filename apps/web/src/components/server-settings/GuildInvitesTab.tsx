import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAppSelector } from '../../store';
import { api } from '../../api';
import { t } from '../../i18n';

export function GuildInvitesTab({ guildId }: { guildId: string }) {
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof api.guilds.invites>>>([]);
  const users = useAppSelector((s) => s.users.byId);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    setInvites(await api.guilds.invites(guildId).catch(() => []));
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, [guildId]);
  async function create() {
    await api.guilds.createInvite(guildId, { max_uses: 0, expires_in_sec: 604800 }).catch(() => {});
    refresh();
  }
  async function revoke(code: string) {
    await api.invites.delete(code).catch(() => {});
    setInvites((xs) => xs.filter((i) => i.code !== code));
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">{t('invite.listTitle')}</h2>
        <button
          onClick={create}
          className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold"
        >
          Davet Oluştur
        </button>
      </div>
      {loading ? (
        <p className="text-ink-tertiary text-sm">{t('common.loading')}</p>
      ) : invites.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('invite.noActive')}</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.code}
              className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-2.5"
            >
              <code className="text-sm text-brand-400 font-mono flex-1">
                concord.com/davet/{inv.code}
              </code>
              <span className="text-xs text-ink-tertiary">
                {users[inv.inviter_id]?.display_name ?? '—'} · {inv.uses}
                {inv.max_uses ? `/${inv.max_uses}` : ''} kullanım
              </span>
              <button
                onClick={() => navigator.clipboard?.writeText(`${location.host}/davet/${inv.code}`)}
                className="text-ink-tertiary hover:text-ink-primary text-xs"
              >
                Kopyala
              </button>
              <button
                onClick={() => revoke(inv.code)}
                className="text-ink-tertiary hover:text-accent-500"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
