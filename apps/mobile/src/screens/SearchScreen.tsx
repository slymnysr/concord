// Arama — mesaj arama, sonuca dokununca kanala git.
import { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { api, type Message, type Channel } from '../api';
import type { Nav } from '../nav';
import { ScreenHeader, Empty, ui } from '../ui';

export function SearchScreen({ guildId, channelId, nav, onBack }: { guildId?: string; channelId?: string; nav: Nav; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<{ message: Message; channel: Channel }>>([]);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!q.trim()) return;
    try { setResults(await api.search.messages(q.trim(), { guildId, channelId, limit: 50 })); setSearched(true); }
    catch { setResults([]); setSearched(true); }
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader title={channelId ? 'Kanalda Ara' : 'Ara'} onBack={onBack} />
      <View style={s.searchRow}>
        <TextInput
          style={[ui.input, { flex: 1 }]}
          value={q}
          onChangeText={setQ}
          placeholder="Mesajlarda ara…"
          placeholderTextColor={colors.inkTertiary}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={search}
        />
        <TouchableOpacity style={s.btn} onPress={search}><Text style={ui.btnText}>Ara</Text></TouchableOpacity>
      </View>
      <FlatList
        data={results}
        keyExtractor={(r) => r.message.id}
        ListEmptyComponent={searched ? <Empty text="Sonuç yok." /> : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            onPress={() => nav.push({ kind: 'chat', channel: { id: item.channel.id, name: item.channel.name, guildId: item.channel.guild_id } })}
          >
            <Text style={s.ch}>#{item.channel.name}</Text>
            <Text style={s.content} numberOfLines={2}>{item.message.content}</Text>
            <Text style={s.time}>{new Date(item.message.created_at).toLocaleString('tr-TR')}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
  btn: { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  row: { paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  ch: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  content: { color: colors.ink, fontSize: 15, marginTop: 3 },
  time: { color: colors.inkTertiary, fontSize: 12, marginTop: 3 },
});
