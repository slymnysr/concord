import { useEffect, useState } from 'react';
import { X, Hash, Volume2, Search, Send, Check } from 'lucide-react';
import { api, type APIDMChannel } from '../api';
import { useAppSelector } from '../store';
import { t } from '../i18n';

interface Props {
  content: string;
  messageId: string;
  onClose: () => void;
}

// Discord tarzı "İlet" — hedef kanal/DM seçici
export function ForwardModal({ content, messageId, onClose }: Props) {
  const guilds = useAppSelector((s) => s.guilds.list);
  const channelsByGuild = useAppSelector((s) => s.channels.byGuild);
  const me = useAppSelector((s) => s.auth.user);
  const [dms, setDMs] = useState<APIDMChannel[]>([]);
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.dms.list().then((list) => {
      setDMs(list);
      const ids = new Set<string>();
      list.forEach((d) => d.participants.forEach((p) => p !== me?.id && ids.add(p)));
      Promise.all(Array.from(ids).map((id) => api.users.user(id).catch(() => null))).then((us) => {
        const map: Record<string, string> = {};
        Array.from(ids).forEach((id, i) => { if (us[i]) map[id] = us[i]!.display_name; });
        setPartners(map);
      });
    }).catch(() => {});
  }, [me?.id]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  async function forwardAll() {
    if (busy || selected.size === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        [...selected].map((targetId) =>
          api.channels
            .sendMessage(targetId, comment.trim() || ' ', undefined, { forwarded_from_message_id: messageId })
            .catch(() => {}),
        ),
      );
      setDone(true);
      setTimeout(onClose, 700);
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  function dmTitle(dm: APIDMChannel): string {
    if (dm.type === 'group_dm') return dm.name || t('fwd.group');
    const other = dm.participants.find((p) => p !== me?.id);
    return partners[other ?? ''] ?? 'DM';
  }

  // Hedef listesi: tüm metin kanalları + DM'ler
  type Target = { id: string; label: string; sub: string; voice?: boolean };
  const targets: Target[] = [];
  for (const g of guilds) {
    for (const c of channelsByGuild[g.id] ?? []) {
      if (c.type === 'category' || c.type === 'voice' || c.type === 'stage') continue;
      targets.push({ id: c.id, label: `#${c.name}`, sub: g.name });
    }
  }
  for (const dm of dms) targets.push({ id: dm.id, label: dmTitle(dm), sub: t('fwd.dm') });
  const filtered = q ? targets.filter((t) => t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q)) : targets;

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-surface-1 border border-line rounded-2xl shadow-2xl flex flex-col max-h-[75vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink-primary flex items-center gap-2"><Send size={17} className="text-brand-500" /> İlet</h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary"><X size={18} /></button>
        </div>
        {/* İletilecek mesajın önizleme kartı */}
        <div className="px-4 pt-3">
          <div className="bg-surface-2 border-l-2 border-brand-500 rounded-r-lg px-3 py-2">
            <div className="text-[10px] uppercase font-bold text-ink-tertiary mb-0.5">{t('fwd.forwarded')}</div>
            <div className="text-xs text-ink-secondary line-clamp-2 break-words">{content?.trim() || '(ek/medya)'}</div>
          </div>
        </div>
        <div className="p-3 border-b border-line">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-tertiary" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('fwd.searchPlaceholder')} className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg pl-8 pr-2 py-1.5 text-sm text-ink-primary" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-ink-tertiary text-center py-8">{t('fwd.noTarget')}</p>
          ) : (
            filtered.slice(0, 50).map((tgt) => (
              <button
                key={tgt.id}
                onClick={() => toggle(tgt.id)}
                className={'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ' + (selected.has(tgt.id) ? 'bg-brand-500/10' : 'hover:bg-surface-2')}
              >
                <input type="checkbox" readOnly checked={selected.has(tgt.id)} className="w-4 h-4 accent-brand-500 shrink-0 pointer-events-none" />
                {tgt.sub === t('fwd.dm') ? <Volume2 size={15} className="text-ink-tertiary opacity-0" /> : <Hash size={15} className="text-ink-tertiary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-primary truncate">{tgt.label}</div>
                  <div className="text-[11px] text-ink-tertiary truncate">{tgt.sub}</div>
                </div>
              </button>
            ))
          )}
        </div>
        {/* Yorum + İlet */}
        <div className="p-3 border-t border-line space-y-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('fwd.notePlaceholder')}
            className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary"
          />
          <button
            onClick={forwardAll}
            disabled={selected.size === 0 || busy}
            className={'w-full py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 ' + (done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white')}
          >
            {done ? <><Check size={15} /> {t('fwd.forwarded2')}</> : busy ? t('common.sending') : (selected.size > 0 ? t('fwd.forwardCount', { n: selected.size }) : t('fwd.forwardBtn'))}
          </button>
        </div>
      </div>
    </div>
  );
}
