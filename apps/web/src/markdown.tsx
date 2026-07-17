import React from 'react';

// Concord mesaj markdown — Discord-stiline yakın hafif parser
// Destekler: **bold**, *italic*, __underline__, ~~strike~~, `inline code`,
// ```code block```, > blockquote, ||spoiler||, URLs, @mentions

type Node =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; children: Node[] }
  | { kind: 'italic'; children: Node[] }
  | { kind: 'underline'; children: Node[] }
  | { kind: 'strike'; children: Node[] }
  | { kind: 'code'; value: string }
  | { kind: 'codeblock'; lang: string; value: string }
  | { kind: 'blockquote'; children: Node[] }
  | { kind: 'spoiler'; children: Node[] }
  | { kind: 'link'; href: string }
  | { kind: 'mention'; username: string }
  | { kind: 'user_mention'; userId: string }
  | { kind: 'channel_mention'; channelId: string }
  | { kind: 'heading'; level: number; children: Node[] }
  | { kind: 'emoji'; name: string }
  | { kind: 'listitem'; ordered: boolean; num: number; indent: number; children: Node[] }
  | { kind: 'role_mention'; roleId: string }
  | { kind: 'timestamp'; unix: number; style: string }
  | { kind: 'masklink'; text: string; href: string }
  | { kind: 'subtext'; children: Node[] }
  | { kind: 'everyone' };

// inline parser — recursive
function parseInline(src: string): Node[] {
  const out: Node[] = [];
  let i = 0;
  while (i < src.length) {
    // URL
    // :emoji_adi: özel emoji
    const emojiMatch = src.slice(i).match(/^:([a-z0-9_]{2,32}):/i);
    if (emojiMatch) {
      out.push({ kind: 'emoji', name: emojiMatch[1] });
      i += emojiMatch[0].length;
      continue;
    }

    const urlMatch = src.slice(i).match(/^https?:\/\/[^\s]+/);
    if (urlMatch) {
      out.push({ kind: 'link', href: urlMatch[0] });
      i += urlMatch[0].length;
      continue;
    }
    // Çıplak www. bağlantısı → https:// ekleyerek linkle
    const wwwMatch = src.slice(i).match(/^www\.[^\s]+\.[^\s]+/);
    if (wwwMatch && (i === 0 || /\s/.test(src[i - 1]))) {
      out.push({ kind: 'masklink', text: wwwMatch[0], href: 'https://' + wwwMatch[0] });
      i += wwwMatch[0].length;
      continue;
    }
    // Inline code
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i) {
        out.push({ kind: 'code', value: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // Spoiler ||...||
    if (src.startsWith('||', i)) {
      const end = src.indexOf('||', i + 2);
      if (end > i) {
        out.push({ kind: 'spoiler', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // Bold **
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end > i) {
        out.push({ kind: 'bold', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // Underline __
    if (src.startsWith('__', i)) {
      const end = src.indexOf('__', i + 2);
      if (end > i) {
        out.push({ kind: 'underline', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // Strike ~~
    if (src.startsWith('~~', i)) {
      const end = src.indexOf('~~', i + 2);
      if (end > i) {
        out.push({ kind: 'strike', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    // Italic *
    if (src[i] === '*') {
      const end = src.indexOf('*', i + 1);
      if (end > i) {
        out.push({ kind: 'italic', children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    // <@id> kullanıcı mention (backend formatı)
    const userMention = src.slice(i).match(/^<@(\d{10,20})>/);
    if (userMention) {
      out.push({ kind: 'user_mention', userId: userMention[1] });
      i += userMention[0].length;
      continue;
    }
    // <#id> kanal mention (backend formatı)
    const channelMention = src.slice(i).match(/^<#(\d{10,20})>/);
    if (channelMention) {
      out.push({ kind: 'channel_mention', channelId: channelMention[1] });
      i += channelMention[0].length;
      continue;
    }
    // <@&id> rol mention
    const roleMention = src.slice(i).match(/^<@&(\d{10,20})>/);
    if (roleMention) {
      out.push({ kind: 'role_mention', roleId: roleMention[1] });
      i += roleMention[0].length;
      continue;
    }
    // <t:unix(:stil)?> zaman damgası
    const ts = src.slice(i).match(/^<t:(\d{1,15})(?::([tTdDfFR]))?>/);
    if (ts) {
      out.push({ kind: 'timestamp', unix: parseInt(ts[1], 10), style: ts[2] || 'f' });
      i += ts[0].length;
      continue;
    }
    // [metin](url) maskelenmiş bağlantı
    const maskLink = src.slice(i).match(/^\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/);
    if (maskLink) {
      out.push({ kind: 'masklink', text: maskLink[1], href: maskLink[2] });
      i += maskLink[0].length;
      continue;
    }
    // @everyone / @here
    if (src.startsWith('@everyone', i) || src.startsWith('@here', i)) {
      out.push({ kind: 'everyone' });
      i += src.startsWith('@everyone', i) ? '@everyone'.length : '@here'.length;
      continue;
    }
    // Mention @username
    const mention = src.slice(i).match(/^@([a-z0-9_.]{3,32})/i);
    if (mention) {
      out.push({ kind: 'mention', username: mention[1] });
      i += mention[0].length;
      continue;
    }

    // Default text
    let txt = '';
    while (
      i < src.length &&
      src[i] !== '`' &&
      !src.startsWith('||', i) &&
      !src.startsWith('**', i) &&
      !src.startsWith('__', i) &&
      !src.startsWith('~~', i) &&
      src[i] !== '*' &&
      src[i] !== '<' &&
      src[i] !== '[' &&
      !/^https?:\/\//.test(src.slice(i)) &&
      !((i === 0 || /\s/.test(src[i - 1])) && /^www\.[^\s]+\.[^\s]/i.test(src.slice(i))) &&
      !/^:[a-z0-9_]{2,32}:/i.test(src.slice(i)) &&
      !/^@[a-z0-9_.]/i.test(src.slice(i))
    ) {
      txt += src[i];
      i++;
    }
    if (txt.length === 0 && i < src.length) {
      txt = src[i];
      i++;
    }
    if (txt) out.push({ kind: 'text', value: txt });
  }
  return out;
}

function parseBlocks(src: string): Node[] {
  const out: Node[] = [];
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];

    // Code block ```lang
    if (ln.startsWith('```')) {
      const lang = ln.slice(3).trim();
      let code = '';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code += lines[i] + '\n';
        i++;
      }
      i++; // closing ```
      out.push({ kind: 'codeblock', lang, value: code.replace(/\n$/, '') });
      continue;
    }

    // Başlık (#, ##, ###)
    const hMatch = ln.match(/^(#{1,3})\s+(.*)/);
    if (hMatch) {
      out.push({ kind: 'heading', level: hMatch[1].length, children: parseInline(hMatch[2]) });
      i++;
      continue;
    }

    // Alt metin (-# küçük gri yazı)
    const subMatch = ln.match(/^-#\s+(.*)/);
    if (subMatch) {
      out.push({ kind: 'subtext', children: parseInline(subMatch[1]) });
      i++;
      continue;
    }

    // Liste öğesi (-, *, +, 1. veya 1)) — baştaki boşluklara göre iç içe
    const ulMatch = ln.match(/^(\s*)[-*+]\s+(.*)/);
    const olMatch = ln.match(/^(\s*)(\d+)[.)]\s+(.*)/);
    if (ulMatch) {
      const indent = Math.min(4, Math.floor(ulMatch[1].length / 2));
      out.push({
        kind: 'listitem',
        ordered: false,
        num: 0,
        indent,
        children: parseInline(ulMatch[2]),
      });
      i++;
      continue;
    }
    if (olMatch) {
      const indent = Math.min(4, Math.floor(olMatch[1].length / 2));
      out.push({
        kind: 'listitem',
        ordered: true,
        num: parseInt(olMatch[2], 10),
        indent,
        children: parseInline(olMatch[3]),
      });
      i++;
      continue;
    }

    // Çok satırlı blockquote: >>> sonrası tüm satırlar alıntı olur
    if (ln === '>>>' || ln.startsWith('>>> ')) {
      const rest = ln === '>>>' ? '' : ln.slice(4);
      const quoteLines = rest ? [rest] : [];
      i++;
      while (i < lines.length) {
        quoteLines.push(lines[i]);
        i++;
      }
      out.push({ kind: 'blockquote', children: parseBlocks(quoteLines.join('\n')) });
      continue;
    }

    // Blockquote (tek satır >)
    if (ln.startsWith('> ')) {
      let quote = ln.slice(2);
      i++;
      while (i < lines.length && lines[i].startsWith('> ')) {
        quote += '\n' + lines[i].slice(2);
        i++;
      }
      out.push({ kind: 'blockquote', children: parseInline(quote) });
      continue;
    }

    // Boş satır → newline olarak ekle
    // Birden fazla satırı tek paragraf yapmak yerine her satırı düz inline parse edelim
    const inline = parseInline(ln);
    out.push(...inline);
    if (i < lines.length - 1) out.push({ kind: 'text', value: '\n' });
    i++;
  }
  return out;
}

function renderNode(
  n: Node,
  key: number,
  openMention?: (u: string) => void,
  jumbo?: boolean,
): React.ReactNode {
  switch (n.kind) {
    case 'text':
      return <React.Fragment key={key}>{n.value}</React.Fragment>;
    case 'bold':
      return <strong key={key}>{n.children.map((c, i) => renderNode(c, i, openMention))}</strong>;
    case 'italic':
      return <em key={key}>{n.children.map((c, i) => renderNode(c, i, openMention))}</em>;
    case 'underline':
      return <u key={key}>{n.children.map((c, i) => renderNode(c, i, openMention))}</u>;
    case 'strike':
      return <s key={key}>{n.children.map((c, i) => renderNode(c, i, openMention))}</s>;
    case 'code':
      return (
        <code
          key={key}
          className="bg-surface-2 text-brand-400 rounded px-1 py-0.5 text-[13px] font-mono"
        >
          {n.value}
        </code>
      );
    case 'codeblock':
      return <CodeBlock key={key} lang={n.lang} value={n.value} />;
    case 'blockquote':
      return (
        <blockquote key={key} className="border-l-4 border-line pl-3 my-1 text-ink-secondary">
          {n.children.map((c, i) => renderNode(c, i, openMention))}
        </blockquote>
      );
    case 'spoiler':
      return <Spoiler key={key} nodes={n.children} openMention={openMention} />;
    case 'heading': {
      const cls =
        n.level === 1
          ? 'text-xl font-bold'
          : n.level === 2
            ? 'text-lg font-bold'
            : 'text-base font-semibold';
      return (
        <div key={key} className={cls + ' text-ink-primary my-1'}>
          {n.children.map((c, i) => renderNode(c, i, openMention))}
        </div>
      );
    }
    case 'emoji':
      return <CustomEmojiChip key={key} name={n.name} jumbo={jumbo} />;
    case 'listitem':
      return (
        <div key={key} className="flex gap-2" style={{ marginLeft: 8 + n.indent * 18 }}>
          <span className="text-ink-tertiary select-none">
            {n.ordered ? `${n.num}.` : n.indent > 0 ? '◦' : '•'}
          </span>
          <span>{n.children.map((c, i) => renderNode(c, i, openMention))}</span>
        </div>
      );
    case 'link':
      return (
        <a
          key={key}
          href={n.href}
          target="_blank"
          rel="noreferrer"
          className="text-brand-500 hover:text-brand-400 hover:underline"
        >
          {n.href}
        </a>
      );
    case 'mention':
      return (
        <button
          key={key}
          onClick={() => openMention?.(n.username)}
          className="bg-brand-500/15 text-brand-500 font-semibold rounded px-1 py-0.5 hover:bg-brand-500/25"
        >
          @{n.username}
        </button>
      );
    case 'user_mention':
      return <UserMentionChip key={key} userId={n.userId} />;
    case 'channel_mention':
      return <ChannelMentionChip key={key} channelId={n.channelId} />;
    case 'role_mention':
      return <RoleMentionChip key={key} roleId={n.roleId} />;
    case 'timestamp':
      return <TimestampChip key={key} unix={n.unix} style={n.style} />;
    case 'masklink':
      return (
        <a
          key={key}
          href={n.href}
          target="_blank"
          rel="noreferrer"
          title={n.href}
          className="text-brand-500 hover:text-brand-400 hover:underline"
        >
          {n.text}
        </a>
      );
    case 'subtext':
      return (
        <div key={key} className="text-xs text-ink-tertiary my-0.5">
          {n.children.map((c, i) => renderNode(c, i, openMention))}
        </div>
      );
    case 'everyone':
      return (
        <span
          key={key}
          className="bg-accent-500/15 text-accent-500 font-semibold rounded px-1 py-0.5"
        >
          @everyone
        </span>
      );
  }
}

function UserMentionChip({ userId }: { userId: string }) {
  const user = useUserCache(userId);
  return (
    <button
      type="button"
      className="bg-brand-500/15 text-brand-500 font-semibold rounded px-1 py-0.5 hover:bg-brand-500/25"
      title={user ? `@${user.username}` : userId}
    >
      @{user?.display_name ?? '…'}
    </button>
  );
}

function ChannelMentionChip({ channelId }: { channelId: string }) {
  const ch = useChannelCache(channelId);
  return (
    <button
      type="button"
      className="bg-brand-500/15 text-brand-500 font-semibold rounded px-1 py-0.5 hover:bg-brand-500/25"
    >
      #{ch?.name ?? '…'}
    </button>
  );
}

function RoleMentionChip({ roleId }: { roleId: string }) {
  const store = (window as any).__concord_store;
  const state = store?.getState?.();
  let role: any = null;
  for (const gid in state?.guildRoles?.byGuild ?? {}) {
    const found = state.guildRoles.byGuild[gid].find((r: any) => r.id === roleId);
    if (found) {
      role = found;
      break;
    }
  }
  // renk: int veya #hex olabilir
  let color = '';
  const c = role?.color;
  if (typeof c === 'number' && c > 0) color = '#' + c.toString(16).padStart(6, '0');
  else if (typeof c === 'string' && c.startsWith('#')) color = c;
  const style = color ? { color, backgroundColor: color + '26' } : undefined;
  return (
    <span
      className={
        'font-semibold rounded px-1 py-0.5 ' + (color ? '' : 'bg-brand-500/15 text-brand-500')
      }
      style={style}
    >
      @{role?.name ?? 'rol'}
    </span>
  );
}

function TimestampChip({ unix, style }: { unix: number; style: string }) {
  const d = new Date(unix * 1000);
  const now = Date.now();
  let label = '';
  if (style === 'R') {
    // göreli
    const diff = Math.round((unix * 1000 - now) / 1000);
    const abs = Math.abs(diff);
    const fmt = (v: number, unit: string) =>
      diff < 0 ? `${v} ${unit} önce` : `${v} ${unit} sonra`;
    if (abs < 60) label = fmt(abs, 'saniye');
    else if (abs < 3600) label = fmt(Math.round(abs / 60), 'dakika');
    else if (abs < 86400) label = fmt(Math.round(abs / 3600), 'saat');
    else if (abs < 2592000) label = fmt(Math.round(abs / 86400), 'gün');
    else if (abs < 31536000) label = fmt(Math.round(abs / 2592000), 'ay');
    else label = fmt(Math.round(abs / 31536000), 'yıl');
  } else if (style === 't')
    label = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  else if (style === 'T') label = d.toLocaleTimeString('tr-TR');
  else if (style === 'd') label = d.toLocaleDateString('tr-TR');
  else if (style === 'D')
    label = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  else if (style === 'F')
    label =
      d.toLocaleDateString('tr-TR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }) +
      ' ' +
      d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  else
    label =
      d.toLocaleDateString('tr-TR') +
      ' ' +
      d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return (
    <span
      className="bg-surface-2 rounded px-1 text-ink-secondary"
      title={d.toLocaleString('tr-TR')}
    >
      {label}
    </span>
  );
}

function useUserCache(userId: string) {
  // Lazy: store'dan oku, yoksa fetch et
  const store = (window as any).__concord_store;
  const cached = store?.getState?.()?.users?.byId?.[userId];
  return cached ?? null;
}

function useChannelCache(channelId: string) {
  const store = (window as any).__concord_store;
  const state = store?.getState?.();
  if (!state) return null;
  for (const guildId in state.channels?.byGuild ?? {}) {
    const found = state.channels.byGuild[guildId].find((c: any) => c.id === channelId);
    if (found) return found;
  }
  return null;
}

function CustomEmojiChip({ name, jumbo }: { name: string; jumbo?: boolean }) {
  const store = (window as any).__concord_store;
  const gid = store?.getState?.()?.guilds?.selectedId;
  const emojis = (window as any).__concord_emojis?.[gid] as
    | { name: string; url: string }[]
    | undefined;
  const found = emojis?.find((e) => e.name === name);
  if (found) {
    return (
      <img
        src={found.url}
        alt={`:${name}:`}
        title={`:${name}:`}
        className={
          (jumbo ? 'w-12 h-12 ' : 'w-5 h-5 ') + 'inline-block object-contain align-text-bottom'
        }
      />
    );
  }
  return <>:{name}:</>;
}

function CodeBlock({ lang, value }: { lang: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <pre className="group/code relative bg-surface-2 border border-line rounded-lg p-3 my-1 overflow-x-auto">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover/code:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded bg-surface-3 hover:bg-surface-1 text-ink-secondary"
      >
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </button>
      {lang && <div className="text-[10px] text-ink-tertiary uppercase mb-1">{lang}</div>}
      <code className="text-[13px] font-mono text-ink-primary whitespace-pre">{value}</code>
    </pre>
  );
}

function Spoiler({ nodes, openMention }: { nodes: Node[]; openMention?: (u: string) => void }) {
  const [shown, setShown] = React.useState(false);
  return (
    <span
      onClick={() => setShown(true)}
      className={
        'rounded px-1 cursor-pointer ' +
        (shown ? 'bg-surface-2' : 'bg-black text-black select-none')
      }
    >
      {nodes.map((n, i) => renderNode(n, i, openMention))}
    </span>
  );
}

// Mesaj yalnızca emoji (custom :name: veya unicode) içeriyorsa ve sayısı azsa
// jumbo (büyük) render edilir — Discord davranışı.
function isJumboEmoji(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 60) return false;
  // custom emoji token'larını çıkar
  let stripped = trimmed.replace(/:([a-z0-9_]{2,32}):/gi, '');
  let emojiCount = (trimmed.match(/:([a-z0-9_]{2,32}):/gi) ?? []).length;
  try {
    // GRAPHEME bazlı sayım: kullanıcının "tek emoji" gördüğü şey birden çok kod
    // noktasından oluşabilir. Kod noktası saymak (eski hali) yanlış sonuç veriyordu:
    //   👨‍👩‍👧 (ZWJ ailesi) → 5, 🇹🇷 (2 bölgesel gösterge) → 2, ❤️ (+VS16) → 2
    // yani 6 aile emojisi 30 sayılıp jumbo eşiğini (27) aşıyor ve büyük render EDİLMİYORDU.
    // ESLint no-misleading-character-class tam da bunu işaret ediyordu.
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const isEmoji = /\p{Extended_Pictographic}|\p{RI}/u;
    let kalan = '';
    for (const { segment } of seg.segment(stripped)) {
      if (isEmoji.test(segment)) emojiCount++;
      else kalan += segment;
    }
    stripped = kalan;
  } catch {
    return false; // ortam Intl.Segmenter / unicode property escape desteklemiyorsa atla
  }
  return emojiCount > 0 && emojiCount <= 27 && stripped.trim() === '';
}

export function Markdown({
  content,
  onMention,
}: {
  content: string;
  onMention?: (u: string) => void;
}) {
  const nodes = parseBlocks(content);
  const jumbo = isJumboEmoji(content);
  if (jumbo) {
    return (
      <span className="text-4xl leading-tight inline-flex flex-wrap items-center gap-0.5">
        {nodes.map((n, i) => renderNode(n, i, onMention, true))}
      </span>
    );
  }
  return <>{nodes.map((n, i) => renderNode(n, i, onMention))}</>;
}
