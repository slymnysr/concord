import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { api, type APIBan } from '../../api';
import { t, localeTag } from '../../i18n';

export function BansTab({ guildId }: { guildId: string }) {
  const [bans, setBans] = useState<APIBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function refresh() {
    const list = await api.guilds.bans(guildId).catch(() => []);
    setBans(list);
    setSelected(new Set());
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function unban(userId: string) {
    if (!confirm(t('ban.removeConfirm'))) return;
    await api.guilds.unban(guildId, userId);
    refresh();
  }
  async function bulkUnban() {
    if (selected.size === 0) return;
    if (!confirm(t('ban.unbanConfirm', { n: selected.size }))) return;
    await Promise.all([...selected].map((id) => api.guilds.unban(guildId, id).catch(() => {})));
    refresh();
  }
  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (loading) return <p className="text-ink-tertiary">{t('common.loading')}</p>;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? bans.filter((b) => b.user_id.includes(q) || (b.reason ?? '').toLowerCase().includes(q))
    : bans;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-ink-primary">
          Banlanmış Kullanıcılar ({bans.length})
        </h2>
        {selected.size > 0 && (
          <button
            onClick={bulkUnban}
            className="px-3 py-1.5 rounded-lg text-sm bg-accent-500/15 hover:bg-accent-500 hover:text-white text-accent-500 font-semibold"
          >
            Seçilenleri kaldır ({selected.size})
          </button>
        )}
      </div>
      {bans.length > 0 && (
        <div className="relative mb-3">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('ban.searchPlaceholder')}
            className="w-full bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-ink-primary"
          />
        </div>
      )}
      {bans.length === 0 && <p className="text-ink-tertiary text-sm">{t('ban.none')}</p>}
      {bans.length > 0 && filtered.length === 0 && (
        <p className="text-ink-tertiary text-sm">{t('ban.noMatch')}</p>
      )}
      <ul className="space-y-2">
        {filtered.map((b) => (
          <li
            key={b.user_id}
            className="bg-surface-2 border border-line rounded-xl p-3 flex items-center gap-3"
          >
            <input
              type="checkbox"
              checked={selected.has(b.user_id)}
              onChange={() => toggle(b.user_id)}
              className="w-4 h-4 accent-brand-500 shrink-0"
            />
            <div className="flex-1">
              <div className="text-ink-primary font-mono text-sm">{b.user_id}</div>
              {b.reason && <div className="text-xs text-ink-tertiary mt-1">Sebep: {b.reason}</div>}
              <div className="text-xs text-ink-muted mt-1">
                {new Date(b.banned_at).toLocaleString(localeTag())}
              </div>
            </div>
            <button
              onClick={() => unban(b.user_id)}
              className="px-3 py-1.5 rounded-lg text-sm bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-secondary"
            >
              Banı Kaldır
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
