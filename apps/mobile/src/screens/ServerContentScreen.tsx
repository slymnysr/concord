// Sunucu içeriği — özel emoji, çıkartma, soundboard, slash komutları, etkinlikler, karşılama, istatistik.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../theme';
import { api, uploadFile, type Emoji, type Sticker, type Sound } from '../api';
import { voice } from '../voice';
import { ScreenHeader, InputModal, Empty, Row, ui } from '../ui';

type Tab = 'emojis' | 'stickers' | 'sounds' | 'commands' | 'events' | 'welcome' | 'insights';
const TABS: [Tab, string][] = [
  ['emojis', 'Emoji'], ['stickers', 'Çıkartma'], ['sounds', 'Ses'], ['commands', 'Komut'],
  ['events', 'Etkinlik'], ['welcome', 'Karşılama'], ['insights', 'İstatistik'],
];

type Edit =
  | { k: 'emojiName'; url: string } | { k: 'stickerName'; url: string } | { k: 'soundName'; url: string }
  | { k: 'slashName' } | { k: 'slashDesc'; name: string } | { k: 'slashResp'; name: string; desc: string }
  | { k: 'eventName' } | { k: 'welcomeDesc' } | { k: 'welcomeRules' };

export function ServerContentScreen({ guildId, guildName, onBack }: { guildId: string; guildName: string; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('emojis');
  const [emojis, setEmojis] = useState<Emoji[]>([]);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [sounds, setSounds] = useState<Sound[]>([]);
  const [commands, setCommands] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [events, setEvents] = useState<Array<any>>([]);
  const [welcome, setWelcome] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [edit, setEdit] = useState<Edit | null>(null);

  const reload = useCallback(() => {
    if (tab === 'emojis') api.emojis.list(guildId).then(setEmojis).catch(() => {});
    if (tab === 'stickers') api.stickers.list(guildId).then(setStickers).catch(() => {});
    if (tab === 'sounds') api.sounds.list(guildId).then(setSounds).catch(() => {});
    if (tab === 'commands') api.commands.list(guildId).then(setCommands).catch(() => {});
    if (tab === 'events') api.events.list(guildId).then(setEvents).catch(() => {});
    if (tab === 'welcome') api.welcome.get(guildId).then(setWelcome).catch(() => {});
    if (tab === 'insights') api.guilds.insights(guildId).then(setInsights).catch(() => {});
  }, [tab, guildId]);
  useEffect(() => { reload(); }, [reload]);

  async function run(fn: () => Promise<any>, ok?: string) {
    try { await fn(); if (ok) Alert.alert('Sidcord', ok); reload(); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'İşlem başarısız'); }
  }

  async function pickImageThen(setKey: 'emojiName' | 'stickerName') {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    try {
      const up = await uploadFile(a.uri, a.fileName || `img_${Date.now()}.png`, a.mimeType || 'image/png', a.fileSize || 0);
      setEdit({ k: setKey, url: up.url });
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Yüklenemedi'); }
  }
  async function pickSound() {
    const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    try {
      const up = await uploadFile(a.uri, a.name, a.mimeType || 'audio/mpeg', a.size || 0);
      setEdit({ k: 'soundName', url: up.url });
    } catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Yüklenemedi'); }
  }

  function playSound(id: string) {
    if (!voice.isConnected() || !voice.channelId) { Alert.alert('Sidcord', 'Önce bir sesli kanala katıl, sonra çal.'); return; }
    api.sounds.play(id, voice.channelId).catch((e: any) => Alert.alert('Sidcord', e?.message ?? 'Çalınamadı'));
  }

  function createEvent(name: string) {
    const at = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();
    Alert.alert('Ne zaman?', name, [
      { text: '1 saat sonra', onPress: () => run(() => api.events.create(guildId, { name, scheduled_start_at: at(3600), entity_type: 'external', entity_location: 'Sidcord' }), 'Etkinlik oluşturuldu') },
      { text: 'Yarın', onPress: () => run(() => api.events.create(guildId, { name, scheduled_start_at: at(86400), entity_type: 'external', entity_location: 'Sidcord' }), 'Etkinlik oluşturuldu') },
      { text: 'Gelecek hafta', onPress: () => run(() => api.events.create(guildId, { name, scheduled_start_at: at(604800), entity_type: 'external', entity_location: 'Sidcord' }), 'Etkinlik oluşturuldu') },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  async function submitEdit(value: string) {
    const e = edit; setEdit(null);
    if (!e) return;
    if (e.k === 'emojiName' && value.trim()) return run(() => api.emojis.create(guildId, { name: value.trim(), url: e.url }), 'Emoji eklendi');
    if (e.k === 'stickerName' && value.trim()) return run(() => api.stickers.create(guildId, { name: value.trim(), url: e.url }), 'Çıkartma eklendi');
    if (e.k === 'soundName' && value.trim()) return run(() => api.sounds.create(guildId, { name: value.trim(), file_url: e.url }), 'Ses eklendi');
    if (e.k === 'slashName' && value.trim()) return setEdit({ k: 'slashDesc', name: value.trim() });
    if (e.k === 'slashDesc') return setEdit({ k: 'slashResp', name: e.name, desc: value.trim() });
    if (e.k === 'slashResp' && value.trim()) return run(() => api.commands.create(guildId, { name: e.name, description: e.desc, response: value.trim() }), 'Komut eklendi');
    if (e.k === 'eventName' && value.trim()) return createEvent(value.trim());
    if (e.k === 'welcomeDesc') return run(() => api.welcome.update(guildId, { description: value.trim() }));
    if (e.k === 'welcomeRules') return run(() => api.welcome.update(guildId, { rules_text: value.trim() }));
  }

  const editMeta: Record<Edit['k'], { title: string; initial?: string; multiline?: boolean }> = {
    emojiName: { title: 'Emoji adı' }, stickerName: { title: 'Çıkartma adı' }, soundName: { title: 'Ses adı' },
    slashName: { title: 'Komut adı (/...)' }, slashDesc: { title: 'Açıklama' }, slashResp: { title: 'Yanıt metni', multiline: true },
    eventName: { title: 'Etkinlik adı' }, welcomeDesc: { title: 'Karşılama açıklaması', initial: welcome?.description, multiline: true },
    welcomeRules: { title: 'Kurallar', initial: welcome?.rules_text, multiline: true },
  };
  const m = edit ? editMeta[edit.k] : null;

  const addAction = (
    tab === 'emojis' ? () => pickImageThen('emojiName')
    : tab === 'stickers' ? () => pickImageThen('stickerName')
    : tab === 'sounds' ? pickSound
    : tab === 'commands' ? () => setEdit({ k: 'slashName' })
    : tab === 'events' ? () => setEdit({ k: 'eventName' })
    : null
  );

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title={`İçerik — ${guildName}`}
        onBack={onBack}
        right={addAction ? <TouchableOpacity onPress={addAction}><Text style={ui.headerBtn}>+ Ekle</Text></TouchableOpacity> : undefined}
      />
      <View style={s.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {TABS.map(([t, label]) => (
            <TouchableOpacity key={t} style={[s.tab, tab === t && s.tabActive]} onPress={() => setTab(t)}>
              <Text style={[s.tabText, tab === t && { color: colors.ink }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {tab === 'emojis' && (
        <FlatList data={emojis} keyExtractor={(e) => e.id} numColumns={4} ListEmptyComponent={<Empty text="Emoji yok." />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.gridCell} onLongPress={() => run(() => api.emojis.delete(guildId, item.id))}>
              <Image source={{ uri: item.url }} style={s.gridImg} />
              <Text style={s.gridName} numberOfLines={1}>:{item.name}:</Text>
            </TouchableOpacity>
          )} />
      )}
      {tab === 'stickers' && (
        <FlatList data={stickers} keyExtractor={(e) => e.id} numColumns={3} ListEmptyComponent={<Empty text="Çıkartma yok." />}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.gridCell} onLongPress={() => run(() => api.stickers.delete(item.id))}>
              <Image source={{ uri: item.url }} style={s.stickerImg} />
              <Text style={s.gridName} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          )} />
      )}
      {tab === 'sounds' && (
        <FlatList data={sounds} keyExtractor={(e) => e.id} ListEmptyComponent={<Empty text="Ses yok." />}
          renderItem={({ item }) => (
            <View style={s.listRow}>
              <Text style={s.rowText}>{item.emoji ? item.emoji + ' ' : '🔊 '}{item.name}</Text>
              <TouchableOpacity onPress={() => playSound(item.id)}><Text style={{ color: colors.brand, marginRight: 16 }}>Çal</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => run(() => api.sounds.delete(item.id))}><Text style={{ color: colors.accent }}>Sil</Text></TouchableOpacity>
            </View>
          )} />
      )}
      {tab === 'commands' && (
        <FlatList data={commands} keyExtractor={(e) => e.id} ListEmptyComponent={<Empty text="Komut yok." />}
          renderItem={({ item }) => (
            <View style={s.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowText}>/{item.name}</Text>
                <Text style={s.sub}>{item.description}</Text>
              </View>
              <TouchableOpacity onPress={() => run(() => api.commands.delete(item.id))}><Text style={{ color: colors.accent }}>Sil</Text></TouchableOpacity>
            </View>
          )} />
      )}
      {tab === 'events' && (
        <FlatList data={events} keyExtractor={(e) => e.id} ListEmptyComponent={<Empty text="Etkinlik yok." />}
          renderItem={({ item }) => (
            <View style={s.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowText}>{item.name}</Text>
                <Text style={s.sub}>{new Date(item.scheduled_start_at).toLocaleString('tr-TR')} · {item.subscriber_count ?? 0} ilgili</Text>
              </View>
              <TouchableOpacity onPress={() => run(() => item.subscribed ? api.events.unsubscribe(item.id) : api.events.subscribe(item.id))}>
                <Text style={{ color: item.subscribed ? colors.inkSecondary : colors.brand }}>{item.subscribed ? 'Bırak' : 'İlgilen'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ marginLeft: 12 }} onPress={() => run(() => api.events.delete(item.id))}><Text style={{ color: colors.accent }}>Sil</Text></TouchableOpacity>
            </View>
          )} />
      )}
      {tab === 'welcome' && welcome && (
        <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
          <Row label="Karşılama ekranı" right={
            <TouchableOpacity onPress={() => run(() => api.welcome.update(guildId, { enabled: !welcome.enabled }))}>
              <Text style={{ color: welcome.enabled ? colors.online : colors.inkTertiary, fontWeight: '700' }}>{welcome.enabled ? 'Açık' : 'Kapalı'}</Text>
            </TouchableOpacity>
          } />
          <Row label="Açıklama" value={welcome.description || '—'} onPress={() => setEdit({ k: 'welcomeDesc' })} />
          <Row label="Kurallar" value={welcome.rules_text ? 'düzenle' : '—'} onPress={() => setEdit({ k: 'welcomeRules' })} />
        </ScrollView>
      )}
      {tab === 'insights' && insights && (
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <Stat label="Üye sayısı" value={insights.member_count} />
          <Stat label="Yeni üye (7g)" value={insights.new_members_7d} />
          <Stat label="Yeni üye (30g)" value={insights.new_members_30d} />
          <Stat label="Mesaj (7g)" value={insights.messages_7d} />
          <Stat label="Mesaj (30g)" value={insights.messages_30d} />
        </ScrollView>
      )}

      <InputModal visible={!!edit} title={m?.title ?? ''} initial={m?.initial} multiline={m?.multiline} onCancel={() => setEdit(null)} onSubmit={submitEdit} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value ?? 0}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line },
  tab: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.surface2 },
  tabActive: { backgroundColor: colors.brand + '22', borderWidth: 1, borderColor: colors.brand },
  tabText: { color: colors.inkSecondary, fontWeight: '700', fontSize: 13 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  rowText: { color: colors.ink, fontSize: 15, flex: 1 },
  sub: { color: colors.inkTertiary, fontSize: 12, marginTop: 2 },
  gridCell: { flex: 1, alignItems: 'center', padding: 10, maxWidth: '25%' },
  gridImg: { width: 48, height: 48, borderRadius: 8 },
  stickerImg: { width: 80, height: 80, borderRadius: 10 },
  gridName: { color: colors.inkSecondary, fontSize: 11, marginTop: 4 },
  stat: { backgroundColor: colors.surface1, borderRadius: 12, padding: 16, marginBottom: 10 },
  statValue: { color: colors.brand, fontSize: 26, fontWeight: '800' },
  statLabel: { color: colors.inkSecondary, fontSize: 13, marginTop: 2 },
});
