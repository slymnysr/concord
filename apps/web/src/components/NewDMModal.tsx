import { useEffect, useMemo, useState } from 'react';
import { Check, Search, Users } from 'lucide-react';
import { api } from '../api';
import { useAppDispatch, closeModal, selectDM, selectChannel, setMode } from '../store';
import { t } from '../i18n';

interface Friend {
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  status: string;
  friendship: string;
}

// "Mesaj Oluştur" penceresi — arkadaş seç, tek kişi seçilirse DM,
// birden çok kişi seçilirse grup DM oluşturur.
export function NewDMModal() {
  const dispatch = useAppDispatch();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.friends
      .list()
      .then((list) => {
        if (cancelled) return;
        setFriends(list.filter((f) => f.friendship === 'accepted'));
      })
      .catch(() => setFriends([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) => f.display_name.toLowerCase().includes(q) || f.username.toLowerCase().includes(q),
    );
  }, [friends, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function create() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      let channelId: string;
      if (ids.length === 1) {
        const res = await api.dms.open(ids[0]);
        channelId = res.channel_id;
      } else {
        const res = await api.dms.createGroup(ids);
        channelId = res.channel_id;
      }
      dispatch(setMode('dm'));
      dispatch(selectDM(channelId));
      dispatch(selectChannel(channelId));
      dispatch(closeModal());
    } catch (e: any) {
      setError(e?.message || t('dm.createFailed'));
    } finally {
      setBusy(false);
    }
  }

  const isGroup = selected.size > 1;

  return (
    <div className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <Users size={18} className="text-brand-500" />
        <h2 className="text-lg font-bold text-ink-primary">
          {isGroup ? t('dm.createGroup') : t('dm.createMessage')}
        </h2>
      </div>
      <p className="text-sm text-ink-secondary mb-3">
        Arkadaşlarından birini seç ya da grup sohbeti için birden fazla kişi seç (en fazla 10 kişi).
      </p>

      {/* Seçili kişiler */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {Array.from(selected).map((id) => {
            const f = friends.find((x) => x.user_id === id);
            if (!f) return null;
            return (
              <button
                key={id}
                onClick={() => toggle(id)}
                className="flex items-center gap-1.5 bg-brand-500/15 text-brand-300 text-xs font-medium pl-1 pr-2 py-1 rounded-full hover:bg-brand-500/25"
                title={t('common.remove')}
                aria-label={t('common.remove')}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
                  style={{ backgroundColor: f.avatar_color }}
                >
                  {f.display_name.slice(0, 1).toUpperCase()}
                </span>
                {f.display_name}
                <span className="text-brand-400">×</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('dm.searchFriend')}
          autoFocus
          className="w-full bg-surface-2 border border-line rounded-lg pl-9 pr-3 py-2 text-sm text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
      </div>

      <div className="max-h-72 overflow-y-auto -mx-1 px-1 space-y-0.5">
        {loading ? (
          <p className="text-sm text-ink-tertiary px-2 py-4 text-center">{t('common.loading')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-ink-tertiary px-2 py-4 text-center">
            {friends.length === 0 ? t('dm.noFriends') : t('dm.noMatchFriend')}
          </p>
        ) : (
          filtered.map((f) => {
            const checked = selected.has(f.user_id);
            return (
              <button
                key={f.user_id}
                onClick={() => toggle(f.user_id)}
                className={
                  'w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left ' +
                  (checked ? 'bg-brand-500/10' : 'hover:bg-surface-2')
                }
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: f.avatar_color }}
                >
                  {f.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-ink-primary truncate">
                    {f.display_name}
                  </span>
                  <span className="block text-xs text-ink-tertiary truncate">{f.username}</span>
                </span>
                <span
                  className={
                    'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ' +
                    (checked ? 'bg-brand-500 border-brand-500' : 'border-line')
                  }
                >
                  {checked && <Check size={13} className="text-white" />}
                </span>
              </button>
            );
          })
        )}
      </div>

      {error && <p className="text-sm text-accent-500 mt-3">{error}</p>}

      <button
        onClick={create}
        disabled={selected.size === 0 || busy}
        className="mt-4 w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold transition-colors"
      >
        {busy
          ? t('common.creating')
          : selected.size === 0
            ? t('dm.pickPerson')
            : isGroup
              ? t('dm.startGroup', { n: selected.size })
              : t('dm.sendMessage')}
      </button>
    </div>
  );
}
