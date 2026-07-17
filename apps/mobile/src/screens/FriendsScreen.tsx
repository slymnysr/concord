// Arkadaşlar — kabul edilenler / bekleyenler / engellenenler, ekle, DM aç.
import { t } from '../i18n';
import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
} from 'react-native';
import { colors } from '../theme';
import { api, type Friend, type User } from '../api';
import type { Nav } from '../nav';
import { ScreenHeader, Avatar, InputModal, Empty, ui, statusColor } from '../ui';

type Tab = 'accepted' | 'pending' | 'blocked';

export function FriendsScreen({ me, nav, onBack }: { me: User; nav: Nav; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('accepted');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [adding, setAdding] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const toggleSel = (id: string) =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function createGroup() {
    if (selected.length < 1) return;
    try {
      const r = await api.dms.createGroup(selected);
      setGroupMode(false);
      setSelected([]);
      nav.push({ kind: 'chat', channel: { id: r.channel_id, name: r.name || 'Grup' } });
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? t('dm.groupFailed'));
    }
  }

  const load = useCallback(() => {
    api.friends
      .list()
      .then(setFriends)
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setFriends(await api.friends.list());
    } catch {}
    setRefreshing(false);
  };

  const filtered = friends.filter((f) =>
    tab === 'accepted'
      ? f.friendship === 'accepted'
      : tab === 'pending'
        ? f.friendship === 'pending_received' || f.friendship === 'pending_sent'
        : f.friendship === 'blocked',
  );

  async function openDM(f: Friend) {
    try {
      const r = await api.dms.open(f.user_id);
      nav.push({ kind: 'chat', channel: { id: r.channel_id, name: f.display_name } });
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? t('dm.openFailed'));
    }
  }

  async function act(fn: () => Promise<any>) {
    try {
      await fn();
      load();
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? t('common.failed'));
    }
  }

  return (
    <View style={ui.screen}>
      <ScreenHeader
        title={groupMode ? t('dm.selectForGroup') : t('friends.title')}
        onBack={
          groupMode
            ? () => {
                setGroupMode(false);
                setSelected([]);
              }
            : onBack
        }
        right={
          groupMode ? (
            <TouchableOpacity onPress={createGroup}>
              <Text style={ui.headerBtn}>Oluştur ({selected.length})</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={() => {
                  setGroupMode(true);
                  setTab('accepted');
                }}
              >
                <Text style={ui.headerBtn}>Grup</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAdding(true)}>
                <Text style={ui.headerBtn}>+ Ekle</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
      <View style={s.tabs}>
        {(
          [
            ['accepted', t('friends.title')],
            ['pending', 'Bekleyen'],
            ['blocked', 'Engellenen'],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <TouchableOpacity
            key={t}
            style={[s.tab, tab === t && s.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabText, tab === t && { color: colors.ink }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(f) => f.user_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
        ListEmptyComponent={
          <Empty
            text={
              tab === 'accepted'
                ? t('friends.none')
                : tab === 'pending'
                  ? 'Bekleyen istek yok.'
                  : 'Engellenen yok.'
            }
          />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={s.row}
            disabled={item.friendship !== 'accepted'}
            onPress={() => (groupMode ? toggleSel(item.user_id) : openDM(item))}
          >
            <View>
              <Avatar
                name={item.display_name}
                color={item.avatar_color}
                url={item.avatar_url}
                size={42}
              />
              {item.friendship === 'accepted' && (
                <View style={[s.dot, { backgroundColor: statusColor(item.status) }]} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.display_name}</Text>
              <Text style={s.handle}>
                @{item.username}
                {item.friendship === 'pending_received'
                  ? ' · seni ekledi'
                  : item.friendship === 'pending_sent'
                    ? ' ' + t('friends.pending')
                    : ''}
              </Text>
            </View>
            {item.friendship === 'pending_received' && (
              <>
                <TouchableOpacity
                  style={s.actBtn}
                  onPress={() => act(() => api.friends.accept(item.user_id))}
                >
                  <Text style={{ color: colors.online, fontWeight: '700' }}>Kabul</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.actBtn}
                  onPress={() => act(() => api.friends.remove(item.user_id))}
                >
                  <Text style={{ color: colors.accent, fontWeight: '700' }}>Reddet</Text>
                </TouchableOpacity>
              </>
            )}
            {item.friendship === 'pending_sent' && (
              <TouchableOpacity
                style={s.actBtn}
                onPress={() => act(() => api.friends.remove(item.user_id))}
              >
                <Text style={{ color: colors.inkSecondary, fontWeight: '700' }}>
                  {t('common.cancel2')}
                </Text>
              </TouchableOpacity>
            )}
            {item.friendship === 'accepted' &&
              (groupMode ? (
                <Text
                  style={{
                    color: selected.includes(item.user_id) ? colors.brand : colors.inkTertiary,
                    fontSize: 22,
                    paddingHorizontal: 8,
                  }}
                >
                  {selected.includes(item.user_id) ? '☑' : '☐'}
                </Text>
              ) : (
                <TouchableOpacity
                  style={s.actBtn}
                  onPress={() =>
                    Alert.alert(item.display_name, undefined, [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('friends.remove'),
                        style: 'destructive',
                        onPress: () => act(() => api.friends.remove(item.user_id)),
                      },
                      {
                        text: 'Engelle',
                        style: 'destructive',
                        onPress: () => act(() => api.block(item.user_id)),
                      },
                    ])
                  }
                >
                  <Text style={{ color: colors.inkTertiary, fontSize: 20 }}>⋯</Text>
                </TouchableOpacity>
              ))}
            {item.friendship === 'blocked' && (
              <TouchableOpacity
                style={s.actBtn}
                onPress={() => act(() => api.unblock(item.user_id))}
              >
                <Text style={{ color: colors.brand, fontWeight: '700' }}>{t('common.remove')}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />

      <InputModal
        visible={adding}
        title={t('friends.add')}
        placeholder={t('user.username')}
        submitLabel={t('common.send')}
        onCancel={() => setAdding(false)}
        onSubmit={(v) => {
          setAdding(false);
          if (v.trim()) act(() => api.friends.send({ username: v.trim() }));
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.surface2,
  },
  tabActive: { backgroundColor: colors.brand + '22', borderWidth: 1, borderColor: colors.brand },
  tabText: { color: colors.inkSecondary, fontWeight: '700', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    borderColor: colors.bg,
  },
  name: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  handle: { color: colors.inkTertiary, fontSize: 13, marginTop: 1 },
  actBtn: { paddingHorizontal: 8, paddingVertical: 6 },
});
