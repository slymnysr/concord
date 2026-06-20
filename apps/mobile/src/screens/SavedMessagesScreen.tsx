// Kaydedilen mesajlar — liste + kaydı kaldır.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { api, type SavedMessage } from '../api';
import { ScreenHeader, Empty, ui } from '../ui';

export function SavedMessagesScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<SavedMessage[]>([]);
  const load = () => api.savedMessages.list().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <View style={ui.screen}>
      <ScreenHeader title="🔖 Kaydedilenler" onBack={onBack} />
      <FlatList
        data={items}
        keyExtractor={(m) => m.message_id}
        ListEmptyComponent={<Empty text="Kaydedilen mesaj yok." />}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.author}>{item.author_name}</Text>
              <Text style={s.content}>{item.content}</Text>
              <Text style={s.time}>{new Date(item.saved_at).toLocaleString('tr-TR')}</Text>
            </View>
            <TouchableOpacity onPress={() => api.savedMessages.unsave(item.message_id).then(load).catch(() => {})}>
              <Text style={s.remove}>Kaldır</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  author: { color: colors.brand, fontSize: 13, fontWeight: '700' },
  content: { color: colors.ink, fontSize: 15, marginTop: 2 },
  time: { color: colors.inkTertiary, fontSize: 12, marginTop: 4 },
  remove: { color: colors.accent, fontSize: 13, fontWeight: '700', paddingTop: 2 },
});
