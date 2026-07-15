import { useEffect, useRef, useState } from 'react';
import { Search, Hash, MessageSquare } from 'lucide-react';
import { api, type APISearchResult } from '../api';
import { useAppDispatch, useAppSelector, selectGuild, selectChannel, closeModal } from '../store';

export function SearchModal() {
  const [q, setQ] = useState('');
  const mode = useAppSelector((s) => s.ui.mode);
  // DM görünümünde varsayılan kapsam "bu sohbet" (sunucu kapsamı DM'de anlamsız)
  const [scope, setScope] = useState<'all' | 'guild' | 'channel'>(mode === 'dm' ? 'channel' : 'guild');
  const [results, setResults] = useState<APISearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const channelId = useAppSelector((s) => s.channels.selectedId);
  const guildChannels = useAppSelector((s) => (s.guilds.selectedId ? s.channels.byGuild[s.guilds.selectedId] ?? [] : []));
  const [members, setMembers] = useState<Awaited<ReturnType<typeof api.guilds.members>>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (guildId) api.guilds.members(guildId).then(setMembers).catch(() => {});
  }, [guildId]);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const opts: any = { limit: 25 };
        if (scope === 'guild' && guildId) opts.guildId = guildId;
        if (scope === 'channel' && channelId) opts.channelId = channelId;

        let text = q;
        const findMember = (token: string) => {
          const t = token.toLowerCase().replace(/^@/, '');
          return members.find(
            (m) =>
              (m.nickname ?? '').toLowerCase().includes(t) ||
              m.display_name.toLowerCase().includes(t) ||
              m.username.toLowerCase().includes(t),
          );
        };
        // from:kullanıcı → yazar
        const fromMatch = text.match(/\bfrom:(\S+)/i);
        if (fromMatch) {
          const mem = findMember(fromMatch[1]);
          if (mem) opts.authorId = mem.user_id;
          text = text.replace(/\bfrom:\S+/i, '').trim();
        }
        // mentions:kullanıcı → bahsedilen
        const menMatch = text.match(/\bmentions:(\S+)/i);
        if (menMatch) {
          const mem = findMember(menMatch[1]);
          if (mem) opts.mentions = mem.user_id;
          text = text.replace(/\bmentions:\S+/i, '').trim();
        }
        // in:#kanal → kanal
        const inMatch = text.match(/\bin:(\S+)/i);
        if (inMatch) {
          const token = inMatch[1].toLowerCase().replace(/^#/, '');
          const ch = guildChannels.find((c) => c.name.toLowerCase().includes(token));
          if (ch) opts.channelId = ch.id;
          text = text.replace(/\bin:\S+/i, '').trim();
        }
        // has:image|link|video|file|sound (çoklu)
        const hasTokens = [...text.matchAll(/\bhas:(\w+)/gi)].map((m) => m[1].toLowerCase());
        if (hasTokens.length) {
          opts.has = hasTokens;
          text = text.replace(/\bhas:\w+/gi, '').trim();
        }
        // pinned:true
        if (/\bpinned:true\b/i.test(text)) {
          opts.pinned = true;
          text = text.replace(/\bpinned:true\b/i, '').trim();
        }
        // before:/after:/during: YYYY-MM-DD
        for (const op of ['before', 'after', 'during'] as const) {
          const m = text.match(new RegExp(`\\b${op}:(\\d{4}-\\d{2}-\\d{2})`, 'i'));
          if (m) {
            opts[op] = m[1];
            text = text.replace(new RegExp(`\\b${op}:\\S+`, 'i'), '').trim();
          }
        }
        const r = await api.search.messages(text || ' ', opts);
        setResults(r);
      } catch (e) {
        console.warn('search', e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, scope, guildId, channelId, members, guildChannels]);

  function jumpTo(r: APISearchResult) {
    if (r.channel.guild_id) {
      dispatch(selectGuild(r.channel.guild_id));
    }
    dispatch(selectChannel(r.channel.id));
    dispatch(closeModal());
    // Kanal yüklendikten sonra mesaja kaydır + vurgula
    const mid = r.message.id;
    const cid = r.channel.id;
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('concord:jump-to-message', { detail: { messageId: mid, channelId: cid } }));
    }, 350);
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
          <Search size={20} />
        </div>
        <h2 className="text-xl font-bold text-ink-primary">Mesaj ara</h2>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setScope('channel')}
          disabled={!channelId}
          className={
            'px-3 py-1 rounded-lg text-xs font-medium ' +
            (scope === 'channel'
              ? 'bg-brand-500/15 text-brand-500'
              : 'bg-surface-2 text-ink-secondary hover:bg-surface-3 disabled:opacity-40')
          }
        >
          {mode === 'dm' ? 'Bu sohbet' : 'Bu kanal'}
        </button>
        <button
          onClick={() => setScope('guild')}
          disabled={!guildId || mode === 'dm'}
          className={
            'px-3 py-1 rounded-lg text-xs font-medium ' +
            (scope === 'guild'
              ? 'bg-brand-500/15 text-brand-500'
              : 'bg-surface-2 text-ink-secondary hover:bg-surface-3 disabled:opacity-40')
          }
        >
          Bu sunucu
        </button>
        <button
          onClick={() => setScope('all')}
          className={
            'px-3 py-1 rounded-lg text-xs font-medium ' +
            (scope === 'all'
              ? 'bg-brand-500/15 text-brand-500'
              : 'bg-surface-2 text-ink-secondary hover:bg-surface-3')
          }
        >
          Hepsi
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara… (from:, mentions:, in:, has:, before:, after:, pinned:true)"
          className="w-full pl-9 pr-3 py-2.5 bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg text-ink-primary"
        />
      </div>
      {!q && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[
            'from:kullanıcı',
            'mentions:kullanıcı',
            'in:#kanal',
            'has:image',
            'has:link',
            'before:2026-01-01',
            'after:2026-01-01',
            'pinned:true',
          ].map((op) => (
            <button
              key={op}
              onClick={() => setQ((v) => (v ? v + ' ' : '') + op.split(':')[0] + ':')}
              className="text-[11px] font-mono px-2 py-1 rounded bg-surface-2 text-ink-tertiary hover:text-brand-400 hover:bg-surface-3"
            >
              {op}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-96 overflow-y-auto space-y-2">
        {loading && <p className="text-sm text-ink-tertiary">Aranıyor...</p>}
        {!loading && q && results.length === 0 && (
          <p className="text-sm text-ink-tertiary text-center py-6">
            "{q}" için sonuç bulunamadı.
          </p>
        )}
        {results.map((r) => (
          <button
            key={r.message.id}
            onClick={() => jumpTo(r)}
            className="w-full text-left bg-surface-2 hover:bg-surface-3 border border-line rounded-xl p-3 flex gap-3 transition-colors"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: r.author?.avatar_color ?? '#6B7280' }}
            >
              {(r.author?.display_name ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="font-semibold text-ink-primary text-sm truncate">
                  {r.author?.display_name ?? 'Bilinmeyen'}
                </span>
                <span className="text-[10px] text-ink-tertiary flex items-center gap-0.5">
                  {r.channel.guild_id ? <Hash size={10} /> : <MessageSquare size={10} />}
                  {r.channel.name}
                </span>
                <span className="text-[10px] text-ink-tertiary ml-auto">
                  {new Date(r.message.created_at).toLocaleString('tr-TR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-ink-secondary line-clamp-2 break-words">
                {highlightMatch(r.message.content, q)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function highlightMatch(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(re);
    return parts.map((p, i) =>
      re.test(p) ? (
        <mark key={i} className="bg-brand-500/30 text-brand-500 rounded px-0.5">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  } catch {
    return text;
  }
}
