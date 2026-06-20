// Ana ekran — Discord mobil düzeni: solda sunucu rayı, sağda kanal/DM listesi.
// Okunmamış göstergeleri, hızlı erişim (arkadaşlar/keşfet/bildirim/üyeler/ara/ayarlar).
import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Image, RefreshControl,
  Modal, TextInput, Pressable, Alert, ScrollView,
} from 'react-native';
import { colors } from '../theme';
import { api, type Channel, type DMChannel, type Guild, type ReadState, type User } from '../api';
import type { Nav } from '../nav';
import { InputModal } from '../ui';
import { voice } from '../voice';
import { joinGuild } from '../gateway';

export function HomeScreen({ me, nav, onLogout }: { me: User; nav: Nav; onLogout: () => void }) {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selected, setSelected] = useState<string | 'dm' | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dms, setDms] = useState<DMChannel[]>([]);
  const [reads, setReads] = useState<Record<string, ReadState>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [newGuildName, setNewGuildName] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [createChan, setCreateChan] = useState(false);
  const [renameChan, setRenameChan] = useState<Channel | null>(null);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; color: number; guild_ids: string[] }>>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [newFolderFor, setNewFolderFor] = useState<Guild | null>(null);

  const reloadChannels = useCallback(() => {
    if (selected && selected !== 'dm') api.guilds.channels(selected).then(setChannels).catch(() => {});
  }, [selected]);

  async function doCreateChannel(name: string) {
    setCreateChan(false);
    if (!name.trim() || !selected || selected === 'dm') return;
    try { await api.channels.create(selected, name.trim()); reloadChannels(); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Kanal oluşturulamadı'); }
  }
  async function doRenameChannel(name: string) {
    const ch = renameChan; setRenameChan(null);
    if (!ch || !name.trim()) return;
    try { await api.channels.update(ch.id, { name: name.trim() }); reloadChannels(); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Olmadı'); }
  }
  function channelMenu(ch: Channel) {
    Alert.alert(`#${ch.name}`, undefined, [
      { text: 'Ayarlar', onPress: () => nav.push({ kind: 'channelSettings', channelId: ch.id, channelName: ch.name, guildId: ch.guild_id }) },
      { text: 'Yeniden adlandır', onPress: () => setRenameChan(ch) },
      { text: 'Sustur', onPress: () => api.channels.muteSettings(ch.id, { notif_level: 'nothing' }).then(() => Alert.alert('Sidcord', 'Susturuldu')).catch(() => {}) },
      { text: 'Sil', style: 'destructive', onPress: () => api.channels.delete(ch.id).then(reloadChannels).catch((e) => Alert.alert('Sidcord', e?.message ?? 'Silinemedi')) },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  const loadReads = useCallback(async () => {
    try {
      const list = await api.readStates.list();
      const map: Record<string, ReadState> = {};
      for (const r of list) map[r.channel_id] = r;
      setReads(map);
    } catch {}
  }, []);

  const load = useCallback(async () => {
    try {
      const g = await api.guilds.list();
      setGuilds(g);
      setSelected((cur) => cur ?? (g[0]?.id ?? 'dm'));
    } catch {}
    loadReads();
    api.folders.list().then(setFolders).catch(() => {});
  }, [loadReads]);

  const reloadFolders = () => api.folders.list().then(setFolders).catch(() => {});
  async function moveToFolder(guildId: string, folderId: string) {
    try {
      for (const f of folders) if (f.id !== folderId && f.guild_ids.includes(guildId)) await api.folders.update(f.id, { guild_ids: f.guild_ids.filter((x) => x !== guildId) });
      const t = folders.find((f) => f.id === folderId);
      if (t && !t.guild_ids.includes(guildId)) await api.folders.update(folderId, { guild_ids: [...t.guild_ids, guildId] });
      reloadFolders();
    } catch {}
  }
  async function removeFromFolder(guildId: string) {
    const f = folders.find((x) => x.guild_ids.includes(guildId));
    if (!f) return;
    try { await api.folders.update(f.id, { guild_ids: f.guild_ids.filter((x) => x !== guildId) }); reloadFolders(); } catch {}
  }
  function guildLongPress(g: Guild) {
    const inFolder = folders.some((f) => f.guild_ids.includes(g.id));
    const opts: any[] = folders.map((f) => ({ text: `📁 ${f.name}`, onPress: () => moveToFolder(g.id, f.id) }));
    opts.push({ text: '➕ Yeni klasör', onPress: () => setNewFolderFor(g) });
    if (inFolder) opts.push({ text: 'Klasörden çıkar', onPress: () => removeFromFolder(g.id) });
    opts.push({ text: 'Vazgeç', style: 'cancel' });
    Alert.alert(g.name, 'Klasöre taşı', opts);
  }
  const renderGuild = (item: Guild) => (
    <TouchableOpacity
      key={item.id}
      style={[s.railItem, selected === item.id && s.railItemActive]}
      onPress={() => setSelected(item.id)}
      onLongPress={() => guildLongPress(item)}
    >
      {item.icon_url_v2 ? (
        <Image source={{ uri: item.icon_url_v2 }} style={s.railImg} />
      ) : (
        <Text style={[s.railText, { color: item.icon_color || colors.brand }]}>{(item.icon_text || item.name).slice(0, 2).toUpperCase()}</Text>
      )}
    </TouchableOpacity>
  );

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    if (selected === 'dm') api.dms.list().then(setDms).catch(() => {});
    else api.guilds.channels(selected).then(setChannels).catch(() => {});
  }, [selected]);

  // Canlı: seçili sunucuda kanal eklen/silinince listeyi tazele
  useEffect(() => {
    if (!selected || selected === 'dm') return;
    const off = joinGuild(selected, (ev) => {
      if (ev === 'CHANNEL_CREATE' || ev === 'CHANNEL_UPDATE' || ev === 'CHANNEL_DELETE') reloadChannels();
    });
    return off;
  }, [selected, reloadChannels]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    if (selected === 'dm') await api.dms.list().then(setDms).catch(() => {});
    else if (selected) await api.guilds.channels(selected).then(setChannels).catch(() => {});
    setRefreshing(false);
  };

  const isUnread = (channelId: string, lastMessageId?: string) => {
    if (!lastMessageId) return false;
    const r = reads[channelId];
    if (!r?.last_message_id) return true;
    try { return BigInt(lastMessageId) > BigInt(r.last_message_id); } catch { return false; }
  };

  async function joinByInvite() {
    if (!inviteCode.trim() || addBusy) return;
    setAddBusy(true); setAddErr(null);
    try {
      const g = await api.invites.accept(inviteCode);
      setInviteCode(''); setAddOpen(false);
      await load(); setSelected(g.id);
    } catch (e: any) { setAddErr(e?.message ?? 'Katılınamadı'); } finally { setAddBusy(false); }
  }
  async function createGuild() {
    if (newGuildName.trim().length < 2 || addBusy) return;
    setAddBusy(true); setAddErr(null);
    try {
      const g = await api.guilds.create(newGuildName.trim());
      setNewGuildName(''); setAddOpen(false);
      await load(); setSelected(g.id);
    } catch (e: any) { setAddErr(e?.message ?? 'Oluşturulamadı'); } finally { setAddBusy(false); }
  }

  const inAnyFolder = new Set(folders.flatMap((f) => f.guild_ids));
  const ungrouped = guilds.filter((g) => !inAnyFolder.has(g.id));
  const selectedGuild = guilds.find((g) => g.id === selected);
  const guildName = selected === 'dm' ? 'Doğrudan Mesajlar' : selectedGuild?.name ?? '';
  const textChannels = channels
    .filter((c) => ['text', 'announcement', 'forum', 'media', 'voice', 'stage'].includes(c.type))
    .sort((a, b) => a.position - b.position);

  async function joinVoice(ch: Channel) {
    try { await voice.connect(ch.id, ch.name, { meId: me.id, stage: ch.type === 'stage' }); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'Sesli sohbet için native build (EAS dev client) gerekiyor.'); }
  }

  const openChannel = (ch: { id: string; name: string; guildId?: string; type?: string; participants?: string[] }) =>
    nav.push(ch.type === 'forum' ? { kind: 'forum', channel: ch } : { kind: 'chat', channel: ch });

  return (
    <View style={s.root}>
      {/* Sunucu rayı */}
      <View style={s.rail}>
        <TouchableOpacity style={[s.railItem, selected === 'dm' && s.railItemActive]} onPress={() => setSelected('dm')}>
          <Text style={s.railEmoji}>💬</Text>
        </TouchableOpacity>
        <View style={s.railSep} />
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ alignItems: 'center' }}>
          {folders.map((f) => (
            <View key={f.id} style={s.folderWrap}>
              <TouchableOpacity style={[s.railItem, s.folderItem]} onPress={() => setCollapsed((c) => ({ ...c, [f.id]: !c[f.id] }))}>
                <Text style={{ fontSize: 17 }}>📁</Text>
              </TouchableOpacity>
              {!collapsed[f.id] && f.guild_ids.map((gid) => { const g = guilds.find((x) => x.id === gid); return g ? renderGuild(g) : null; })}
            </View>
          ))}
          {ungrouped.map((g) => renderGuild(g))}
        </ScrollView>
        <TouchableOpacity style={s.railItem} onPress={() => { setAddErr(null); setAddOpen(true); }}>
          <Text style={[s.railText, { color: colors.brand, fontSize: 22 }]}>＋</Text>
        </TouchableOpacity>
      </View>

      {/* Kanal / DM listesi */}
      <View style={s.list}>
        <View style={s.listHead}>
          <Text style={s.guildName} numberOfLines={1}>{guildName}</Text>
          <TouchableOpacity onPress={() => nav.push({ kind: 'quickSwitch' })}>
            <Text style={s.headGear}>🔎</Text>
          </TouchableOpacity>
          {selected !== 'dm' && !!selectedGuild && (
            <TouchableOpacity onPress={() => nav.push({ kind: 'serverSettings', guildId: selectedGuild.id, guildName: selectedGuild.name })}>
              <Text style={s.headGear}>⚙️</Text>
            </TouchableOpacity>
          )}
        </View>

        {selected === 'dm' ? (
          <FlatList
            data={dms}
            keyExtractor={(d) => d.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
            ListHeaderComponent={
              <View style={s.quick}>
                <QuickRow icon="👥" label="Arkadaşlar" onPress={() => nav.push({ kind: 'friends' })} />
                <QuickRow icon="🧭" label="Keşfet" onPress={() => nav.push({ kind: 'discover' })} />
                <QuickRow icon="🔔" label="Bildirimler" onPress={() => nav.push({ kind: 'notifications' })} />
                <QuickRow icon="🔖" label="Kaydedilenler" onPress={() => nav.push({ kind: 'savedMessages' })} />
              </View>
            }
            renderItem={({ item }) => {
              const unread = isUnread(item.id, item.last_message_id);
              return (
                <TouchableOpacity style={s.channelRow} onPress={() => openChannel({ id: item.id, name: item.name || 'DM', type: item.type, participants: item.participants })}>
                  <Text style={s.channelIcon}>{item.type === 'group_dm' ? '👥' : '@'}</Text>
                  <Text style={[s.channelName, unread && s.channelUnread]} numberOfLines={1}>{item.name || 'Doğrudan mesaj'}</Text>
                  {unread && <View style={s.dot} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={s.empty}>Henüz DM yok — Arkadaşlar'dan başlat.</Text>}
          />
        ) : (
          <FlatList
            data={textChannels}
            keyExtractor={(c) => c.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
            ListHeaderComponent={
              selectedGuild ? (
                <View style={s.quick}>
                  <QuickRow icon="👥" label="Üyeler" onPress={() => nav.push({ kind: 'members', guildId: selectedGuild.id, guildName: selectedGuild.name })} />
                  <QuickRow icon="🔍" label="Ara" onPress={() => nav.push({ kind: 'search', guildId: selectedGuild.id })} />
                  <QuickRow icon="➕" label="Kanal oluştur" onPress={() => setCreateChan(true)} />
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const unread = isUnread(item.id, item.last_message_id);
              const mentions = reads[item.id]?.mention_count ?? 0;
              return (
                <TouchableOpacity
                  style={s.channelRow}
                  onPress={() => (item.type === 'voice' || item.type === 'stage' ? joinVoice(item) : openChannel({ id: item.id, name: item.name, guildId: item.guild_id, type: item.type }))}
                  onLongPress={() => channelMenu(item)}
                >
                  <Text style={s.channelIcon}>{item.type === 'voice' || item.type === 'stage' ? '🔊' : item.type === 'announcement' ? '📣' : '#'}</Text>
                  <Text style={[s.channelName, unread && s.channelUnread]} numberOfLines={1}>{item.name}</Text>
                  {mentions > 0 ? (
                    <View style={s.mentionBadge}><Text style={s.mentionText}>{mentions > 99 ? '99+' : mentions}</Text></View>
                  ) : (unread && <View style={s.dot} />)}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<View style={{ padding: 16 }}><Text style={s.empty}>Kanal yok.</Text></View>}
          />
        )}

        <TouchableOpacity style={s.me} onPress={() => nav.push({ kind: 'userSettings' })}>
          <View style={[s.avatar, { backgroundColor: me.avatar_color || colors.brand }]}>
            <Text style={s.avatarText}>{me.display_name.slice(0, 1).toUpperCase()}</Text>
          </View>
          <Text style={s.meName} numberOfLines={1}>{me.display_name}</Text>
          <Text style={s.meGear}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Sunucuya katıl / oluştur */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={s.modalCard} onPress={() => {}}>
            <Text style={s.modalTitle}>Sunucuya Katıl</Text>
            <TextInput style={s.modalInput} value={inviteCode} onChangeText={setInviteCode} autoCapitalize="none" placeholder="Davet kodu (örn. yazilim-tr)" placeholderTextColor={colors.inkTertiary} />
            <TouchableOpacity style={[s.modalBtn, (!inviteCode.trim() || addBusy) && { opacity: 0.4 }]} onPress={joinByInvite} disabled={!inviteCode.trim() || addBusy}>
              <Text style={s.modalBtnText}>Katıl</Text>
            </TouchableOpacity>
            <View style={s.modalSep} />
            <Text style={s.modalTitle}>Yeni Sunucu</Text>
            <TextInput style={s.modalInput} value={newGuildName} onChangeText={setNewGuildName} placeholder="Sunucu adı" placeholderTextColor={colors.inkTertiary} />
            <TouchableOpacity style={[s.modalBtn, (newGuildName.trim().length < 2 || addBusy) && { opacity: 0.4 }]} onPress={createGuild} disabled={newGuildName.trim().length < 2 || addBusy}>
              <Text style={s.modalBtnText}>Oluştur</Text>
            </TouchableOpacity>
            {addErr && <Text style={s.modalErr}>{addErr}</Text>}
          </Pressable>
        </Pressable>
      </Modal>

      <InputModal visible={createChan} title="Yeni kanal" placeholder="kanal-adı" submitLabel="Oluştur" onCancel={() => setCreateChan(false)} onSubmit={doCreateChannel} />
      <InputModal visible={!!renameChan} title="Kanalı yeniden adlandır" initial={renameChan?.name} onCancel={() => setRenameChan(null)} onSubmit={doRenameChannel} />
      <InputModal visible={!!newFolderFor} title="Yeni klasör" placeholder="Klasör adı" submitLabel="Oluştur" onCancel={() => setNewFolderFor(null)} onSubmit={(v) => { const g = newFolderFor; setNewFolderFor(null); if (g && v.trim()) api.folders.create({ name: v.trim(), guild_ids: [g.id] }).then(reloadFolders).catch(() => {}); }} />
    </View>
  );
}

function QuickRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.quickRow} onPress={onPress}>
      <Text style={s.quickIcon}>{icon}</Text>
      <Text style={s.quickLabel}>{label}</Text>
      <Text style={s.quickChevron}>›</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.bg },
  rail: { width: 64, backgroundColor: colors.bg, alignItems: 'center', paddingVertical: 8 },
  railItem: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface1, alignItems: 'center', justifyContent: 'center', marginVertical: 4, overflow: 'hidden' },
  railItemActive: { borderRadius: 14, borderWidth: 2, borderColor: colors.brand },
  folderWrap: { backgroundColor: colors.surface2, borderRadius: 18, marginVertical: 2, paddingVertical: 2, alignItems: 'center' },
  folderItem: { backgroundColor: colors.surface3 },
  railEmoji: { fontSize: 18 },
  railText: { fontWeight: '800', fontSize: 13 },
  railImg: { width: '100%', height: '100%' },
  railSep: { height: 1, width: 28, backgroundColor: colors.line, marginVertical: 6 },
  list: { flex: 1, backgroundColor: colors.surface1, borderTopLeftRadius: 18 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderColor: colors.line },
  guildName: { color: colors.ink, fontWeight: '800', fontSize: 17, flex: 1 },
  headGear: { fontSize: 18, paddingLeft: 8 },
  quick: { paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.line, marginBottom: 4 },
  quickRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, gap: 12 },
  quickIcon: { fontSize: 17, width: 22 },
  quickLabel: { color: colors.ink, fontSize: 15, fontWeight: '600', flex: 1 },
  quickChevron: { color: colors.inkTertiary, fontSize: 20 },
  channelRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  channelIcon: { color: colors.inkTertiary, width: 24, fontSize: 15, fontWeight: '700' },
  channelName: { color: colors.inkSecondary, fontSize: 15, flex: 1 },
  channelUnread: { color: colors.ink, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  mentionBadge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  mentionText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { color: colors.inkTertiary, padding: 16 },
  me: { flexDirection: 'row', alignItems: 'center', padding: 10, borderTopWidth: 1, borderColor: colors.line, gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },
  meName: { color: colors.ink, fontWeight: '600', flex: 1 },
  meGear: { fontSize: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', backgroundColor: colors.surface1, borderRadius: 18, padding: 18 },
  modalTitle: { color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 8 },
  modalInput: { backgroundColor: colors.surface2, borderColor: colors.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: colors.ink, marginBottom: 10 },
  modalBtn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 11 },
  modalBtnText: { color: '#06281F', fontWeight: '800', textAlign: 'center' },
  modalSep: { height: 1, backgroundColor: colors.line, marginVertical: 16 },
  modalErr: { color: colors.accent, marginTop: 10, textAlign: 'center' },
});
