// Anket oluşturucu modalı — soru + 2-4 seçenek.
import { t } from './i18n';
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { colors } from './theme';
import { ui } from './ui';

export function PollComposer({
  visible,
  onCancel,
  onCreate,
}: {
  visible: boolean;
  onCancel: () => void;
  onCreate: (question: string, answers: string[]) => void;
}) {
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState(['', '']);

  useEffect(() => {
    if (visible) {
      setQuestion('');
      setAnswers(['', '']);
    }
  }, [visible]);

  const setAns = (i: number, v: string) => setAnswers((p) => p.map((a, j) => (j === i ? v : a)));
  const valid = question.trim().length > 0 && answers.filter((a) => a.trim()).length >= 2;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.backdrop} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Text style={s.title}>{t('poll.create')}</Text>
          <TextInput
            style={ui.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="Soru"
            placeholderTextColor={colors.inkTertiary}
          />
          {answers.map((a, i) => (
            <TextInput
              key={i}
              style={[ui.input, { marginTop: 8 }]}
              value={a}
              onChangeText={(v) => setAns(i, v)}
              placeholder={`Seçenek ${i + 1}`}
              placeholderTextColor={colors.inkTertiary}
            />
          ))}
          {answers.length < 4 && (
            <TouchableOpacity onPress={() => setAnswers((p) => [...p, ''])}>
              <Text style={s.add}>{t('poll.addOption')}</Text>
            </TouchableOpacity>
          )}
          <View style={s.btns}>
            <TouchableOpacity style={[ui.btnGhost, { flex: 1 }]} onPress={onCancel}>
              <Text style={ui.btnGhostText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.btn, { flex: 1 }, !valid && { opacity: 0.4 }]}
              disabled={!valid}
              onPress={() =>
                onCreate(question.trim(), answers.map((a) => a.trim()).filter(Boolean))
              }
            >
              <Text style={ui.btnText}>{t('common.create')}</Text>
            </TouchableOpacity>
          </View>
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
    padding: 18,
    paddingBottom: 28,
  },
  title: { color: colors.ink, fontWeight: '800', fontSize: 16, marginBottom: 12 },
  add: { color: colors.brand, fontWeight: '700', marginTop: 10 },
  btns: { flexDirection: 'row', gap: 10, marginTop: 16 },
});
