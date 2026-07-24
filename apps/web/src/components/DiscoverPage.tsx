import { useEffect, useState } from 'react';
import { Compass, Search, Users, Hash } from 'lucide-react';
import { api } from '../api';
import { useAppDispatch, addToast, selectGuild, setMode } from '../store';
import { t, errText } from '../i18n';

interface DiscoverGuild {
  id: string;
  name: string;
  icon_text: string;
  icon_color: string;
  description: string;
  member_count: number;
  joined: boolean;
}

// Sol "Sunucular" sidebar'ı. İleride kategoriler/filtreler eklenebilir.
export function DiscoverSidebar() {
  return (
    <aside className="w-64 bg-surface-1 flex flex-col border-r border-line">
      <header className="h-14 px-4 flex items-center border-b border-line">
        <h2 className="text-ink-primary font-semibold text-[15px]">{t('discover.servers')}</h2>
      </header>
      <div className="flex-1 overflow-y-auto py-2 px-2.5 space-y-0.5">
        <div className="px-2 py-1.5 rounded-md bg-brand-500/10 text-brand-500 flex items-center gap-2.5 text-sm font-medium">
          <Compass size={16} />
          Keşfet
        </div>
        {/* İleride: kategoriler, favoriler, vb. */}
        <p className="px-2 pt-3 text-[11px] text-ink-tertiary leading-relaxed">
          Herkese açık toplulukları keşfet ve katıl. Yakında kategoriler ve önerilen sunucular
          eklenecek.
        </p>
      </div>
    </aside>
  );
}

export function DiscoverContent() {
  const dispatch = useAppDispatch();
  const [guilds, setGuilds] = useState<DiscoverGuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setGuilds(await api.guilds.discover());
    } catch {
      setGuilds([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  const filtered = guilds.filter((g) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
  });

  async function join(g: DiscoverGuild) {
    setJoiningId(g.id);
    try {
      await api.guilds.joinPublic(g.id);
      dispatch(addToast({ kind: 'success', message: t('guild.joined', { name: g.name }) }));
      dispatch(setMode('guild'));
      dispatch(selectGuild(g.id));
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: errText(e, t('invite.joinFailed')) }));
    } finally {
      setJoiningId(null);
    }
  }

  function open(g: DiscoverGuild) {
    dispatch(setMode('guild'));
    dispatch(selectGuild(g.id));
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-bg overflow-y-auto">
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-900 px-8 py-10 text-center">
        <h1 className="text-3xl font-extrabold text-white">{t('discover.title')}</h1>
        <p className="text-white/80 mt-2">{t('ui.herkeseAcikSunuculariBulVeSana')}</p>
        <div className="relative max-w-md mx-auto mt-5">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('discover.searchPlaceholder')}
            className="w-full bg-surface-1 border border-line rounded-lg pl-9 pr-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary focus:outline-none focus:border-brand-400"
          />
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <p className="text-ink-tertiary text-center py-10">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Compass size={40} className="text-ink-tertiary mx-auto mb-3" />
            <p className="text-ink-secondary">
              {guilds.length === 0 ? t('discover.none') : t('discover.noMatch')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((g) => (
              <div
                key={g.id}
                className="bg-surface-1 border border-line rounded-2xl overflow-hidden flex flex-col hover:border-brand-500/40 transition-colors"
              >
                <div
                  className="h-16"
                  style={{
                    background: `linear-gradient(135deg, ${g.icon_color}, ${g.icon_color}80)`,
                  }}
                />
                <div className="px-4 pb-4 -mt-7 flex-1 flex flex-col">
                  <div
                    className="w-14 h-14 rounded-2xl ring-4 ring-surface-1 flex items-center justify-center text-white font-bold text-lg mb-2"
                    style={{ backgroundColor: g.icon_color }}
                  >
                    {g.icon_text}
                  </div>
                  <h3 className="font-bold text-ink-primary truncate">{g.name}</h3>
                  <p className="text-xs text-ink-secondary line-clamp-2 mt-1 flex-1">
                    {g.description || t('discover.noDescription')}
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-ink-tertiary mt-2">
                    <Users size={12} />
                    {g.member_count} üye
                  </div>
                  {g.joined ? (
                    <button
                      onClick={() => open(g)}
                      className="mt-3 w-full py-2 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-primary text-sm font-semibold flex items-center justify-center gap-1.5"
                    >
                      <Hash size={14} /> Sunucuya Git
                    </button>
                  ) : (
                    <button
                      onClick={() => join(g)}
                      disabled={joiningId === g.id}
                      className="mt-3 w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-60 text-white text-sm font-semibold"
                    >
                      {joiningId === g.id ? t('common.joining') : t('common.join')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
