// Geliştirici paneli — bot uygulamaları: oluştur, token sıfırla, herkese açık, sil.
import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { colors } from '../theme';
import { api } from '../api';
import { ScreenHeader, InputModal, Empty, ui } from '../ui';

type App = { id: string; name: string; bot_user_id: string; bot_username: string; public: boolean; created_at: string };

export function DeveloperScreen({ onBack }: { onBack: () => void }) {
  const [apps, setApps] = useState<App[]>([]);
  const [creating, setCreating] = useState(false);

  const load = () => api.applications.list().then(setApps).catch(() => {});
  useEffect(() => { load(); }, []);

  async function run(fn: () => Promise<any>, ok?: string) {
    try { await fn(); if (ok) Alert.alert('Sidcord', ok); load(); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'İşlem başarısız'); }
  }

  function appMenu(a: App) {
    Alert.alert(a.name, `@${a.bot_username}`, [
      { text: 'Token sıfırla', onPress: () => api.applications.resetToken(a.id).then((r) => Alert.alert('Bot Token', `${r.token}\n\nGüvenli bir yere kaydet — tekrar gösterilmez.`)).catch((e) => Alert.alert('Sidcord', e?.message ?? 'Olmadı')) },
      { text: a.public ? 'Gizli yap' : 'Herkese açık yap', onPress: () => run(() => api.applications.update(a.id, { public: !a.public })) },
      { text: 'Sil', style: 'destructive', onPress: () => run(() => api.applications.remove(a.id)) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Geliştirici" onBack={onBack} right={<TouchableOpacity onPress={() => setCreating(true)}><Text style={ui.headerBtn}>+ Uygulama</Text></TouchableOpacity>} />
      <FlatList
        data={apps}
        keyExtractor={(a) => a.id}
        ListEmptyComponent={<Empty text="Henüz uygulaman yok. Bir bot uygulaması oluştur." />}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} onPress={() => appMenu(item)}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              <Text style={s.sub}>@{item.bot_username} · {item.public ? 'herkese açık' : 'gizli'}</Text>
            </View>
            <Text style={{ color: colors.inkTertiary, fontSize: 20 }}>⋯</Text>
          </TouchableOpacity>
        )}
      />
      <InputModal visible={creating} title="Yeni uygulama" placeholder="Uygulama adı" submitLabel="Oluştur" onCancel={() => setCreating(false)} onSubmit={(v) => { setCreating(false); if (v.trim()) run(() => api.applications.create(v.trim()), 'Oluşturuldu'); }} />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  sub: { color: colors.inkTertiary, fontSize: 12, marginTop: 2 },
});
