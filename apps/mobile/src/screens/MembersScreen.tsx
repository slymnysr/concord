// Üye listesi + moderasyon: DM, rol yönetimi, takma ad, zaman aşımı, at, yasakla.
import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, Pressable, ScrollView } from 'react-native';
import { colors } from '../theme';
import { api, type Member, type Role, type User } from '../api';
import type { Nav } from '../nav';
import { ScreenHeader, Avatar, InputModal, Empty, ui, statusColor } from '../ui';

export function MembersScreen({ guildId, guildName, me, nav, onBack }: {
  guildId: string; guildName: string; me: User; nav: Nav; onBack: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesFor, setRolesFor] = useState<Member | null>(null);
  const [nickFor, setNickFor] = useState<Member | null>(null);
  const [banFor, setBanFor] = useState<Member | null>(null);

  const load = useCallback(() => {
    api.guilds.members(guildId).then(setMembers).catch(() => {});
    api.guilds.roles(guildId).then(setRoles).catch(() => {});
  }, [guildId]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<any>, ok?: string) {
    try { await fn(); if (ok) Alert.alert('Sidcord', ok); load(); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'İşlem başarısız'); }
  }

  async function openDM(mb: Member) {
    try { const r = await api.dms.open(mb.user_id); nav.push({ kind: 'chat', channel: { id: r.channel_id, name: mb.display_name } }); }
    catch (e: any) { Alert.alert('Sidcord', e?.message ?? 'DM açılamadı'); }
  }

  function timeoutMenu(mb: Member) {
    Alert.alert('Zaman aşımı', mb.display_name, [
      { text: '5 dakika', onPress: () => run(() => api.guilds.timeout(guildId, mb.user_id, 300), 'Uygulandı') },
      { text: '1 saat', onPress: () => run(() => api.guilds.timeout(guildId, mb.user_id, 3600), 'Uygulandı') },
      { text: '1 gün', onPress: () => run(() => api.guilds.timeout(guildId, mb.user_id, 86400), 'Uygulandı') },
      { text: 'Kaldır', onPress: () => run(() => api.guilds.timeout(guildId, mb.user_id, 0), 'Kaldırıldı') },
      { text: 'Vazgeç', style: 'cancel' },
    ]);
  }

  function memberMenu(mb: Member) {
    const opts: any[] = [
      { text: 'Mesaj gönder', onPress: () => openDM(mb) },
      { text: 'Rolleri yönet', onPress: () => setRolesFor(mb) },
      { text: 'Takma ad', onPress: () => setNickFor(mb) },
    ];
    if (mb.user_id !== me.id) {
      opts.push(
        { text: 'Zaman aşımı', onPress: () => timeoutMenu(mb) },
        { text: 'Sunucudan at', style: 'destructive', onPress: () => run(() => api.guilds.kick(guildId, mb.user_id), 'Atıldı') },
        { text: 'Yasakla', style: 'destructive', onPress: () => setBanFor(mb) },
      );
    }
    opts.push({ text: 'Vazgeç', style: 'cancel' });
    Alert.alert(mb.display_name, `@${mb.username}`, opts);
  }

  const sorted = [...members].sort((a, b) => {
    const on = (s: string) => (s === 'offline' ? 1 : 0);
    return on(a.status) - on(b.status) || (a.nickname || a.display_name).localeCompare(b.nickname || b.display_name);
  });

  return (
    <View style={ui.screen}>
      <ScreenHeader title={`Üyeler — ${guildName}`} onBack={onBack} />
      <FlatList
        data={sorted}
        keyExtractor={(mb) => mb.user_id}
        ListEmptyComponent={<Empty text="Üye yok." />}
        renderItem={({ item }) => {
          const roleNames = item.role_ids.map((id) => roles.find((r) => r.id === id)?.name).filter(Boolean).slice(0, 2);
          return (
            <TouchableOpacity style={s.row} onPress={() => memberMenu(item)}>
              <View>
                <Avatar name={item.display_name} color={item.avatar_color} url={item.avatar_url} size={42} />
                <View style={[s.dot, { backgroundColor: statusColor(item.status) }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>
                  {item.nickname || item.display_name}
                  {item.bot ? <Text style={s.bot}>  BOT</Text> : null}
                </Text>
                <Text style={s.handle} numberOfLines={1}>
                  @{item.username}{roleNames.length ? ` · ${roleNames.join(', ')}` : ''}
                </Text>
              </View>
              <Text style={{ color: colors.inkTertiary, fontSize: 20 }}>⋯</Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* Rol yönetimi */}
      <Modal visible={!!rolesFor} transparent animationType="slide" onRequestClose={() => setRolesFor(null)}>
        <Pressable style={s.sheetBackdrop} onPress={() => setRolesFor(null)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>Roller — {rolesFor?.display_name}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {roles.filter((r) => !r.is_everyone).map((r) => {
                const has = !!rolesFor?.role_ids.includes(r.id);
                return (
                  <TouchableOpacity
                    key={r.id}
                    style={s.roleRow}
                    onPress={() => {
                      if (!rolesFor) return;
                      const mb = rolesFor;
                      run(() => has ? api.guilds.unassignRole(guildId, mb.user_id, r.id) : api.guilds.assignRole(guildId, mb.user_id, r.id));
                      setRolesFor({ ...mb, role_ids: has ? mb.role_ids.filter((x) => x !== r.id) : [...mb.role_ids, r.id] });
                    }}
                  >
                    <View style={[s.roleDot, { backgroundColor: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : colors.inkTertiary }]} />
                    <Text style={s.roleName}>{r.name}</Text>
                    <Text style={{ color: has ? colors.brand : colors.inkTertiary, fontSize: 18 }}>{has ? '✓' : '+'}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <InputModal
        visible={!!nickFor}
        title={`Takma ad — ${nickFor?.display_name ?? ''}`}
        initial={nickFor?.nickname}
        placeholder="Boş bırak = sıfırla"
        onCancel={() => setNickFor(null)}
        onSubmit={(v) => { const mb = nickFor; setNickFor(null); if (mb) run(() => api.guilds.setNickname(guildId, mb.user_id, v.trim()), 'Güncellendi'); }}
      />
      <InputModal
        visible={!!banFor}
        title={`Yasakla — ${banFor?.display_name ?? ''}`}
        placeholder="Sebep (opsiyonel)"
        submitLabel="Yasakla"
        onCancel={() => setBanFor(null)}
        onSubmit={(v) => { const mb = banFor; setBanFor(null); if (mb) run(() => api.guilds.ban(guildId, mb.user_id, v.trim()), 'Yasaklandı'); }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 3, borderColor: colors.bg },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  bot: { color: colors.brand, fontSize: 10, fontWeight: '800' },
  handle: { color: colors.inkTertiary, fontSize: 13, marginTop: 1 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface1, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28 },
  sheetTitle: { color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 12 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  roleDot: { width: 14, height: 14, borderRadius: 7 },
  roleName: { color: colors.ink, fontSize: 15, flex: 1 },
});
