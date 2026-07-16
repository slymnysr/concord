import { useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Volume2, Users as UsersIcon, MessageCircle } from 'lucide-react';
import { api, type APIDMChannel } from '../api';
import {
  useAppDispatch,
  useAppSelector,
  setMode,
  selectGuild,
  selectChannel,
  selectDM,
} from '../store';
import { t } from '../i18n';

interface Item {
  key: string;
  kind: 'guild' | 'channel' | 'dm';
  label: string;
  sub?: string;
  guildId?: string;
  channelId?: string;
  voice?: boolean;
  color?: string;
}

// Ctrl/Cmd+K hızlı geçiş: sunucu, kanal ve DM'ler arasında anında atla
export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const guilds = useAppSelector((s) => s.guilds.list);
  const byGuild = useAppSelector((s) => s.channels.byGuild);
  const currentGuildId = useAppSelector((s) => s.guilds.selectedId);
  const users = useAppSelector((s) => s.users.byId);
  const me = useAppSelector((s) => s.auth.user);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [dms, setDms] = useState<APIDMChannel[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.dms.list().then(setDms).catch(() => {});
  }, []);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const g of guilds) {
      out.push({ key: 'g' + g.id, kind: 'guild', label: g.name, sub: t('quick.server'), guildId: g.id, color: g.icon_color });
    }
    for (const [gid, list] of Object.entries(byGuild)) {
      const gname = guilds.find((g) => g.id === gid)?.name ?? '';
      for (const c of list ?? []) {
        if (c.type === 'category') continue;
        out.push({
          key: 'c' + c.id,
          kind: 'channel',
          label: c.name,
          sub: gname,
          guildId: gid,
          channelId: c.id,
          voice: c.type === 'voice',
        });
      }
    }
    for (const dm of dms) {
      const other = dm.participants.find((p) => p !== me?.id);
      const name =
        dm.type === 'group_dm'
          ? dm.name || t('quick.group')
          : users[other ?? '']?.display_name ?? dm.name ?? t('quick.dm');
      out.push({ key: 'd' + dm.id, kind: 'dm', label: name, sub: t('quick.directMessage'), channelId: dm.id });
    }
    // Mevcut sunucunun kanalları ve DM'ler öne gelsin
    out.sort((a, b) => {
      const pa = a.guildId === currentGuildId ? 0 : a.kind === 'dm' ? 1 : 2;
      const pb = b.guildId === currentGuildId ? 0 : b.kind === 'dm' ? 1 : 2;
      return pa - pb;
    });
    return out;
  }, [guilds, byGuild, dms, users, me?.id, currentGuildId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query ? items.filter((i) => i.label.toLowerCase().includes(query)) : items;
    return list.slice(0, 50);
  }, [items, q]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  function go(it: Item) {
    if (it.kind === 'guild' && it.guildId) {
      dispatch(setMode('guild'));
      dispatch(selectGuild(it.guildId));
    } else if (it.kind === 'channel' && it.guildId && it.channelId) {
      dispatch(setMode('guild'));
      dispatch(selectGuild(it.guildId));
      dispatch(selectChannel(it.channelId));
    } else if (it.kind === 'dm' && it.channelId) {
      dispatch(setMode('dm'));
      dispatch(selectDM(it.channelId));
      dispatch(selectChannel(it.channelId));
    }
    onClose();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) go(filtered[active]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center pt-24" onClick={onClose}>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-surface-1 border border-line rounded-2xl shadow-2xl overflow-hidden"
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder={t('quick.placeholder')}
          className="w-full bg-transparent px-4 py-3.5 text-ink-primary placeholder:text-ink-tertiary focus:outline-none border-b border-line"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-ink-tertiary">{t('common.noResults')}</li>
          ) : (
            filtered.map((it, i) => (
              <li key={it.key}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it)}
                  className={
                    'w-full flex items-center gap-2.5 px-4 py-2 text-left ' +
                    (i === active ? 'bg-brand-500/15' : 'hover:bg-surface-2')
                  }
                >
                  {it.kind === 'guild' ? (
                    <span
                      className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                      style={{ backgroundColor: it.color ?? '#5865F2' }}
                    >
                      {it.label.slice(0, 1).toUpperCase()}
                    </span>
                  ) : it.kind === 'dm' ? (
                    <MessageCircle size={16} className="text-ink-tertiary shrink-0" />
                  ) : it.voice ? (
                    <Volume2 size={16} className="text-ink-tertiary shrink-0" />
                  ) : (
                    <Hash size={16} className="text-ink-tertiary shrink-0" />
                  )}
                  <span className="flex-1 min-w-0 truncate text-sm text-ink-primary">{it.label}</span>
                  {it.sub && <span className="text-[11px] text-ink-tertiary shrink-0">{it.sub}</span>}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 py-2 border-t border-line text-[11px] text-ink-tertiary flex items-center gap-3">
          <UsersIcon size={11} /> {t('quick.hint')}
        </div>
      </div>
    </div>
  );
}
