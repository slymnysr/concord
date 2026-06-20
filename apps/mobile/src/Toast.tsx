// Hafif uygulama-içi toast — modül emitter + ekranın üstünde geçici banner.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from './theme';

type ToastItem = { id: number; text: string; sub?: string; onPress?: () => void };
let listeners: ((t: ToastItem) => void)[] = [];
let seq = 0;

export function showToast(text: string, opts?: { sub?: string; onPress?: () => void }) {
  const item: ToastItem = { id: ++seq, text, sub: opts?.sub, onPress: opts?.onPress };
  listeners.forEach((l) => l(item));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const l = (t: ToastItem) => {
      setItems((p) => [...p.slice(-2), t]);
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== t.id)), 3800);
    };
    listeners.push(l);
    return () => { listeners = listeners.filter((x) => x !== l); };
  }, []);

  if (!items.length) return null;
  return (
    <View style={s.host} pointerEvents="box-none">
      {items.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={s.toast}
          activeOpacity={0.9}
          onPress={() => { t.onPress?.(); setItems((p) => p.filter((x) => x.id !== t.id)); }}
        >
          <Text style={s.text} numberOfLines={1}>{t.text}</Text>
          {!!t.sub && <Text style={s.sub} numberOfLines={2}>{t.sub}</Text>}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  host: { position: 'absolute', top: 8, left: 10, right: 10, gap: 6, zIndex: 1000 },
  toast: { backgroundColor: colors.surface3, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.line, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 6 },
  text: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  sub: { color: colors.inkSecondary, fontSize: 13, marginTop: 2 },
});
