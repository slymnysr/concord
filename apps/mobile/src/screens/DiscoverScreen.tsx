// Keşfet — herkese açık sunucular, katıl.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { colors } from '../theme';
import { api } from '../api';
import type { Nav } from '../nav';
import { ScreenHeader, Avatar, Empty, ui } from '../ui';

export function DiscoverScreen({ nav, onBack }: { nav: Nav; onBack: () => void }) {
  const [items, setItems] = useState<Array<{ id: string; name: string; icon_text: string; icon_color: string; description: string; member_count: number; joined: boolean }>>([]);

  const load = () => api.discover.list().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  async function join(id: string) {
    try { await api.discover.join(id); Alert.alert('Concord', 'Katıldın!'); nav.reset({ kind: 'home' }); }
    catch (e: any) { Alert.alert('Concord', e?.message ?? 'Katılınamadı'); }
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Keşfet" onBack={onBack} />
      <FlatList
        data={items}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Empty text="Herkese açık sunucu yok." />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <Avatar name={item.icon_text || item.name} color={item.icon_color} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              {!!item.description && <Text style={s.desc} numberOfLines={2}>{item.description}</Text>}
              <Text style={s.count}>{item.member_count} üye</Text>
            </View>
            <TouchableOpacity style={[s.joinBtn, item.joined && { backgroundColor: colors.surface2 }]} disabled={item.joined} onPress={() => join(item.id)}>
              <Text style={[s.joinText, item.joined && { color: colors.inkTertiary }]}>{item.joined ? 'Üye' : 'Katıl'}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface1, borderRadius: 14, padding: 12, marginBottom: 10 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  desc: { color: colors.inkSecondary, fontSize: 13, marginTop: 2 },
  count: { color: colors.inkTertiary, fontSize: 12, marginTop: 4 },
  joinBtn: { backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  joinText: { color: '#06281F', fontWeight: '800' },
});
