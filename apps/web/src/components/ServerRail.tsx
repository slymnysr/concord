import { useState, useRef, useEffect } from 'react';
import { httpUrl } from '../serverConfig';
import clsx from 'clsx';
import { Plus, Compass, Folder } from 'lucide-react';
import { useAppDispatch, useAppSelector, openModal, switchToDM, switchToGuild, switchToDiscover } from '../store';
import { api, type APIGuild } from '../api';
import { t } from '../i18n';

interface FolderView {
  id: string;
  name: string;
  color: number;
  position: number;
  guild_ids: string[];
}

export function ServerRail() {
  const guilds = useAppSelector((s) => s.guilds.list);
  const selectedId = useAppSelector((s) => s.guilds.selectedId);
  const mode = useAppSelector((s) => s.ui.mode);
  const dispatch = useAppDispatch();

  const [folders, setFolders] = useState<FolderView[]>([]);

  async function refreshFolders() {
    try {
      setFolders((await api.folders.list()) as FolderView[]);
    } catch {}
  }
  useEffect(() => {
    refreshFolders();
  }, []);

  return (
    <aside className="w-[76px] bg-bg flex flex-col items-center py-4 gap-3 border-r border-line">
      <button
        title={t('rail.friendsDM')} aria-label={t('rail.friendsDM')}
        onClick={() => dispatch(switchToDM())}
        className={
          'w-12 h-12 rounded-xl bg-surface-1 border border-line hover:border-brand-500/40 hover:scale-105 flex items-center justify-center overflow-hidden transition-all ' +
          (mode === 'dm' ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-bg shadow-glow border-brand-500 scale-105' : '')
        }
      >
        <img src="/brand/logo.svg" width={36} height={36} alt="" />
      </button>
      <div className="w-8 h-px bg-line" />

      <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto w-full items-center">
        {guilds.length === 0 && (
          <p className="text-[10px] text-ink-tertiary text-center px-2 pt-3">
            Henüz sunucun yok
          </p>
        )}

        {/* Klasörler */}
        {folders.map((f) => (
          <FolderView
            key={f.id}
            folder={f}
            guilds={guilds.filter((g) => f.guild_ids.includes(g.id))}
            selectedId={selectedId}
            mode={mode}
            onDropToFolder={async (guildId) => {
              if (f.guild_ids.includes(guildId)) return;
              await api.folders.update(f.id, {
                guild_ids: [...f.guild_ids, guildId],
              });
              refreshFolders();
            }}
            onRemove={async () => {
              if (!confirm(`"${f.name}" klasörünü sil?`)) return;
              await api.folders.delete(f.id);
              refreshFolders();
            }}
          />
        ))}

        {/* Klasörsüz sunucular */}
        {guilds
          .filter((g) => !folders.some((f) => f.guild_ids.includes(g.id)))
          .map((g, idx) => (
            <div
              key={g.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/concord-guild', g.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('text/concord-guild')) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/concord-guild');
                if (!draggedId || draggedId === g.id) return;
                try {
                  const order = JSON.parse(localStorage.getItem('concord_guild_order') ?? '[]') as string[];
                  const filtered = order.filter((id) => id !== draggedId && guilds.some((x) => x.id === id));
                  const targetIdx = filtered.indexOf(g.id);
                  const insertAt = targetIdx >= 0 ? targetIdx : idx;
                  filtered.splice(insertAt, 0, draggedId);
                  localStorage.setItem('concord_guild_order', JSON.stringify(filtered));
                  location.reload();
                } catch {}
              }}
            >
              <GuildIcon guild={g} active={g.id === selectedId && mode === 'guild'} />
            </div>
          ))}

        {/* Yeni klasör oluştur — sunucu ikonlarını gruplamak için (Discord tarzı).
            Yalnızca birkaç sunucu varken göster; azken gereksiz kalabalık yapmasın. */}
        {guilds.length >= 3 && (
          <button
            onClick={async () => {
              const name = prompt(t('rail.folderName'));
              if (!name?.trim()) return;
              await api.folders.create({ name: name.trim() });
              refreshFolders();
            }}
            title={t('rail.newFolder')} aria-label={t('rail.newFolder')}
            className="w-12 h-12 rounded-xl bg-surface-1 border border-dashed border-line hover:border-brand-500/40 text-ink-tertiary hover:text-brand-500 flex items-center justify-center transition-colors"
          >
            <Folder size={18} />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 items-center">
        <button
          onClick={() => dispatch(openModal('create_guild'))}
          className="w-12 h-12 rounded-xl bg-surface-1 hover:bg-brand-500/15 hover:text-brand-500 text-ink-secondary transition-colors flex items-center justify-center border border-line"
          title={t('rail.addServer')} aria-label={t('rail.addServer')}
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
        <button
          onClick={() => dispatch(switchToDiscover())}
          className={clsx(
            'w-12 h-12 rounded-xl bg-surface-1 hover:bg-brand-500/15 hover:text-brand-500 text-ink-secondary transition-colors flex items-center justify-center border border-line',
            mode === 'discover' && 'ring-2 ring-brand-500 ring-offset-2 ring-offset-bg border-brand-500 text-brand-500',
          )}
          title={t('rail.discover')} aria-label={t('rail.discover')}
        >
          <Compass size={20} />
        </button>
      </div>
    </aside>
  );
}

function GuildIcon({ guild, active }: { guild: APIGuild; active: boolean }) {
  const dispatch = useAppDispatch();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Bu sunucunun herhangi bir kanalında okunmamış mesaj var mı?
  const { hasUnread, totalMentions } = useAppSelector((s) => {
    const channels = s.channels.byGuild[guild.id] ?? [];
    let unread = false;
    let mentions = 0;
    for (const ch of channels) {
      if (ch.type === 'category') continue;
      const rs = s.readStates.byChannel[ch.id];
      mentions += rs?.mention_count ?? 0;
      if (
        ch.last_message_id &&
        (!rs?.last_message_id || rs.last_message_id < ch.last_message_id)
      ) {
        unread = true;
      }
    }
    return { hasUnread: unread, totalMentions: mentions };
  });
  const muted = typeof localStorage !== 'undefined' && localStorage.getItem('concord_guildmute_' + guild.id) === '1';

  return (
    <div className={'relative ' + (muted ? 'opacity-50' : '')}>
      <button
        onClick={() => dispatch(switchToGuild(guild.id))}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        title={guild.name}
        className={clsx(
          'relative w-12 h-12 rounded-xl flex items-center justify-center font-bold text-white text-[15px] tracking-tight transition-all duration-200 overflow-hidden',
          active
            ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-bg shadow-glow scale-105'
            : 'opacity-85 hover:opacity-100 hover:scale-105',
        )}
        style={{ backgroundColor: guild.icon_color }}
      >
        {(guild as any).icon_url_v2 ? (
          <img src={(guild as any).icon_url_v2} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          guild.icon_text
        )}
        {active && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-brand-500" />
        )}
      </button>
      {/* Okunmamış göstergesi: sol kenarda beyaz dik bar, mention varsa kırmızı sayı */}
      {!active && hasUnread && (
        <span className="absolute left-[-12px] top-1/2 -translate-y-1/2 w-1 h-2 rounded-r-full bg-ink-primary" />
      )}
      {totalMentions > 0 && (
        <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1.5 rounded-full bg-accent-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-bg">
          {totalMentions > 99 ? '99+' : totalMentions}
        </span>
      )}
      {menu && <GuildContextMenu guild={guild} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}

function GuildContextMenu({
  guild,
  x,
  y,
  onClose,
}: {
  guild: APIGuild;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const w = 220;
  let left = x;
  let top = y;
  if (left + w > window.innerWidth) left = window.innerWidth - w - 8;
  if (top + 200 > window.innerHeight) top = window.innerHeight - 200 - 8;
  async function leave() {
    if (!confirm(`${guild.name} sunucusundan ayrılmak istiyor musun?`)) return;
    try {
      await fetch(httpUrl(`/api/v1/guilds/${guild.id}/leave`), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('concord_access') },
      });
      location.reload();
    } catch {}
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={ref}
        style={{ left, top, width: w }}
        className="absolute bg-surface-1 border border-line rounded-xl shadow-2xl p-1 pointer-events-auto ring-1 ring-white/5"
      >
        <button
          onClick={() => {
            dispatch(openModal('invite_link'));
            onClose();
          }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-primary hover:bg-surface-2"
        >
          Arkadaşlarını Davet Et
        </button>
        <button
          onClick={() => {
            dispatch(openModal('server_settings'));
            onClose();
          }}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-ink-primary hover:bg-surface-2"
        >
          Sunucu Ayarları
        </button>
        <div className="my-1 h-px bg-line" />
        <button
          onClick={leave}
          className="w-full text-left px-3 py-2 rounded-lg text-sm text-accent-500 hover:bg-accent-500/10"
        >
          Sunucudan Ayrıl
        </button>
      </div>
    </div>
  );
}

function FolderView({
  folder,
  guilds,
  selectedId,
  mode,
  onDropToFolder,
  onRemove,
}: {
  folder: FolderView;
  guilds: APIGuild[];
  selectedId: string | null;
  mode: 'guild' | 'dm' | 'discover';
  onDropToFolder: (guildId: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [over, setOver] = useState(false);
  const color = '#' + folder.color.toString(16).padStart(6, '0');

  return (
    <div className="w-full flex flex-col items-center gap-2.5">
      <button
        onClick={() => setOpen((v) => !v)}
        onContextMenu={(e) => {
          e.preventDefault();
          onRemove();
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('text/concord-guild')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const id = e.dataTransfer.getData('text/concord-guild');
          if (id) onDropToFolder(id);
        }}
        title={folder.name + ' (sağ tık ile sil)'}
        className={clsx(
          'w-12 h-12 rounded-2xl flex items-center justify-center transition-all',
          open ? 'rounded-2xl' : '',
          over ? 'scale-110 ring-2 ring-brand-500' : '',
        )}
        style={{ backgroundColor: color + '30' }}
      >
        <Folder size={20} style={{ color }} />
      </button>
      {open && (
        <div className="flex flex-col gap-2.5">
          {guilds.map((g) => (
            <GuildIcon key={g.id} guild={g} active={g.id === selectedId && mode === 'guild'} />
          ))}
        </div>
      )}
    </div>
  );
}
