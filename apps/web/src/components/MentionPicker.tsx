import { useEffect, useMemo, useState } from 'react';
import { Hash, Volume2, AtSign, Slash } from 'lucide-react';
import { useAppSelector } from '../store';
import { api } from '../api';
import { t } from '../i18n';

interface Props {
  type: '@' | '#' | ':' | '/';
  query: string;
  onPick: (text: string) => void;
  onClose: () => void;
}

export function MentionPicker({ type, query, onPick, onClose }: Props) {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const members = useAppSelector((s) => (guildId ? (s.members.byGuild[guildId] ?? []) : []));
  const channels = useAppSelector((s) => (guildId ? (s.channels.byGuild[guildId] ?? []) : []));
  const [emojis, setEmojis] = useState<Awaited<ReturnType<typeof api.emojis.list>>>([]);
  const [commands, setCommands] = useState<Awaited<ReturnType<typeof api.commands.list>>>([]);

  useEffect(() => {
    if (!guildId) return;
    if (type === ':')
      api.emojis
        .list(guildId)
        .then(setEmojis)
        .catch(() => {});
    if (type === '/')
      api.commands
        .list(guildId)
        .then(setCommands)
        .catch(() => {});
  }, [type, guildId]);

  const items = useMemo(() => {
    const q = query.toLowerCase();
    if (type === '@') {
      const u = members
        .filter(
          (m) =>
            (m.nickname ?? m.display_name).toLowerCase().includes(q) ||
            m.username.toLowerCase().includes(q),
        )
        .slice(0, 8);
      return u.map((m) => ({
        key: m.user_id,
        label: m.nickname ?? m.display_name,
        sub: '@' + m.username,
        color: m.avatar_color,
        replacement: `<@${m.user_id}>`,
      }));
    }
    if (type === ':') {
      const matches = emojis.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 10);
      return matches.map((e) => ({
        key: e.id,
        label: ':' + e.name + ':',
        sub: t('mention.customEmoji'),
        color: '#5865F2',
        replacement: `<:${e.name}:${e.id}>`,
        imageUrl: e.url,
      }));
    }
    if (type === '/') {
      const matches = commands.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10);
      return matches.map((c) => {
        const hint = (c.options ?? [])
          .map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`))
          .join(' ');
        return {
          key: c.id,
          label: '/' + c.name + (hint ? ' ' + hint : ''),
          sub: c.description,
          color: '#5865F2',
          // Argümanlı komutta boşluk bırak ki kullanıcı değer yazabilsin
          replacement: '/' + c.name + ((c.options ?? []).length > 0 ? ' ' : ''),
        };
      });
    }
    const cs = channels
      .filter((c) => c.type !== 'category' && c.name.toLowerCase().includes(q))
      .slice(0, 8);
    return cs.map((c) => ({
      key: c.id,
      label: c.name,
      sub: c.type === 'voice' ? t('mention.voice') : c.type,
      color: c.type === 'voice' ? '#7C7CDD' : '#5865F2',
      replacement: `<#${c.id}>`,
    }));
  }, [type, query, members, channels, emojis, commands]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <div className="absolute bottom-full left-2 right-2 mb-1 bg-surface-1 border border-line rounded-xl shadow-2xl max-h-60 overflow-y-auto z-10">
      <div className="text-[10px] font-bold uppercase text-ink-tertiary tracking-wider px-3 py-2 border-b border-line flex items-center gap-1.5">
        {type === '@' ? (
          <AtSign size={12} />
        ) : type === '#' ? (
          <Hash size={12} />
        ) : type === '/' ? (
          <Slash size={12} />
        ) : (
          <span>:</span>
        )}
        {type === '@'
          ? t('mention.members')
          : type === '#'
            ? t('mention.channels')
            : type === ':'
              ? t('mention.emojis')
              : t('mention.commands')}
        <span className="text-ink-muted">— {t('common.resultCount', { n: items.length })}</span>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(it.replacement);
              }}
              className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-surface-2 transition-colors"
            >
              {type === '@' ? (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                  style={{ backgroundColor: it.color }}
                >
                  {it.label.slice(0, 1).toUpperCase()}
                </div>
              ) : type === ':' && (it as any).imageUrl ? (
                <img
                  src={(it as any).imageUrl}
                  alt=""
                  className="w-6 h-6 object-contain shrink-0"
                />
              ) : type === '/' ? (
                <Slash size={14} className="text-ink-tertiary shrink-0" />
              ) : (
                <span className="w-6 h-6 flex items-center justify-center shrink-0">
                  {it.sub === t('mention.voice') ? (
                    <Volume2 size={14} className="text-ink-tertiary" />
                  ) : (
                    <Hash size={14} className="text-ink-tertiary" />
                  )}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-primary truncate font-medium">{it.label}</div>
                <div className="text-[10px] text-ink-tertiary truncate">{it.sub}</div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
