// Bildirimler — liste + tümünü okundu işaretle.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { api, type Notification } from '../api';
import { ScreenHeader, Empty, ui } from '../ui';

export function NotificationsScreen({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<Notification[]>([]);

  const load = () => api.notifications.list().then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title="Bildirimler"
        onBack={onBack}
        right={<TouchableOpacity onPress={async () => { try { await api.notifications.markAllRead(); load(); } catch {} }}><Text style={ui.headerBtn}>Tümü okundu</Text></TouchableOpacity>}
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        ListEmptyComponent={<Empty text="Bildirim yok." />}
        renderItem={({ item }) => (
          <View style={[s.row, !item.read && s.unread]}>
            <Text style={s.title}>{item.title || item.type}</Text>
            {!!item.body && <Text style={s.body}>{item.body}</Text>}
            <Text style={s.time}>{new Date(item.created_at).toLocaleString('tr-TR')}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  unread: { backgroundColor: colors.surface1 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  body: { color: colors.inkSecondary, fontSize: 14, marginTop: 2 },
  time: { color: colors.inkTertiary, fontSize: 12, marginTop: 4 },
});
