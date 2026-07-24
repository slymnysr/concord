// Emoji seçici — son kullanılanlar + kategori sekmeleri + arama.
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './theme';
import { EMOJI_GROUPS, ALL_EMOJIS } from './emojiData';

const RECENT_KEY = 'concord_recent_emojis';

export function EmojiPicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState(0);
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((v) => {
        if (v)
          try {
            setRecents(JSON.parse(v));
          } catch {}
      })
      .catch(() => {});
  }, []);

  const tabs = [
    ...(recents.length ? [{ name: 'recent', icon: '🕘', emojis: recents }] : []),
    ...EMOJI_GROUPS,
  ];
  const data = q.trim() ? ALL_EMOJIS : (tabs[group]?.emojis ?? []);

  function pick(e: string) {
    const next = [e, ...recents.filter((x) => x !== e)].slice(0, 24);
    setRecents(next);
    AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    onPick(e);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.tabs}>
            {tabs.map((g, i) => (
              <TouchableOpacity
                key={g.name}
                style={[s.tab, !q && group === i && s.tabActive]}
                onPress={() => {
                  setGroup(i);
                  setQ('');
                }}
              >
                <Text style={s.tabIcon}>{g.icon}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={s.search}
            value={q}
            onChangeText={setQ}
            placeholder="Ara…"
            placeholderTextColor={colors.inkTertiary}
          />
          <FlatList
            data={data}
            keyExtractor={(e, i) => e + i}
            numColumns={8}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 320 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={s.cell} onPress={() => pick(item)}>
                <Text style={s.emoji}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 12,
    paddingBottom: 24,
  },
  tabs: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  tab: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: colors.surface3 },
  tabIcon: { fontSize: 19 },
  search: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.ink,
    marginBottom: 8,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '12.5%',
  },
  emoji: { fontSize: 26 },
});
