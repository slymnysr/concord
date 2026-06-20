// Zengin markdown — bloklar (```kod```, > alıntı, # başlık, - madde) + satır-içi
// (**kalın**, *italik*, ~~üstü çizili~~, `kod`, ||spoiler||, <t:unix>, linkler).
import { useState, type ReactNode } from 'react';
import { View, Text, Linking, StyleSheet } from 'react-native';
import { colors } from './theme';

const INLINE_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|\|\|[^|]+\|\||<t:\d+(?::[tTdDfFR])?>|https?:\/\/[^\s<>"']+)/g;

function formatTs(tok: string): string {
  const m = /<t:(\d+)/.exec(tok);
  if (!m) return tok;
  const d = new Date(parseInt(m[1], 10) * 1000);
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Spoiler({ text }: { text: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Text style={shown ? s.spoilerOpen : s.spoiler} onPress={() => setShown(true)}>
      {shown ? text : '█'.repeat(Math.min(text.length, 12))}
    </Text>
  );
}

function renderInline(text: string, style: any, kb: string): ReactNode[] {
  return text.split(INLINE_RE).map((p, i) => {
    if (!p) return null;
    const key = kb + i;
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <Text key={key} style={s.bold}>{p.slice(2, -2)}</Text>;
    if (p.startsWith('~~') && p.endsWith('~~') && p.length > 4) return <Text key={key} style={s.strike}>{p.slice(2, -2)}</Text>;
    if (p.startsWith('||') && p.endsWith('||') && p.length > 4) return <Spoiler key={key} text={p.slice(2, -2)} />;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <Text key={key} style={s.italic}>{p.slice(1, -1)}</Text>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <Text key={key} style={s.code}>{p.slice(1, -1)}</Text>;
    if (p.startsWith('<t:')) return <Text key={key} style={s.ts}>🕐 {formatTs(p)}</Text>;
    if (/^https?:\/\//i.test(p)) return <Text key={key} style={s.link} onPress={() => Linking.openURL(p).catch(() => {})}>{p}</Text>;
    return <Text key={key} style={style}>{p}</Text>;
  });
}

export function MarkdownText({ children, style }: { children: string; style?: any }) {
  const segments = children.split(/```/);
  const out: ReactNode[] = [];
  segments.forEach((seg, si) => {
    if (si % 2 === 1) {
      const body = seg.replace(/^[a-zA-Z0-9]*\n/, '').replace(/\n$/, '');
      out.push(<View key={'cb' + si} style={s.codeBlock}><Text style={s.codeBlockText}>{body}</Text></View>);
      return;
    }
    const lines = seg.split('\n');
    lines.forEach((line, li) => {
      if (li === lines.length - 1 && line === '' && si < segments.length - 1) return;
      const key = `l${si}_${li}`;
      if (/^#{1,3}\s/.test(line)) {
        const level = (line.match(/^#+/) || ['#'])[0].length;
        out.push(<Text key={key} style={[s.header, level === 1 && s.h1, level === 2 && s.h2]}>{renderInline(line.replace(/^#{1,3}\s/, ''), s.header, key)}</Text>);
      } else if (line.startsWith('> ')) {
        out.push(<View key={key} style={s.quote}><Text style={style}>{renderInline(line.slice(2), style, key)}</Text></View>);
      } else if (/^[-*]\s/.test(line)) {
        out.push(<Text key={key} style={style}>{'•  '}{renderInline(line.slice(2), style, key)}</Text>);
      } else {
        out.push(<Text key={key} style={style}>{renderInline(line, style, key)}</Text>);
      }
    });
  });
  return <View>{out}</View>;
}

const s = StyleSheet.create({
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: { fontFamily: 'monospace', backgroundColor: colors.surface3, color: colors.ink, fontSize: 13 },
  link: { color: colors.brand, textDecorationLine: 'underline' },
  ts: { color: colors.inkSecondary, backgroundColor: colors.surface3, fontSize: 13 },
  spoiler: { backgroundColor: colors.surface3, color: colors.surface3, borderRadius: 4 },
  spoilerOpen: { backgroundColor: colors.surface3, color: colors.ink, borderRadius: 4 },
  codeBlock: { backgroundColor: colors.surface3, borderRadius: 8, padding: 10, marginVertical: 4 },
  codeBlockText: { fontFamily: 'monospace', color: colors.ink, fontSize: 13 },
  header: { color: colors.ink, fontWeight: '800', marginTop: 2 },
  h1: { fontSize: 20 },
  h2: { fontSize: 17 },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.line, paddingLeft: 8, marginVertical: 1 },
});
