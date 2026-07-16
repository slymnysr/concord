// Ekranlar arası paylaşılan UI parçaları — başlık çubuğu, satır, bölüm, ortak stiller.
import { useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors } from './theme';

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={ui.header}>
      <TouchableOpacity onPress={onBack} style={ui.back} hitSlop={10}>
        <Text style={ui.backText}>‹</Text>
      </TouchableOpacity>
      <Text style={ui.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={ui.headerRight}>{right}</View>
    </View>
  );
}

export function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View style={ui.section}>
      {!!title && <Text style={ui.sectionTitle}>{title.toUpperCase()}</Text>}
      <View style={ui.sectionCard}>{children}</View>
    </View>
  );
}

export function Row({
  label,
  value,
  onPress,
  danger,
  right,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
}) {
  const Cmp: any = onPress ? TouchableOpacity : View;
  return (
    <Cmp style={ui.row} onPress={onPress}>
      <Text style={[ui.rowLabel, danger && { color: colors.accent }]}>{label}</Text>
      {right ??
        (value !== undefined ? (
          <Text style={ui.rowValue} numberOfLines={1}>
            {value}
          </Text>
        ) : onPress ? (
          <Text style={ui.chevron}>›</Text>
        ) : null)}
    </Cmp>
  );
}

export function Avatar({
  name,
  color,
  url,
  size = 40,
}: {
  name?: string;
  color?: string;
  url?: string;
  size?: number;
}) {
  return (
    <View
      style={[
        ui.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color || colors.surface3,
        },
      ]}
    >
      <Text style={[ui.avatarText, { fontSize: size * 0.42 }]}>
        {(name || '?').slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={ui.loading}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={ui.empty}>{text}</Text>;
}

export function statusColor(status?: string) {
  return status === 'online'
    ? colors.online
    : status === 'idle'
      ? colors.idle
      : status === 'dnd'
        ? colors.dnd
        : colors.inkTertiary;
}

// Android uyumlu metin-giriş modalı (Alert.prompt iOS-only olduğu için)
export function InputModal({
  visible,
  title,
  placeholder,
  initial,
  secure,
  multiline,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initial?: string;
  secure?: boolean;
  multiline?: boolean;
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [v, setV] = useState(initial ?? '');
  useEffect(() => {
    if (visible) setV(initial ?? '');
  }, [visible, initial]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={ui.modalBackdrop} onPress={onCancel}>
          <Pressable style={ui.modalCard} onPress={() => {}}>
            <Text style={ui.modalTitle}>{title}</Text>
            <TextInput
              style={[ui.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]}
              value={v}
              onChangeText={setV}
              placeholder={placeholder}
              placeholderTextColor={colors.inkTertiary}
              secureTextEntry={secure}
              multiline={multiline}
              autoCapitalize="none"
              autoFocus
            />
            <View style={ui.modalBtns}>
              <TouchableOpacity style={[ui.btnGhost, { flex: 1 }]} onPress={onCancel}>
                <Text style={ui.btnGhostText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ui.btn, { flex: 1 }]} onPress={() => onSubmit(v)}>
                <Text style={ui.btnText}>{submitLabel ?? 'Tamam'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.ink, fontSize: 30, lineHeight: 32 },
  headerTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 6 },
  section: { marginTop: 18, paddingHorizontal: 14 },
  sectionTitle: {
    color: colors.inkTertiary,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  sectionCard: { backgroundColor: colors.surface1, borderRadius: 14, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 10,
  },
  rowLabel: { color: colors.ink, fontSize: 15, flexShrink: 1 },
  rowValue: { color: colors.inkSecondary, fontSize: 14, maxWidth: '55%' },
  chevron: { color: colors.inkTertiary, fontSize: 20 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { color: '#fff', fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  empty: { color: colors.inkTertiary, textAlign: 'center', padding: 24 },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.ink,
    fontSize: 15,
  },
  btn: {
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { color: '#06281F', fontWeight: '800', fontSize: 15 },
  btnGhost: {
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnGhostText: { color: colors.ink, fontWeight: '700', fontSize: 15 },
  headerBtn: {
    color: colors.brand,
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', backgroundColor: colors.surface1, borderRadius: 18, padding: 18 },
  modalTitle: { color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 12 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
