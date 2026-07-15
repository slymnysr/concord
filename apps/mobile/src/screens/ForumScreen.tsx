// Forum / thread listesi — gönderiler (thread'ler), etiket filtresi, yeni gönderi.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { colors } from '../theme';
import { api, type Thread, type ForumTag } from '../api';
import type { Nav, OpenChannel } from '../nav';
import { ScreenHeader, InputModal, Empty, ui } from '../ui';

export function ForumScreen({ channel, nav, onBack }: { channel: OpenChannel; nav: Nav; onBack: () => void }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [tags, setTags] = useState<ForumTag[]>([]);
  const [archived, setArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.threads.list(channel.id, archived).then(setThreads).catch(() => {});
    api.forumTags.list(channel.id).then(setTags).catch(() => {});
  }, [channel.id, archived]);
  useEffect(() => { load(); }, [load]);

  const openThread = (t: Thread) =>
    nav.push({ kind: 'chat', channel: { id: t.id, name: t.name, guildId: channel.guildId } });

  async function create(name: string) {
    setCreating(false);
    if (!name.trim()) return;
    try {
      const t = await api.threads.create(channel.id, { name: name.trim() });
      openThread(t as Thread);
    } catch (e: any) { Alert.alert('Concord', e?.message ?? 'Oluşturulamadı'); }
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title={`📋 ${channel.name}`}
        onBack={onBack}
        right={<TouchableOpacity onPress={() => setCreating(true)}><Text style={ui.headerBtn}>+ Gönderi</Text></TouchableOpacity>}
      />
      <View style={s.filterRow}>
        <TouchableOpacity style={[s.filter, !archived && s.filterActive]} onPress={() => setArchived(false)}>
          <Text style={[s.filterText, !archived && { color: colors.ink }]}>Aktif</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.filter, archived && s.filterActive]} onPress={() => setArchived(true)}>
          <Text style={[s.filterText, archived && { color: colors.ink }]}>Arşiv</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={<Empty text="Henüz gönderi yok. İlkini sen oluştur." />}
        renderItem={({ item }) => {
          const itemTags = (item.tag_ids ?? []).map((id) => tags.find((t) => t.id === id)).filter(Boolean) as ForumTag[];
          return (
            <TouchableOpacity style={s.card} onPress={() => openThread(item)}>
              <Text style={s.title}>{item.name}</Text>
              <View style={s.meta}>
                <Text style={s.metaText}>💬 {item.message_count ?? 0}</Text>
                {itemTags.map((t) => (
                  <View key={t.id} style={s.tag}><Text style={s.tagText}>{t.emoji ? t.emoji + ' ' : ''}{t.name}</Text></View>
                ))}
              </View>
            </TouchableOpacity>
          );
        }}
      />
      <InputModal visible={creating} title="Yeni gönderi" placeholder="Başlık" submitLabel="Oluştur" onCancel={() => setCreating(false)} onSubmit={create} />
    </View>
  );
}

const s = StyleSheet.create({
  filterRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: 1, borderColor: colors.line },
  filter: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, backgroundColor: colors.surface2 },
  filterActive: { backgroundColor: colors.brand + '22', borderWidth: 1, borderColor: colors.brand },
  filterText: { color: colors.inkSecondary, fontWeight: '700', fontSize: 13 },
  card: { backgroundColor: colors.surface1, borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  metaText: { color: colors.inkTertiary, fontSize: 12 },
  tag: { backgroundColor: colors.surface3, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: colors.inkSecondary, fontSize: 11, fontWeight: '600' },
});
