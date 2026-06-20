// Sesli sohbet çubuğu — bağlıyken ekranın altında görünür; mic/sağırlaştır/ayrıl.
import { useEffect, useReducer, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from './theme';
import { voice } from './voice';
import { VoiceRoom } from './VoiceRoom';

export function VoiceBar() {
  const [, force] = useReducer((x) => x + 1, 0);
  const [roomOpen, setRoomOpen] = useState(false);
  useEffect(() => {
    const h = () => force();
    voice.on('change', h);
    voice.on('connected', h);
    voice.on('disconnected', h);
    return () => { voice.off('change', h); voice.off('connected', h); voice.off('disconnected', h); };
  }, []);

  if (!voice.isConnected()) return null;

  return (
    <>
      <View style={s.bar}>
        <TouchableOpacity style={s.info} onPress={() => setRoomOpen(true)}>
          <View style={s.dot} />
          <View style={{ flex: 1 }}>
            <Text style={s.title} numberOfLines={1}>Sesli — {voice.channelName || 'Kanal'}</Text>
            <Text style={s.sub}>{voice.participants().length} kişi · genişlet</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={[s.ctrlBtn, voice.isCameraOn() && s.ctrlActive]} onPress={async () => { try { await voice.toggleCamera(); } catch {} force(); }}>
          <Text style={s.ctrl}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={() => voice.toggleMute()}>
          <Text style={s.ctrl}>{voice.isMuted() ? '🔇' : '🎤'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={() => voice.toggleDeafen()}>
          <Text style={s.ctrl}>{voice.isDeafened() ? '🔕' : '🎧'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.leaveBtn} onPress={() => voice.disconnect()}>
          <Text style={s.leaveText}>Ayrıl</Text>
        </TouchableOpacity>
      </View>
      <VoiceRoom visible={roomOpen} onClose={() => setRoomOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderTopWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10 },
  info: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.online },
  ctrlActive: { backgroundColor: colors.brand + '33', borderWidth: 1, borderColor: colors.brand },
  title: { color: colors.online, fontWeight: '800', fontSize: 14 },
  sub: { color: colors.inkTertiary, fontSize: 12, marginTop: 1 },
  ctrlBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  ctrl: { fontSize: 18 },
  leaveBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  leaveText: { color: '#fff', fontWeight: '800' },
});
