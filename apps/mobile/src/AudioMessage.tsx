// Sesli mesaj oynatıcı — ekteki audio/* dosyalarını çal/duraklat.
import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Audio } from 'expo-av';
import { colors } from './theme';

export function AudioMessage({ url, name }: { url: string; name?: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const durMatch = (name || url).match(/_(\d+)sn/);
  const dur = durMatch ? parseInt(durMatch[1], 10) : 0;
  const durLabel = dur ? `${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}` : '';

  useEffect(
    () => () => {
      sound?.unloadAsync().catch(() => {});
    },
    [sound],
  );

  async function toggle() {
    try {
      if (!sound) {
        const { sound: snd } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true });
        snd.setOnPlaybackStatusUpdate((st: any) => {
          if (st?.didJustFinish) setPlaying(false);
        });
        setSound(snd);
        setPlaying(true);
      } else if (playing) {
        await sound.pauseAsync();
        setPlaying(false);
      } else {
        await sound.playAsync();
        setPlaying(true);
      }
    } catch {}
  }

  return (
    <TouchableOpacity style={s.row} onPress={toggle}>
      <Text style={s.icon}>{playing ? '⏸' : '▶️'}</Text>
      <View style={s.bar}>
        <View style={s.barFill} />
      </View>
      <Text style={s.label}>🎤 Sesli mesaj{durLabel ? ` · ${durLabel}` : ''}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  icon: { fontSize: 18 },
  bar: {
    width: 90,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface3,
    overflow: 'hidden',
  },
  barFill: { width: '40%', height: '100%', backgroundColor: colors.brand },
  label: { color: colors.inkSecondary, fontSize: 13, fontWeight: '600' },
});
