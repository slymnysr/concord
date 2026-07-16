import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { colors } from '../theme';
import { api, type User } from '../api';
import { getHost, setHost } from '../config';
import { InputModal } from '../ui';

export function LoginScreen({ onLogin }: { onLogin: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [host, setHostInput] = useState(getHost() || 'http://192.168.1.');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [totp, setTotp] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState<null | 'email' | 'reset_token' | 'reset_pw'>(null);
  const [resetToken, setResetToken] = useState('');

  async function submit() {
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      await setHost(host);
      const d =
        mode === 'login'
          ? await api.login(email.trim(), password, needTotp ? totp.trim() : undefined)
          : await api.register(
              email.trim(),
              password,
              username.trim(),
              displayName.trim() || username.trim(),
            );
      onLogin(d.user);
    } catch (e: any) {
      const msg = e?.message ?? 'Bağlanılamadı — sunucu adresini kontrol et';
      if (mode === 'login' && /2fa|totp|iki adım|doğrulama kodu/i.test(msg)) {
        setNeedTotp(true);
        setErr('İki adımlı doğrulama kodunu gir.');
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(value: string) {
    const step = forgot;
    setForgot(null);
    try {
      await setHost(host);
      if (step === 'email') {
        await api.forgotPassword(value.trim());
        Alert.alert(
          'Concord',
          'Sıfırlama bağlantısı e-postana gönderildi. Koddan sonra "Kodu girdim" ile devam et.',
        );
      } else if (step === 'reset_token') {
        setResetToken(value.trim());
        setForgot('reset_pw');
      } else if (step === 'reset_pw') {
        await api.resetPassword(resetToken, value);
        Alert.alert('Concord', 'Şifren güncellendi, şimdi giriş yapabilirsin.');
      }
    } catch (e: any) {
      Alert.alert('Concord', e?.message ?? 'İşlem başarısız');
    }
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>Concord</Text>
        <Text style={s.subtitle}>
          {mode === 'login' ? 'Hesabına giriş yap' : 'Yeni hesap oluştur'}
        </Text>

        <Text style={s.label}>Sunucu adresi</Text>
        <TextInput
          style={s.input}
          value={host}
          onChangeText={setHostInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.1.34"
          placeholderTextColor={colors.inkTertiary}
        />

        {mode === 'register' && (
          <>
            <Text style={s.label}>Kullanıcı adı</Text>
            <TextInput
              style={s.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="ornek_kullanici"
              placeholderTextColor={colors.inkTertiary}
            />
            <Text style={s.label}>Görünen ad</Text>
            <TextInput
              style={s.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Adın"
              placeholderTextColor={colors.inkTertiary}
            />
          </>
        )}

        <Text style={s.label}>E-posta</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="sen@ornek.com"
          placeholderTextColor={colors.inkTertiary}
        />
        <Text style={s.label}>Parola</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.inkTertiary}
        />

        {needTotp && (
          <>
            <Text style={s.label}>İki adımlı doğrulama kodu</Text>
            <TextInput
              style={s.input}
              value={totp}
              onChangeText={setTotp}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={colors.inkTertiary}
            />
          </>
        )}

        {err && <Text style={s.err}>{err}</Text>}

        <TouchableOpacity
          style={[s.btn, busy && { opacity: 0.6 }]}
          onPress={submit}
          disabled={busy}
        >
          <Text style={s.btnText}>
            {busy ? 'Bekleyin…' : mode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </Text>
        </TouchableOpacity>

        {mode === 'login' && (
          <View style={s.linksRow}>
            <TouchableOpacity onPress={() => setForgot('email')}>
              <Text style={s.linkSmall}>Şifreni mi unuttun?</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setForgot('reset_token')}>
              <Text style={s.linkSmall}>Kodu girdim</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setNeedTotp(false);
            setErr(null);
          }}
        >
          <Text style={s.switch}>
            {mode === 'login' ? 'Hesabın yok mu? Kayıt ol' : 'Zaten hesabın var mı? Giriş yap'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <InputModal
        visible={!!forgot}
        title={
          forgot === 'email'
            ? 'Şifre sıfırlama — e-posta'
            : forgot === 'reset_token'
              ? 'Sıfırlama kodu'
              : 'Yeni şifre'
        }
        placeholder={
          forgot === 'email'
            ? 'sen@ornek.com'
            : forgot === 'reset_token'
              ? 'e-postadaki kod'
              : '••••••••'
        }
        secure={forgot === 'reset_pw'}
        submitLabel={forgot === 'reset_pw' ? 'Güncelle' : 'Devam'}
        onCancel={() => setForgot(null)}
        onSubmit={submitForgot}
      />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { color: colors.brand, fontSize: 36, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.inkSecondary, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  label: {
    color: colors.inkSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface1,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
  },
  err: { color: colors.accent, marginTop: 12, textAlign: 'center' },
  btn: { backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14, marginTop: 20 },
  btnText: { color: '#06281F', fontWeight: '800', textAlign: 'center', fontSize: 16 },
  linksRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  linkSmall: { color: colors.inkSecondary, fontSize: 13 },
  switch: { color: colors.brand, textAlign: 'center', marginTop: 16 },
});
