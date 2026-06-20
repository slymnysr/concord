// Hafif satır-içi markdown: **kalın**, *italik*, ~~üstü çizili~~, `kod` + tıklanabilir linkler.
// Tam parser değil — mobil v1 için Discord hissinin %90'ı; bloklar (kod bloğu/alıntı) sonraki tur.
import { Text, Linking, StyleSheet } from 'react-native';
import { colors } from './theme';

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|`[^`]+`|https?:\/\/[^\s<>"']+)/g;

export function MarkdownText({ children, style }: { children: string; style?: any }) {
  const parts = children.split(TOKEN_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
          return (
            <Text key={i} style={s.bold}>{part.slice(2, -2)}</Text>
          );
        }
        if (part.startsWith('~~') && part.endsWith('~~') && part.length > 4) {
          return (
            <Text key={i} style={s.strike}>{part.slice(2, -2)}</Text>
          );
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return (
            <Text key={i} style={s.italic}>{part.slice(1, -1)}</Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
          return (
            <Text key={i} style={s.code}>{part.slice(1, -1)}</Text>
          );
        }
        if (/^https?:\/\//i.test(part)) {
          return (
            <Text key={i} style={s.link} onPress={() => Linking.openURL(part).catch(() => {})}>
              {part}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
}

const s = StyleSheet.create({
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  code: {
    fontFamily: 'monospace',
    backgroundColor: colors.surface2,
    color: colors.brand,
  },
  link: { color: '#4FA8FF', textDecorationLine: 'underline' },
});
