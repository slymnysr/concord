// Hızlı geçiş — tüm kanallarda ve DM'lerde anında arama, dokun→zıpla (Ctrl+K tarzı).
import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { api } from '../api';
import type { Nav } from '../nav';
import { ScreenHeader, Empty, ui } from '../ui';

type Item =
  | { kind: 'channel'; id: string; name: string; guildId: string; guildName: string; type: string }
  | { kind: 'dm'; id: string; name: string };

export function QuickSwitcherScreen({ nav, onBack }: { nav: Nav; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [guilds, dms] = await Promise.all([api.guilds.list(), api.dms.list()]);
        const chanLists = await Promise.all(
          guilds.map((g) => api.guilds.channels(g.id).then((cs) => ({ g, cs })).catch(() => ({ g, cs: [] }))),
        );
        const channels: Item[] = [];
        for (const { g, cs } of chanLists) {
          for (const c of cs) {
            if (['text', 'announcement', 'forum', 'media', 'voice'].includes(c.type)) {
              channels.push({ kind: 'channel', id: c.id, name: c.name, guildId: g.id, guildName: g.name, type: c.type });
            }
          }
        }
        const dmItems: Item[] = dms.map((d) => ({ kind: 'dm', id: d.id, name: d.name || 'DM' }));
        setItems([...dmItems, ...channels]);
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items.slice(0, 40);
    return items.filter((i) => i.name.toLowerCase().includes(s) || (i.kind === 'channel' && i.guildName.toLowerCase().includes(s))).slice(0, 40);
  }, [q, items]);

  function open(i: Item) {
    if (i.kind === 'dm') nav.push({ kind: 'chat', channel: { id: i.id, name: i.name } });
    else if (i.type === 'voice') nav.push({ kind: 'chat', channel: { id: i.id, name: i.name, guildId: i.guildId, type: i.type } });
    else nav.push({ kind: 'chat', channel: { id: i.id, name: i.name, guildId: i.guildId, type: i.type } });
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Hızlı Geçiş" onBack={onBack} />
      <TextInput
        style={[ui.input, { margin: 12 }]}
        value={q}
        onChangeText={setQ}
        placeholder="Kanal veya kişi ara…"
        placeholderTextColor={colors.inkTertiary}
        autoFocus
      />
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.kind + i.id}
        ListEmptyComponent={<Empty text="Sonuç yok." />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => open(item)}>
            <Text style={s.icon}>{item.kind === 'dm' ? '@' : item.type === 'voice' ? '🔊' : '#'}</Text>
            <Text style={s.name} numberOfLines={1}>{item.name}</Text>
            {item.kind === 'channel' && <Text style={s.guild} numberOfLines={1}>{item.guildName}</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  icon: { color: colors.inkTertiary, width: 20, fontSize: 15, fontWeight: '700' },
  name: { color: colors.ink, fontSize: 15, flex: 1 },
  guild: { color: colors.inkTertiary, fontSize: 12, maxWidth: '40%' },
});
