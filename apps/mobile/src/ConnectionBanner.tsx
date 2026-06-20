// Bağlantı durumu çubuğu — gateway koptuğunda/yeniden bağlanırken görünür.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from './theme';
import { onConnection, type ConnState } from './gateway';

export function ConnectionBanner() {
  const [state, setState] = useState<ConnState | null>(null);
  useEffect(() => onConnection(setState), []);
  if (!state || state === 'connected') return null;
  return (
    <View style={[s.banner, state === 'disconnected' && s.bad]}>
      <Text style={s.text}>{state === 'connecting' ? 'Bağlanıyor…' : 'Bağlantı koptu — yeniden bağlanılıyor…'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { backgroundColor: colors.idle, paddingVertical: 5, alignItems: 'center' },
  bad: { backgroundColor: colors.accent },
  text: { color: '#1a1a1a', fontWeight: '800', fontSize: 12 },
});
