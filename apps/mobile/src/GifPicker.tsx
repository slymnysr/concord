// GIF seçici — Giphy public API. Kendi anahtarın için localStorage yerine config'e eklenebilir.
import { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { colors } from './theme';

const GIPHY_KEY = 'dc6zaTOxFJmzC';

export function GifPicker({
  visible,
  onPick,
  onClose,
}: {
  visible: boolean;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [gifs, setGifs] = useState<{ id: string; url: string; preview: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const base = q.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q.trim())}&limit=24&rating=pg-13`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
        const res = await fetch(base);
        const d = await res.json();
        setGifs(
          (d.data || [])
            .map((g: any) => ({
              id: g.id,
              url: g.images?.original?.url,
              preview: g.images?.fixed_width_small?.url || g.images?.original?.url,
            }))
            .filter((g: any) => g.url),
        );
      } catch {
        setGifs([]);
      }
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <TextInput
            style={s.search}
            value={q}
            onChangeText={setQ}
            placeholder="GIF ara…"
            placeholderTextColor={colors.inkTertiary}
            autoFocus
          />
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginVertical: 30 }} />
          ) : (
            <FlatList
              data={gifs}
              keyExtractor={(g) => g.id}
              numColumns={2}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.cell} onPress={() => onPick(item.url)}>
                  <Image source={{ uri: item.preview }} style={s.gif} resizeMode="cover" />
                </TouchableOpacity>
              )}
            />
          )}
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
  search: {
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    marginBottom: 10,
  },
  cell: { flex: 1, padding: 4, maxWidth: '50%' },
  gif: { width: '100%', height: 110, borderRadius: 8, backgroundColor: colors.surface2 },
});
