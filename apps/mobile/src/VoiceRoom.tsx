// Sesli/görüntülü oda — video karoları (RTCView), kamera aç/kapa, mic/sağırlaştır/ayrıl.
// VoiceBar'a dokununca tam ekran açılır. RTCView native → yalnız dev client/native build'de render olur.
import { useEffect, useReducer, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { colors } from './theme';
import { voice } from './voice';
import { api } from './api';

export function VoiceRoom({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [, force] = useReducer((x) => x + 1, 0);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const h = () => force();
    voice.on('change', h);
    voice.on('disconnected', h);
    return () => { voice.off('change', h); voice.off('disconnected', h); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    for (const p of voice.participants()) {
      if (!names[p.userId]) api.user(p.userId).then((u) => setNames((n) => ({ ...n, [p.userId]: u.display_name }))).catch(() => {});
    }
  }, [visible, names]);

  if (!visible) return null;
  const videos = voice.videoStreams();
  const local = voice.localCameraStream();
  const audioOnly = voice.participants().filter((p) => !videos.some((v) => v.userId === p.userId));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.root}>
        <View style={s.header}>
          <Text style={s.title} numberOfLines={1}>🔊 {voice.channelName || 'Sesli'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.min}>Küçült ▾</Text></TouchableOpacity>
        </View>

        {voice.isStageChannel() && (
          <View style={s.stageBar}>
            <Text style={s.stageTitle}>🎤 Sahne · {voice.speakerIds().length} konuşmacı</Text>
            {!voice.amSpeaker() ? (
              <TouchableOpacity style={s.handBtn} onPress={() => { voice.raiseHand(!voice.myHandRaised()); force(); }}>
                <Text style={s.handBtnText}>{voice.myHandRaised() ? '✋ Eli indir' : '✋ El kaldır'}</Text>
              </TouchableOpacity>
            ) : voice.handIds().length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {voice.handIds().map((uid) => (
                  <TouchableOpacity key={uid} style={s.handChip} onPress={() => { voice.makeSpeaker(uid, true); force(); }}>
                    <Text style={s.handChipText}>✋ {names[uid] ?? '…'} → konuşmacı yap</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={s.stageSub}>El kaldıran yok</Text>
            )}
          </View>
        )}

        <ScrollView contentContainerStyle={s.grid}>
          {local && (
            <View style={s.tile}>
              <RTCView streamURL={(local as any).toURL()} style={s.video} objectFit="cover" mirror />
              <Text style={s.tileName}>Sen{voice.isMuted() ? ' 🔇' : ''}</Text>
            </View>
          )}
          {videos.map((v) => (
            <View key={v.producerId} style={s.tile}>
              {v.stream ? <RTCView streamURL={(v.stream as any).toURL()} style={s.video} objectFit="cover" /> : <View style={s.video} />}
              <Text style={s.tileName}>{names[v.userId] ?? '…'}{v.source === 'screen' ? ' 🖥️' : ''}</Text>
            </View>
          ))}
          {audioOnly.map((p) => (
            <View key={p.userId} style={[s.tile, s.audioTile]}>
              <View style={s.avatarBig}><Text style={s.avatarText}>{(names[p.userId] ?? '?').slice(0, 1).toUpperCase()}</Text></View>
              <Text style={s.tileName} numberOfLines={1}>{names[p.userId] ?? p.userId}{p.serverMute ? ' 🔇' : ''}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={s.controls}>
          <Ctrl label={voice.isMuted() ? '🔇' : '🎤'} onPress={() => { voice.toggleMute(); force(); }} />
          <Ctrl label={voice.isDeafened() ? '🔕' : '🎧'} onPress={() => { voice.toggleDeafen(); force(); }} />
          <Ctrl label="📷" active={voice.isCameraOn()} onPress={async () => { try { await voice.toggleCamera(); } catch {} force(); }} />
          {Platform.OS === 'android' && (
            <Ctrl label="🖥️" active={voice.isScreenOn()} onPress={async () => { try { await voice.toggleScreen(); } catch {} force(); }} />
          )}
          <TouchableOpacity style={s.leave} onPress={() => { voice.disconnect(); onClose(); }}>
            <Text style={s.leaveText}>Ayrıl</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Ctrl({ label, onPress, active }: { label: string; onPress: () => void; active?: boolean }) {
  return (
    <TouchableOpacity style={[s.ctrl, active && s.ctrlActive]} onPress={onPress}>
      <Text style={{ fontSize: 22 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.line },
  title: { color: colors.ink, fontWeight: '800', fontSize: 18, flex: 1 },
  min: { color: colors.brand, fontWeight: '700' },
  stageBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.line, gap: 8 },
  stageTitle: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  stageSub: { color: colors.inkTertiary, fontSize: 12 },
  handBtn: { alignSelf: 'flex-start', backgroundColor: colors.brand + '22', borderWidth: 1, borderColor: colors.brand, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  handBtnText: { color: colors.brand, fontWeight: '700' },
  handChip: { backgroundColor: colors.surface2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  handChipText: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, justifyContent: 'center' },
  tile: { width: '46%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surface2, justifyContent: 'flex-end' },
  audioTile: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  video: { flex: 1, width: '100%', backgroundColor: '#000' },
  tileName: { position: 'absolute', bottom: 6, left: 8, color: '#fff', fontWeight: '700', fontSize: 13, textShadowColor: '#000', textShadowRadius: 4 },
  avatarBig: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.ink, fontWeight: '800', fontSize: 30 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 18, borderTopWidth: 1, borderColor: colors.line },
  ctrl: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  ctrlActive: { backgroundColor: colors.brand + '33', borderWidth: 1, borderColor: colors.brand },
  leave: { backgroundColor: colors.accent, borderRadius: 27, paddingHorizontal: 22, height: 54, justifyContent: 'center' },
  leaveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
