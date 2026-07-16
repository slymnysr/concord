// Kullanıcı ayarları — profil, durum, hesap, gizlilik, bildirim, güvenlik, bağlantılar.
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../theme';
import { api, uploadFile, type User } from '../api';
import { notifOn, setNotifOn } from '../push';
import type { Nav } from '../nav';
import { ScreenHeader, Section, Row, Avatar, InputModal, ui, statusColor } from '../ui';

type Edit =
  | { k: 'display_name' }
  | { k: 'bio' }
  | { k: 'pronouns' }
  | { k: 'avatar_color' }
  | { k: 'custom_status' }
  | { k: 'keywords' }
  | { k: 'pw_current' }
  | { k: 'pw_new'; current: string }
  | { k: 'email_new' }
  | { k: 'email_pw'; newEmail: string }
  | { k: 'tfa_verify' }
  | { k: 'tfa_disable' }
  | { k: 'delete_pw' };

const STATUSES: { v: 'online' | 'idle' | 'dnd' | 'offline'; label: string }[] = [
  { v: 'online', label: 'Çevrimiçi' },
  { v: 'idle', label: 'Boşta' },
  { v: 'dnd', label: 'Rahatsız Etmeyin' },
  { v: 'offline', label: 'Görünmez' },
];

export function UserSettingsScreen({
  me,
  setMe,
  nav,
  onLogout,
  onBack,
}: {
  me: User;
  setMe: (u: User) => void;
  nav: Nav;
  onLogout: () => void;
  onBack: () => void;
}) {
  const [edit, setEdit] = useState<Edit | null>(null);
  const [privacy, setPrivacy] = useState<'everyone' | 'friends'>('everyone');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [connections, setConnections] = useState<
    Array<{ id: string; type: string; name: string; visible: boolean }>
  >([]);
  const [reminders, setReminders] = useState<Array<{ id: string; remind_at: string }>>([]);
  const [notifEnabled, setNotifEnabled] = useState(notifOn());

  useEffect(() => {
    api.privacy
      .get()
      .then((p) => setPrivacy(p.allow_dms_from))
      .catch(() => {});
    api.keywords
      .list()
      .then(setKeywords)
      .catch(() => {});
    api.sessions
      .list()
      .then((s) => setSessionCount(s.length))
      .catch(() => {});
    api.connections
      .list()
      .then(setConnections)
      .catch(() => {});
    api.reminders
      .list()
      .then(setReminders)
      .catch(() => {});
  }, []);

  const refreshMe = () =>
    api
      .me()
      .then(setMe)
      .catch(() => {});
  const toast = (m: string) => Alert.alert('Concord', m);

  async function pickAndUpload(kind: 'avatar' | 'banner') {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.9 });
    const a = res.canceled ? null : res.assets?.[0];
    if (!a) return;
    try {
      const up = await uploadFile(
        a.uri,
        a.fileName || 'img.jpg',
        a.mimeType || 'image/jpeg',
        a.fileSize || 0,
      );
      await api.updateProfile(kind === 'avatar' ? { avatar_url: up.url } : { banner_url: up.url });
      refreshMe();
      toast(kind === 'avatar' ? 'Avatar güncellendi' : 'Banner güncellendi');
    } catch (e: any) {
      toast(e?.message ?? 'Yüklenemedi');
    }
  }

  async function setStatus(v: 'online' | 'idle' | 'dnd' | 'offline') {
    try {
      await api.updateStatus(v);
      refreshMe();
    } catch (e: any) {
      toast(e?.message ?? 'Olmadı');
    }
  }

  async function togglePrivacy() {
    const next = privacy === 'everyone' ? 'friends' : 'everyone';
    try {
      await api.privacy.set(next);
      setPrivacy(next);
    } catch (e: any) {
      toast(e?.message ?? 'Olmadı');
    }
  }

  async function start2fa() {
    if (me.mfa_enabled) {
      setEdit({ k: 'tfa_disable' });
      return;
    }
    try {
      const r = await api.twofa.enable();
      Alert.alert(
        '2FA Kurulumu',
        `Authenticator uygulamasına ekle:\n\n${r.secret}\n\nArdından üretilen 6 haneli kodu gir.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Kodu Gir', onPress: () => setEdit({ k: 'tfa_verify' }) },
        ],
      );
    } catch (e: any) {
      toast(e?.message ?? 'Olmadı');
    }
  }

  async function githubConnect() {
    try {
      const r = await api.connections.githubAuthorize();
      Linking.openURL(r.url).catch(() => {});
    } catch (e: any) {
      toast(e?.message ?? 'GitHub bağlanamadı (sunucuda yapılandırılmamış olabilir)');
    }
  }

  async function submitEdit(value: string) {
    const e = edit;
    setEdit(null);
    if (!e) return;
    try {
      switch (e.k) {
        case 'display_name':
          if (value.trim()) {
            await api.updateProfile({ display_name: value.trim() });
            refreshMe();
          }
          break;
        case 'bio':
          await api.updateProfile({ bio: value.trim() || null });
          refreshMe();
          break;
        case 'pronouns':
          await api.updateProfile({ pronouns: value.trim() });
          refreshMe();
          break;
        case 'avatar_color':
          if (/^#?[0-9a-fA-F]{6}$/.test(value.trim())) {
            await api.updateProfile({
              avatar_color: value.trim().startsWith('#') ? value.trim() : '#' + value.trim(),
            });
            refreshMe();
          } else toast('Geçerli bir renk kodu gir (örn. 00D9A6)');
          break;
        case 'custom_status':
          await api.updateCustomStatus({ custom_status_text: value.trim() || null });
          refreshMe();
          break;
        case 'keywords': {
          const arr = value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          await api.keywords.set(arr);
          setKeywords(arr);
          break;
        }
        case 'pw_current':
          setEdit({ k: 'pw_new', current: value });
          return;
        case 'pw_new':
          await api.changePassword(e.current, value);
          toast('Şifre değiştirildi');
          break;
        case 'email_new':
          setEdit({ k: 'email_pw', newEmail: value });
          return;
        case 'email_pw': {
          const r = await api.changeEmail(e.newEmail, value);
          toast(r.sent ? 'Doğrulama maili gönderildi' : 'İstek alındı');
          break;
        }
        case 'tfa_verify':
          await api.twofa.verify(value);
          toast('2FA açıldı');
          refreshMe();
          break;
        case 'tfa_disable':
          await api.twofa.disable(value);
          toast('2FA kapatıldı');
          refreshMe();
          break;
        case 'delete_pw':
          await api.deleteAccount(value);
          onLogout();
          break;
      }
    } catch (err: any) {
      toast(err?.message ?? 'İşlem başarısız');
    }
  }

  function confirmDelete() {
    Alert.alert('Hesabı sil', 'Bu işlem geri alınamaz. Devam etmek için şifreni gir.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Devam', style: 'destructive', onPress: () => setEdit({ k: 'delete_pw' }) },
    ]);
  }

  const editMeta: Record<
    string,
    { title: string; placeholder?: string; initial?: string; secure?: boolean; multiline?: boolean }
  > = {
    display_name: { title: 'Görünen ad', initial: me.display_name },
    bio: { title: 'Hakkımda', initial: me.bio, multiline: true },
    pronouns: { title: 'Zamirler', initial: me.pronouns, placeholder: 'o / onlar' },
    avatar_color: {
      title: 'Avatar rengi (hex)',
      initial: (me.avatar_color || '').replace('#', ''),
      placeholder: '00D9A6',
    },
    custom_status: {
      title: 'Özel durum',
      initial: me.custom_status_text,
      placeholder: 'Ne yapıyorsun?',
    },
    keywords: { title: 'Bildirim anahtar kelimeleri (virgülle)', initial: keywords.join(', ') },
    pw_current: { title: 'Mevcut şifre', secure: true },
    pw_new: { title: 'Yeni şifre', secure: true },
    email_new: { title: 'Yeni e-posta', placeholder: 'sen@ornek.com' },
    email_pw: { title: 'Şifren (doğrulama)', secure: true },
    tfa_verify: { title: '2FA kodu', placeholder: '123456' },
    tfa_disable: { title: '2FA kodu (kapatmak için)', placeholder: '123456' },
    delete_pw: { title: 'Şifren', secure: true },
  };
  const m = edit ? editMeta[edit.k] : null;

  return (
    <View style={ui.screen}>
      <ScreenHeader title="Ayarlar" onBack={onBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.profileTop}>
          <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size={72} />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{me.display_name}</Text>
            <Text style={s.handle}>@{me.username}</Text>
            <View style={s.statusInline}>
              <View style={[s.dot, { backgroundColor: statusColor(me.status) }]} />
              <Text style={s.statusText}>
                {STATUSES.find((x) => x.v === me.status)?.label ?? me.status}
              </Text>
            </View>
          </View>
        </View>

        <Section title="Profil">
          <Row label="Avatar (fotoğraf yükle)" onPress={() => pickAndUpload('avatar')} />
          <Row label="Banner (fotoğraf yükle)" onPress={() => pickAndUpload('banner')} />
          <Row
            label="Görünen ad"
            value={me.display_name}
            onPress={() => setEdit({ k: 'display_name' })}
          />
          <Row label="Hakkımda" value={me.bio || '—'} onPress={() => setEdit({ k: 'bio' })} />
          <Row
            label="Zamirler"
            value={me.pronouns || '—'}
            onPress={() => setEdit({ k: 'pronouns' })}
          />
          <Row
            label="Avatar rengi"
            value={me.avatar_color}
            onPress={() => setEdit({ k: 'avatar_color' })}
          />
        </Section>

        <Section title="Durum">
          <View style={s.statusRow}>
            {STATUSES.map((st) => (
              <TouchableOpacity
                key={st.v}
                style={[s.statusChip, me.status === st.v && s.statusChipActive]}
                onPress={() => setStatus(st.v)}
              >
                <View style={[s.dot, { backgroundColor: statusColor(st.v) }]} />
                <Text style={[s.statusChipText, me.status === st.v && { color: colors.ink }]}>
                  {st.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Row
            label="Özel durum"
            value={me.custom_status_text || '—'}
            onPress={() => setEdit({ k: 'custom_status' })}
          />
        </Section>

        <Section title="Hesap">
          <Row label="Şifre değiştir" onPress={() => setEdit({ k: 'pw_current' })} />
          <Row
            label="E-posta değiştir"
            value={me.email}
            onPress={() => setEdit({ k: 'email_new' })}
          />
          <Row
            label={me.email_verified ? 'E-posta doğrulandı' : 'E-postayı doğrula'}
            onPress={
              me.email_verified
                ? undefined
                : async () => {
                    try {
                      await api.verifyEmail();
                      toast('Doğrulama maili gönderildi');
                    } catch (e: any) {
                      toast(e?.message ?? 'Olmadı');
                    }
                  }
            }
            right={me.email_verified ? <Text style={{ color: colors.online }}>✓</Text> : undefined}
          />
        </Section>

        <Section title="Gizlilik & Bildirim">
          <Row
            label="Uygulama bildirimleri"
            value={notifEnabled ? 'Açık' : 'Kapalı'}
            onPress={() => {
              const v = !notifEnabled;
              setNotifEnabled(v);
              setNotifOn(v);
            }}
          />
          <Row
            label="DM'ler"
            value={privacy === 'everyone' ? 'Herkes' : 'Sadece arkadaşlar'}
            onPress={togglePrivacy}
          />
          <Row
            label="Anahtar kelime bildirimleri"
            value={keywords.length ? `${keywords.length} kelime` : '—'}
            onPress={() => setEdit({ k: 'keywords' })}
          />
        </Section>

        <Section title="Güvenlik">
          <Row label="Aktif oturumlar" value={sessionCount !== null ? String(sessionCount) : '…'} />
          <Row
            label="Diğer oturumları kapat"
            onPress={async () => {
              try {
                await api.sessions.revokeOthers();
                toast('Diğer oturumlar kapatıldı');
                setSessionCount(1);
              } catch (e: any) {
                toast(e?.message ?? 'Olmadı');
              }
            }}
          />
          <Row
            label={me.mfa_enabled ? 'İki adımlı doğrulama (açık)' : 'İki adımlı doğrulama'}
            onPress={start2fa}
            right={me.mfa_enabled ? <Text style={{ color: colors.online }}>✓</Text> : undefined}
          />
        </Section>

        <Section title="Bağlantılar">
          {connections.map((c) => (
            <Row
              key={c.id}
              label={`${c.type}: ${c.name}`}
              right={
                <TouchableOpacity
                  onPress={async () => {
                    try {
                      await api.connections.remove(c.id);
                      setConnections((p) => p.filter((x) => x.id !== c.id));
                    } catch {}
                  }}
                >
                  <Text style={{ color: colors.accent }}>Kaldır</Text>
                </TouchableOpacity>
              }
            />
          ))}
          <Row label="GitHub bağla" onPress={githubConnect} />
        </Section>

        <Section title="Geliştirici">
          <Row label="Bot uygulamalarım" onPress={() => nav.push({ kind: 'developer' })} />
        </Section>

        {reminders.length > 0 && (
          <Section title="Hatırlatıcılar">
            {reminders.map((r) => (
              <Row
                key={r.id}
                label={new Date(r.remind_at).toLocaleString('tr-TR')}
                right={
                  <TouchableOpacity
                    onPress={() =>
                      api.reminders
                        .delete(r.id)
                        .then(() => setReminders((p) => p.filter((x) => x.id !== r.id)))
                        .catch(() => {})
                    }
                  >
                    <Text style={{ color: colors.accent }}>Sil</Text>
                  </TouchableOpacity>
                }
              />
            ))}
          </Section>
        )}

        <Section>
          <Row
            label="Çıkış yap"
            danger
            onPress={() =>
              Alert.alert('Çıkış', 'Çıkış yapılsın mı?', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Çıkış', style: 'destructive', onPress: onLogout },
              ])
            }
          />
          <Row label="Hesabı sil" danger onPress={confirmDelete} />
        </Section>
      </ScrollView>

      <InputModal
        visible={!!edit}
        title={m?.title ?? ''}
        placeholder={m?.placeholder}
        initial={m?.initial}
        secure={m?.secure}
        multiline={m?.multiline}
        onCancel={() => setEdit(null)}
        onSubmit={submitEdit}
      />
    </View>
  );
}

const s = StyleSheet.create({
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  name: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  handle: { color: colors.inkSecondary, fontSize: 14, marginTop: 2 },
  statusInline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusText: { color: colors.inkSecondary, fontSize: 13 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface2,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusChipActive: { borderColor: colors.brand, backgroundColor: colors.brand + '22' },
  statusChipText: { color: colors.inkSecondary, fontWeight: '600', fontSize: 13 },
});
