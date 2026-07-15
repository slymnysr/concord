import { useEffect, useState } from 'react';
import { httpUrl } from '../serverConfig';
import { User, Lock, Smile, Bell, Mic, Keyboard, Palette, Check, Shield, Link2, Eye, EyeOff, Trash2, BadgeCheck, Bot, Copy, RefreshCw, Plus } from 'lucide-react';
import { api, tokenStore, type APIConnection, type APIApplication } from '../api';
import { playMentionSound, playMessageSound } from '../notifSound';
import { useAppDispatch, useAppSelector, closeModal, fetchMe, addToast, logout } from '../store';
import { t, getLocale, setLocale, LOCALES } from '../i18n';
import { setActivity, getMyActivity } from '../gateway';

type Tab = 'profile' | 'account' | 'status' | 'connections' | 'notifications' | 'voice' | 'appearance' | 'keyboard' | 'developer';

export function UserSettingsModal() {
  const me = useAppSelector((s) => s.auth.user);
  const [tab, setTab] = useState<Tab>('profile');
  if (!me) return null;

  return (
    <div className="flex max-h-[80vh]" style={{ minHeight: '500px' }}>
      <nav className="w-52 max-md:w-14 bg-surface-2 border-r border-line p-2 md:p-3 space-y-1 overflow-y-auto rounded-l-2xl max-md:rounded-none shrink-0">
        <div className="text-xs font-bold uppercase text-ink-tertiary px-2 py-2">
          Kullanıcı Ayarları
        </div>
        <TabBtn icon={<User size={16} />} active={tab === 'profile'} onClick={() => setTab('profile')}>
          {t('settings.profile')}
        </TabBtn>
        <TabBtn icon={<Lock size={16} />} active={tab === 'account'} onClick={() => setTab('account')}>
          {t('settings.account')}
        </TabBtn>
        <TabBtn icon={<Smile size={16} />} active={tab === 'status'} onClick={() => setTab('status')}>
          {t('settings.status')}
        </TabBtn>
        <TabBtn icon={<Link2 size={16} />} active={tab === 'connections'} onClick={() => setTab('connections')}>
          Bağlantılar
        </TabBtn>
        <TabBtn icon={<Bell size={16} />} active={tab === 'notifications'} onClick={() => setTab('notifications')}>
          {t('settings.notifications')}
        </TabBtn>
        <TabBtn icon={<Mic size={16} />} active={tab === 'voice'} onClick={() => setTab('voice')}>
          {t('settings.voice')}
        </TabBtn>
        <TabBtn icon={<Palette size={16} />} active={tab === 'appearance'} onClick={() => setTab('appearance')}>
          {t('settings.appearance')}
        </TabBtn>
        <TabBtn icon={<Keyboard size={16} />} active={tab === 'keyboard'} onClick={() => setTab('keyboard')}>
          {t('settings.keyboard')}
        </TabBtn>
        <TabBtn icon={<Bot size={16} />} active={tab === 'developer'} onClick={() => setTab('developer')}>
          Geliştirici
        </TabBtn>
      </nav>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'profile' && <ProfileTab />}
        {tab === 'account' && <AccountTab />}
        {tab === 'status' && <CustomStatusTab />}
        {tab === 'connections' && <ConnectionsTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'voice' && <VoiceTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'keyboard' && <KeyboardTab />}
        {tab === 'developer' && <DeveloperTab />}
      </div>
    </div>
  );
}

function TabBtn({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ' +
        (active ? 'bg-brand-500/15 text-brand-500' : 'text-ink-secondary hover:bg-surface-3 hover:text-ink-primary')
      }
    >
      {icon}
      <span className="max-md:hidden truncate">{children}</span>
    </button>
  );
}

function ProfileTab() {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user)!;
  const [displayName, setDisplayName] = useState(me.display_name);
  const [bio, setBio] = useState(me.bio ?? '');
  const [pronouns, setPronouns] = useState(me.pronouns ?? '');
  const [accent, setAccent] = useState(me.accent_color ?? '#5865F2');
  const [decoration, setDecoration] = useState(me.avatar_decoration ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  async function verifyEmail() {
    try {
      const r = await api.users.verifyEmail();
      dispatch(addToast({
        kind: 'success',
        message: r.already_verified ? 'E-postan zaten doğrulanmış' : 'Doğrulama bağlantısı e-postana gönderildi — gelen kutunu kontrol et',
      }));
    } catch {
      dispatch(addToast({ kind: 'error', message: 'Doğrulama maili gönderilemedi' }));
    }
    await dispatch(fetchMe());
  }

  async function uploadBanner(file: File) {
    setUploadingBanner(true);
    try {
      const presign = await api.uploads.presign({
        filename: file.name,
        content_type: file.type || 'image/png',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      await fetch(httpUrl('/api/v1/users/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('concord_access'),
        },
        body: JSON.stringify({ banner_url: presign.public_url }),
      });
      await dispatch(fetchMe());
    } finally {
      setUploadingBanner(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await fetch(httpUrl('/api/v1/users/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('concord_access'),
        },
        body: JSON.stringify({ display_name: displayName, bio, pronouns, accent_color: accent, avatar_decoration: decoration }),
      });
      await dispatch(fetchMe());
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    try {
      const presign = await api.uploads.presign({
        filename: file.name,
        content_type: file.type || 'image/png',
        size_bytes: file.size,
      });
      await fetch(presign.upload_url, {
        method: 'PUT',
        body: file,
        headers: file.type ? { 'Content-Type': file.type } : undefined,
      });
      await fetch(httpUrl('/api/v1/users/me'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('concord_access'),
        },
        body: JSON.stringify({ avatar_url: presign.public_url }),
      });
      await dispatch(fetchMe());
    } finally {
      setUploadingAvatar(false);
    }
  }

  const avatarUrl = me.avatar_url;

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Profilim</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-4">
        {/* Profil banner'ı */}
        <label
          className={
            'block w-full h-24 rounded-xl border border-dashed border-line hover:border-brand-500/60 cursor-pointer overflow-hidden relative ' +
            (uploadingBanner ? 'opacity-50' : '')
          }
          style={me.banner_url ? { background: `url(${me.banner_url}) center/cover` } : { backgroundColor: me.avatar_color + '40' }}
        >
          {!me.banner_url && (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-ink-tertiary">
              Profil banner'ı yüklemek için tıkla
            </span>
          )}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadBanner(f);
            }}
          />
        </label>
        <div className="flex items-center gap-4">
          <label
            className={
              'w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold overflow-hidden cursor-pointer ring-2 ring-transparent hover:ring-brand-500 transition-all relative ' +
              (uploadingAvatar ? 'opacity-50' : '')
            }
            style={{ backgroundColor: me.avatar_color }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              me.display_name.slice(0, 1).toUpperCase()
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
              }}
            />
            <span className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 text-[10px] flex items-center justify-center font-normal">
              Değiştir
            </span>
          </label>
          <div>
            <div className="text-lg font-semibold text-ink-primary">{me.display_name}</div>
            <div className="text-sm text-ink-tertiary">@{me.username}</div>
            <div className="text-xs text-ink-tertiary mt-1">
              Avatara tıkla → resim seç (PNG/JPG/GIF)
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">Görünen Ad</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">Hakkımda</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={190}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
          <p className="text-xs text-ink-tertiary mt-1">{bio.length}/190</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">Zamirler</label>
            <input
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value.slice(0, 40))}
              placeholder="örn. o/ona"
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">Vurgu Rengi</label>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-full h-10 bg-surface-1 border border-line rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">Avatar Süslemesi</label>
          <div className="flex flex-wrap gap-1.5">
            {['', '👑', '⭐', '🔥', '💎', '🌸', '🎮', '🦊', '🐱', '🍀', '⚡', '🎧'].map((d) => (
              <button
                key={d || 'none'}
                type="button"
                onClick={() => setDecoration(d)}
                className={'w-9 h-9 rounded-lg flex items-center justify-center text-lg border-2 ' + (decoration === d ? 'border-brand-500 bg-brand-500/10' : 'border-line bg-surface-1 hover:border-brand-500/40')}
                title={d ? 'Süsleme' : 'Yok'}
              >
                {d || '∅'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-tertiary mt-1">Avatarının köşesinde görünür.</p>
        </div>
        <div className="flex items-center justify-between bg-surface-1 border border-line rounded-lg px-3 py-2">
          <div>
            <div className="text-sm font-semibold text-ink-primary">E-posta</div>
            <div className="text-xs text-ink-tertiary">{me.email}</div>
          </div>
          {me.email_verified ? (
            <span className="text-xs font-semibold text-status-online flex items-center gap-1">
              <Check size={14} /> Doğrulandı
            </span>
          ) : (
            <button onClick={verifyEmail} className="px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold">
              Doğrula
            </button>
          )}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}

function AccountTab() {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user)!;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  // E-posta değiştirme
  const [newEmail, setNewEmail] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  async function changeEmail() {
    if (!newEmail.trim() || !emailPass || emailBusy) return;
    setEmailBusy(true);
    try {
      const r = await api.users.changeEmail(newEmail.trim(), emailPass);
      dispatch(addToast({
        kind: 'success',
        message: `Onay bağlantısı ${r.pending_email} adresine gönderildi — onaylayınca adresin değişecek`,
      }));
      setNewEmail('');
      setEmailPass('');
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.message || 'E-posta değiştirilemedi' }));
    } finally {
      setEmailBusy(false);
    }
  }

  async function submit() {
    setErr(null);
    setOk(false);
    if (next !== confirm) {
      setErr('Yeni parola eşleşmiyor');
      return;
    }
    if (next.length < 8) {
      setErr('Yeni parola en az 8 karakter olmalı');
      return;
    }
    try {
      await api.changePassword(current, next);
      setOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e: any) {
      setErr(e?.message ?? 'Hata');
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Hesap</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-2 text-sm mb-5">
        <div>
          <span className="text-ink-tertiary">Kullanıcı Adı: </span>
          <span className="text-ink-primary font-mono">@{me.username}</span>
        </div>
        <div>
          <span className="text-ink-tertiary">E-posta: </span>
          <span className="text-ink-primary">{me.email}</span>
        </div>
      </div>

      <h3 className="text-base font-bold text-ink-primary mb-2">E-postayı Değiştir</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3 mb-5">
        <p className="text-xs text-ink-tertiary">
          Yeni adrese onay bağlantısı gönderilir; adresin ancak onaylayınca değişir.
        </p>
        <input
          type="email"
          placeholder="Yeni e-posta adresi"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Mevcut parolan (güvenlik için)"
          value={emailPass}
          onChange={(e) => setEmailPass(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <button
          onClick={changeEmail}
          disabled={!newEmail.trim() || !emailPass || emailBusy}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-semibold"
        >
          {emailBusy ? 'Gönderiliyor...' : 'Onay Bağlantısı Gönder'}
        </button>
      </div>

      <h3 className="text-base font-bold text-ink-primary mb-2">Parolayı Değiştir</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <input
          type="password"
          placeholder="Mevcut parola"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Yeni parola (en az 8 karakter)"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder="Yeni parola tekrar"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        {err && <p className="text-accent-500 text-sm">{err}</p>}
        {ok && <p className="text-status-online text-sm">Parola başarıyla değiştirildi.</p>}
        <button
          onClick={submit}
          disabled={!current || !next || !confirm}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          Parolayı Güncelle
        </button>
      </div>

      <TwoFactorSection />
    </div>
  );
}

function TwoFactorSection() {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user)!;
  const [step, setStep] = useState<'idle' | 'setup'>('idle');
  const [secret, setSecret] = useState('');
  const [otpauth, setOtpauth] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function startEnable() {
    setErr(null);
    setBusy(true);
    try {
      const r = await api.twofa.enable();
      setSecret(r.secret);
      setOtpauth(r.otpauth_url);
      setStep('setup');
    } catch (e: any) {
      setErr(e?.message ?? 'Başlatılamadı');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setErr(null);
    setBusy(true);
    try {
      await api.twofa.verify(code);
      await dispatch(fetchMe());
      setStep('idle');
      setCode('');
    } catch (e: any) {
      setErr(e?.message ?? 'Kod hatalı');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const c = prompt('2FA kapatmak için authenticator kodunu gir:');
    if (!c) return;
    setBusy(true);
    setErr(null);
    try {
      await api.twofa.disable(c.trim());
      await dispatch(fetchMe());
    } catch (e: any) {
      setErr(e?.message ?? 'Kapatılamadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-ink-primary mb-2">İki Adımlı Doğrulama (2FA)</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        {me.totp_enabled ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-status-online flex items-center gap-2">
              <Shield size={16} /> 2FA etkin — hesabın korunuyor
            </p>
            <button onClick={disable} disabled={busy} className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-sm font-semibold">
              Devre dışı bırak
            </button>
          </div>
        ) : step === 'idle' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-secondary">
              Authenticator uygulamasıyla hesabına ekstra bir güvenlik katmanı ekle.
            </p>
            <button onClick={startEnable} disabled={busy} className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold shrink-0">
              Etkinleştir
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink-secondary">
              1. Authenticator uygulamana (Google Authenticator, Authy, vb.) bu gizli anahtarı ekle:
            </p>
            <div className="bg-surface-1 border border-line rounded-lg px-3 py-2 font-mono text-sm text-brand-400 break-all select-all">
              {secret}
            </div>
            <a href={otpauth} className="text-xs text-brand-500 hover:underline break-all block">
              veya bu otpauth bağlantısını kullan
            </a>
            <p className="text-sm text-ink-secondary">2. Uygulamadaki 6 haneli kodu gir:</p>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-center font-mono text-lg tracking-[0.3em] focus:border-brand-500/50 focus:outline-none"
            />
            {err && <p className="text-accent-500 text-sm">{err}</p>}
            <div className="flex gap-2">
              <button onClick={verify} disabled={busy || code.length !== 6} className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold">
                Doğrula ve Etkinleştir
              </button>
              <button onClick={() => { setStep('idle'); setCode(''); setErr(null); }} className="px-3 py-2 text-ink-tertiary hover:text-ink-primary text-sm">
                İptal
              </button>
            </div>
          </div>
        )}
        {me.totp_enabled && err && <p className="text-accent-500 text-sm mt-2">{err}</p>}
      </div>

      <PrivacySection />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
}

function PrivacySection() {
  const [allow, setAllow] = useState<'everyone' | 'friends'>('everyone');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.privacy.get().then((p) => { setAllow(p.allow_dms_from); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function change(v: 'everyone' | 'friends') {
    setAllow(v);
    await api.privacy.set(v).catch(() => {});
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-ink-primary mb-2">Gizlilik</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h4 className="text-sm font-semibold text-ink-primary mb-1">Bana kimler DM atabilir?</h4>
        <p className="text-xs text-ink-secondary mb-3">"Sadece arkadaşlar" seçilirse, arkadaşın olmayanlar seninle DM başlatamaz.</p>
        {loading ? (
          <p className="text-xs text-ink-tertiary">Yükleniyor…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => change('everyone')}
              className={'p-3 rounded-xl border-2 text-left transition-all ' + (allow === 'everyone' ? 'border-brand-500 bg-brand-500/5' : 'border-line bg-surface-1 hover:border-brand-500/40')}
            >
              <div className="font-semibold text-ink-primary text-sm">Herkes</div>
              <div className="text-xs text-ink-tertiary">Ortak sunucudaki herkes</div>
            </button>
            <button
              onClick={() => change('friends')}
              className={'p-3 rounded-xl border-2 text-left transition-all ' + (allow === 'friends' ? 'border-brand-500 bg-brand-500/5' : 'border-line bg-surface-1 hover:border-brand-500/40')}
            >
              <div className="font-semibold text-ink-primary text-sm">Sadece Arkadaşlar</div>
              <div className="text-xs text-ink-tertiary">Yalnızca arkadaşların</div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function KeywordManager() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.keywords.list().then((k) => { setKeywords(k); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function persist(next: string[]) {
    setKeywords(next);
    await api.keywords.set(next).catch(() => {});
  }
  function add() {
    const k = input.trim().toLowerCase();
    if (!k || keywords.includes(k) || keywords.length >= 50) { setInput(''); return; }
    persist([...keywords, k]);
    setInput('');
  }

  return (
    <div className="bg-surface-2 rounded-xl border border-line p-4 mt-4">
      <h3 className="text-sm font-bold text-ink-primary mb-2">Anahtar Kelime Bildirimleri</h3>
      <p className="text-xs text-ink-secondary mb-3">
        Bu kelimeler herhangi bir sunucudaki bir mesajda geçtiğinde sana bildirim gönderilir (mention gibi).
      </p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {loading ? (
          <span className="text-xs text-ink-tertiary">Yükleniyor…</span>
        ) : keywords.length === 0 ? (
          <span className="text-xs text-ink-tertiary">Henüz anahtar kelime yok.</span>
        ) : (
          keywords.map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-surface-3 text-ink-secondary">
              {k}
              <button onClick={() => persist(keywords.filter((x) => x !== k))} className="text-ink-tertiary hover:text-accent-500" title="Kaldır" aria-label="Kaldır">×</button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          maxLength={50}
          placeholder="Kelime ekle (ör. concord, duyuru)"
          className="flex-1 bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-1.5 text-sm text-ink-primary"
        />
        <button onClick={add} disabled={!input.trim()} className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold">Ekle</button>
      </div>
    </div>
  );
}

function DeleteAccountSection() {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function doDelete() {
    if (!password || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteAccount(password);
      // Çıkış yap + token temizle
      dispatch(logout());
      tokenStore.clear();
      location.reload();
    } catch (e: any) {
      setErr(e?.detail || e?.message || 'Hesap silinemedi');
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-accent-500/30">
      <h3 className="text-base font-bold text-accent-500 mb-2">Tehlikeli Bölge</h3>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="px-4 py-2 rounded-lg bg-accent-500/15 hover:bg-accent-500 hover:text-white text-accent-500 text-sm font-semibold"
        >
          Hesabı Sil
        </button>
      ) : (
        <div className="bg-surface-2 rounded-xl border border-accent-500/40 p-4 space-y-3">
          <p className="text-sm text-ink-secondary">
            Bu işlem <span className="font-semibold text-ink-primary">geri alınamaz</span>. Profilin anonimleştirilir,
            tüm oturumların kapatılır ve bir daha giriş yapamazsın. Onaylamak için parolanı gir.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Parolan"
            className="w-full bg-surface-1 border border-line focus:border-accent-500/60 focus:outline-none rounded-lg px-3 py-2 text-ink-primary"
          />
          {err && <p className="text-accent-500 text-sm">{err}</p>}
          <div className="flex gap-2">
            <button
              onClick={doDelete}
              disabled={!password || busy}
              className="px-4 py-2 rounded-lg bg-accent-500 hover:brightness-110 disabled:opacity-50 text-white text-sm font-semibold"
            >
              {busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
            </button>
            <button onClick={() => { setOpen(false); setPassword(''); setErr(null); }} className="px-4 py-2 text-ink-secondary hover:text-ink-primary text-sm">
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Cihaz/tarayıcı adını user-agent'tan kabaca çıkar
function deviceLabel(ua: string): { name: string; icon: string } {
  const u = (ua || '').toLowerCase();
  let os = 'Bilinmeyen cihaz';
  if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad') || u.includes('ios')) os = 'iOS';
  else if (u.includes('windows')) os = 'Windows';
  else if (u.includes('mac os') || u.includes('macintosh')) os = 'macOS';
  else if (u.includes('linux')) os = 'Linux';
  let browser = '';
  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome/') && !u.includes('edg/')) browser = 'Chrome';
  else if (u.includes('firefox/')) browser = 'Firefox';
  else if (u.includes('safari/') && !u.includes('chrome/')) browser = 'Safari';
  const mobile = u.includes('mobile') || u.includes('android') || u.includes('iphone');
  return { name: browser ? `${os} · ${browser}` : os, icon: mobile ? '📱' : '💻' };
}

function SessionsSection() {
  const dispatch = useAppDispatch();
  const [sessions, setSessions] = useState<Array<{ id: string; user_agent: string; created_at: string; expires_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  const currentId = api.sessions.current();

  async function load() {
    setLoading(true);
    try {
      setSessions(await api.sessions.list());
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function revoke(id: string) {
    await api.sessions.revoke(id).catch(() => {});
    setSessions((s) => s.filter((x) => x.id !== id));
    dispatch(addToast({ kind: 'success', message: 'Oturum sonlandırıldı' }));
  }
  async function revokeOthers() {
    if (!confirm('Bu cihaz dışındaki tüm oturumlar kapatılsın mı?')) return;
    await api.sessions.revokeOthers(currentId ?? '0').catch(() => {});
    await load();
    dispatch(addToast({ kind: 'success', message: 'Diğer oturumlar kapatıldı' }));
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-ink-primary">Aktif Oturumlar</h3>
        {sessions.length > 1 && (
          <button onClick={revokeOthers} className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-xs font-semibold">
            Diğer tüm oturumları kapat
          </button>
        )}
      </div>
      <div className="bg-surface-2 rounded-xl border border-line divide-y divide-line">
        {loading ? (
          <p className="text-sm text-ink-tertiary p-4">Yükleniyor…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-tertiary p-4">Aktif oturum yok.</p>
        ) : (
          sessions.map((s) => {
            const d = deviceLabel(s.user_agent);
            const isCurrent = s.id === currentId;
            return (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <span className="text-xl">{d.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-primary flex items-center gap-2">
                    {d.name}
                    {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 font-bold">BU CİHAZ</span>}
                  </div>
                  <div className="text-xs text-ink-tertiary">
                    {new Date(s.created_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} tarihinde giriş
                  </div>
                </div>
                {!isCurrent && (
                  <button onClick={() => revoke(s.id)} className="px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary text-xs font-semibold shrink-0">
                    Kapat
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-ink-tertiary mt-1.5">Tanımadığın bir oturum görürsen kapat ve parolanı değiştir.</p>
    </div>
  );
}

const STATUS_DURATIONS: { label: string; seconds: number }[] = [
  { label: 'Bugün boyunca', seconds: -2 }, // sentinel: gün sonuna kadar (save'de hesaplanır)
  { label: '30 dakika', seconds: 30 * 60 },
  { label: '1 saat', seconds: 60 * 60 },
  { label: '4 saat', seconds: 4 * 60 * 60 },
  { label: '24 saat', seconds: 24 * 60 * 60 },
];

function CustomStatusTab() {
  const dispatch = useAppDispatch();
  const [emoji, setEmoji] = useState('');
  const [text, setText] = useState('');
  const [duration, setDuration] = useState(-1); // -1 = süresiz, -2 = gün sonu, >0 = saniye
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    api.me().then((u: any) => {
      setEmoji(u.custom_status_emoji ?? '');
      setText(u.custom_status_text ?? '');
      setExpiresAt(u.custom_status_expires_at ?? null);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      let secs = duration;
      if (duration === -2) {
        // Gün sonuna kadar (yerel saatle 23:59)
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        secs = Math.max(60, Math.round((end.getTime() - Date.now()) / 1000));
      }
      const clearAfter = secs > 0 ? secs : 0;
      await api.updateCustomStatus({
        custom_status_text: text,
        custom_status_emoji: emoji,
        clear_after_seconds: clearAfter,
      });
      await dispatch(fetchMe());
      setExpiresAt(clearAfter > 0 ? new Date(Date.now() + clearAfter * 1000).toISOString() : null);
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setEmoji('');
    setText('');
    setDuration(0);
    setExpiresAt(null);
    await api.updateCustomStatus({ custom_status_text: '', custom_status_emoji: '', clear_after_seconds: 0 });
    await dispatch(fetchMe());
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Özel Durum</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <p className="text-sm text-ink-secondary mb-4">
          Kullanıcı adının yanında görünecek geçici bir mesaj ayarla.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
            placeholder="😎"
            className="w-14 text-center bg-surface-1 border border-line rounded-lg px-2 py-2 text-xl"
          />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ne yapıyorsun?"
            maxLength={128}
            className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs font-semibold text-ink-secondary mb-1.5">Şu kadar süre sonra temizle</label>
          <select
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value, 10))}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary focus:border-brand-500/50 focus:outline-none"
          >
            <option value={-1}>Süresiz (ben temizleyene dek)</option>
            {STATUS_DURATIONS.map((d) => (
              <option key={d.label} value={d.seconds}>{d.label}</option>
            ))}
          </select>
          {expiresAt && (
            <p className="text-xs text-ink-tertiary mt-1.5">
              Otomatik temizlenme: {new Date(expiresAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold flex-1"
          >
            {saving ? 'Kaydediliyor...' : ok ? 'Kaydedildi ✓' : 'Kaydet'}
          </button>
          <button
            onClick={clear}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary font-semibold"
          >
            Temizle
          </button>
        </div>
      </div>

      <ActivitySection />
    </div>
  );
}

// Rich presence aktivitesi — "Oynuyor: X" gibi; sunuculardaki üye listesi + profilde görünür
function ActivitySection() {
  const dispatch = useAppDispatch();
  const [actType, setActType] = useState<'playing' | 'streaming' | 'listening' | 'watching'>(
    () => (getMyActivity()?.type as any) === 'custom' ? 'playing' : ((getMyActivity()?.type as any) ?? 'playing'),
  );
  const [actName, setActName] = useState(() => getMyActivity()?.name ?? '');
  const [active, setActive] = useState(() => !!getMyActivity());

  const start = () => {
    const name = actName.trim();
    if (!name) return;
    setActivity({ type: actType, name });
    setActive(true);
    dispatch(addToast({ kind: 'success', message: 'Aktivite ayarlandı' }));
  };
  const stop = () => {
    setActivity(null);
    setActive(false);
    setActName('');
    dispatch(addToast({ kind: 'success', message: 'Aktivite temizlendi' }));
  };

  return (
    <div className="mt-8 pt-6 border-t border-line max-w-md">
      <h3 className="text-base font-bold text-ink-primary mb-1">Aktivite</h3>
      <p className="text-sm text-ink-tertiary mb-3">
        Ne yaptığını göster — üye listesinde ve profilinde "Oynuyor: …" olarak görünür.
      </p>
      <div className="flex gap-2 mb-3">
        <select
          value={actType}
          onChange={(e) => setActType(e.target.value as any)}
          className="bg-surface-2 border border-line rounded-lg px-2 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
          aria-label="Aktivite türü"
        >
          <option value="playing">🎮 Oynuyor</option>
          <option value="streaming">🔴 Yayında</option>
          <option value="listening">🎵 Dinliyor</option>
          <option value="watching">📺 İzliyor</option>
        </select>
        <input
          value={actName}
          onChange={(e) => setActName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && start()}
          placeholder="örn. Valorant"
          maxLength={128}
          className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={start}
          disabled={!actName.trim()}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-semibold flex-1"
        >
          {active ? 'Güncelle' : 'Başlat'}
        </button>
        {active && (
          <button
            onClick={stop}
            className="px-4 py-2 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-sm font-semibold"
          >
            Durdur
          </button>
        )}
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [enabled, setEnabled] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (!reg) return;
        const sub = await reg.pushManager.getSubscription();
        setSubscribed(!!sub);
      } catch {}
    })();
  }, []);

  async function enable() {
    if (typeof Notification === 'undefined') return;
    const r = await Notification.requestPermission();
    setEnabled(r);
    if (r !== 'granted') return;
    // Service worker + push subscribe
    setErr(null);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Concord public VAPID key (dev için sabit). Production'da backend'den getirilir.
      // Bu placeholder — gerçek push gönderim için backend webpush kütüphanesi ile imzalanır.
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true });
      const json = sub.toJSON() as any;
      await api.push.subscribe({
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      });
      setSubscribed(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Push aboneliği başarısız');
    }
  }

  async function disable() {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
      await api.push.unsubscribeAll();
      setSubscribed(false);
    } catch {}
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Bildirimler</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">Masaüstü Bildirimleri</h3>
        <p className="text-sm text-ink-secondary mb-3">
          Concord sekmesi açık değilken bile DM ve mention bildirimleri göstersin.
        </p>
        {err && <p className="text-accent-500 text-sm mb-2">{err}</p>}
        {enabled === 'granted' && subscribed ? (
          <div className="flex items-center gap-3">
            <p className="text-sm text-status-online flex-1">✓ Bildirimler aktif</p>
            <button
              onClick={disable}
              className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-sm font-semibold"
            >
              Aboneliği iptal et
            </button>
          </div>
        ) : enabled === 'denied' ? (
          <p className="text-sm text-accent-500">
            Bildirim izni reddedilmiş. Tarayıcı ayarlarından açabilirsin.
          </p>
        ) : (
          <button
            onClick={enable}
            className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 text-white font-semibold"
          >
            Bildirimleri Aç
          </button>
        )}
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 mt-4 space-y-1">
        <h3 className="text-sm font-bold text-ink-primary mb-2">Bildirim Tercihleri</h3>
        <AudioToggle storageKey="concord_desktop_notif" label="Masaüstü bildirimi göster" desc="Sekme arka plandayken DM/mention için sistem bildirimi" />
        <AudioToggle storageKey="concord_sound_mention" label="Mention/DM sesi" desc="Biri seni etiketlediğinde veya DM attığında ses çal" />
        <AudioToggle storageKey="concord_sound_message" label="Mesaj sesi" desc="Açık olmayan kanallara mesaj geldiğinde ses çal" />
        <div className="flex gap-2 pt-2">
          <button onClick={() => playMentionSound()} className="text-xs px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-secondary">▶ Mention sesi</button>
          <button onClick={() => playMessageSound()} className="text-xs px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-secondary">▶ Mesaj sesi</button>
        </div>
      </div>

      <KeywordManager />
    </div>
  );
}

function VoiceTab() {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [inputId, setInputId] = useState(localStorage.getItem('concord_input_device') ?? 'default');
  const [outputId, setOutputId] = useState(localStorage.getItem('concord_output_device') ?? 'default');
  const [videoId, setVideoId] = useState(localStorage.getItem('concord_video_device') ?? 'default');
  const [ptt, setPtt] = useState(localStorage.getItem('concord_ptt') === '1');
  const [pttKey, setPttKey] = useState(localStorage.getItem('concord_ptt_key') ?? 'Space');
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    navigator.mediaDevices
      .enumerateDevices()
      .then(setDevices)
      .catch(() => {});
  }, []);

  function saveDevice(kind: 'input' | 'output' | 'video', id: string) {
    if (kind === 'input') {
      setInputId(id);
      localStorage.setItem('concord_input_device', id);
    } else if (kind === 'output') {
      setOutputId(id);
      localStorage.setItem('concord_output_device', id);
    } else {
      setVideoId(id);
      localStorage.setItem('concord_video_device', id);
    }
  }

  function togglePtt(v: boolean) {
    setPtt(v);
    localStorage.setItem('concord_ptt', v ? '1' : '0');
  }

  useEffect(() => {
    if (!capturing) return;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      const k = e.code || e.key;
      setPttKey(k);
      localStorage.setItem('concord_ptt_key', k);
      setCapturing(false);
    }
    window.addEventListener('keydown', onKey, { once: true });
    return () => window.removeEventListener('keydown', onKey);
  }, [capturing]);

  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  const videos = devices.filter((d) => d.kind === 'videoinput');

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Ses & Video</h2>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">Giriş Cihazı (Mikrofon)</h3>
        <select
          value={inputId}
          onChange={(e) => saveDevice('input', e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        >
          <option value="default">Varsayılan</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Mikrofon ' + d.deviceId.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">Çıkış Cihazı (Hoparlör)</h3>
        <select
          value={outputId}
          onChange={(e) => saveDevice('output', e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        >
          <option value="default">Varsayılan</option>
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Çıkış ' + d.deviceId.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">Kamera</h3>
        <select
          value={videoId}
          onChange={(e) => saveDevice('video', e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        >
          <option value="default">Varsayılan</option>
          {videos.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || 'Kamera ' + d.deviceId.slice(0, 6)}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <h3 className="text-sm font-bold text-ink-primary">Giriş Modu</h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={!ptt}
            onChange={() => togglePtt(false)}
            className="accent-brand-500"
          />
          <span className="text-sm text-ink-primary">
            Ses Aktivitesi <span className="text-ink-tertiary">(her zaman açık)</span>
          </span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="radio"
            checked={ptt}
            onChange={() => togglePtt(true)}
            className="accent-brand-500"
          />
          <span className="text-sm text-ink-primary">
            Bas-Konuş <span className="text-ink-tertiary">(sadece tuşa basılıyken)</span>
          </span>
        </label>
        {ptt && (
          <button
            type="button"
            onClick={() => setCapturing(true)}
            className="mt-2 px-3 py-2 rounded-lg bg-surface-3 hover:bg-surface-1 text-ink-primary text-sm font-semibold border border-line"
          >
            {capturing ? 'Tuşa bas...' : `Tuş: ${pttKey}`}
          </button>
        )}
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-1">
        <h3 className="text-sm font-bold text-ink-primary mb-2">Ses İşleme</h3>
        <AudioToggle storageKey="concord_echo_cancel" label="Yankı engelleme" desc="Hoparlör sesinin mikrofona geri dönmesini önler" />
        <AudioToggle storageKey="concord_noise_suppress" label="Gürültü engelleme" desc="Arka plan gürültüsünü bastırır (tarayıcı yerleşik)" />
        <AudioToggle
          storageKey="concord_rnnoise"
          label="🤖 Gelişmiş gürültü engelleme (RNNoise)"
          desc="Yapay zekâ tabanlı — klavye/fan gibi gürültüleri çok daha iyi temizler, cihazında çalışır"
          defaultOn={false}
        />
        <AudioToggle storageKey="concord_auto_gain" label="Otomatik kazanç" desc="Mikrofon seviyesini otomatik dengeler" />
        <AudioToggle
          storageKey="concord_music_mode"
          label="🎵 Müzik modu"
          desc="Stereo + yüksek bitrate; tüm ses işleme kapatılır (enstrüman/müzik paylaşımı için)"
          defaultOn={false}
        />
        <p className="text-[11px] text-ink-tertiary pt-1">Değişiklikler bir sonraki ses kanalına katılışta uygulanır.</p>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-1">
        <h3 className="text-sm font-bold text-ink-primary mb-2">Görüntü</h3>
        <AudioToggle
          storageKey="concord_video_blur"
          label="✨ Arka planı bulanıklaştır"
          desc="Kamerada sadece sen net görünürsün (cihazında işlenir, ilk açılışta model indirilir)"
          defaultOn={false}
        />
        <p className="text-[11px] text-ink-tertiary pt-1">Kamera açıkken ses kanalındaki "Blur" düğmesiyle anında aç/kapa yapabilirsin.</p>

        <div className="pt-3 flex items-center gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink-secondary mb-1">Yayın çözünürlüğü</label>
            <select
              defaultValue={localStorage.getItem('concord_stream_res') ?? '720'}
              onChange={(e) => localStorage.setItem('concord_stream_res', e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-brand-500/50"
              aria-label="Yayın çözünürlüğü"
            >
              <option value="480">480p</option>
              <option value="720">720p (önerilen)</option>
              <option value="1080">1080p</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-ink-secondary mb-1">Kare hızı</label>
            <select
              defaultValue={localStorage.getItem('concord_stream_fps') ?? '30'}
              onChange={(e) => localStorage.setItem('concord_stream_fps', e.target.value)}
              className="w-full bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary outline-none focus:border-brand-500/50"
              aria-label="Yayın kare hızı"
            >
              <option value="15">15 FPS</option>
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </div>
        </div>
        <p className="text-[11px] text-ink-tertiary pt-1">Kamera ve ekran paylaşımına uygulanır; bir sonraki yayın açılışında geçerli olur.</p>
      </div>
    </div>
  );
}

function AudioToggle({ storageKey, label, desc, defaultOn = true }: { storageKey: string; label: string; desc: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(() => {
    const v = localStorage.getItem(storageKey);
    if (v === null) return defaultOn;
    return v === '1';
  });
  function toggle() {
    const next = !on;
    setOn(next);
    localStorage.setItem(storageKey, next ? '1' : '0');
  }
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="min-w-0 pr-3">
        <div className="text-sm text-ink-primary">{label}</div>
        <div className="text-xs text-ink-tertiary">{desc}</div>
      </div>
      <button
        onClick={toggle}
        className={'shrink-0 w-10 h-6 rounded-full transition-colors relative ' + (on ? 'bg-brand-500' : 'bg-surface-3')}
        role="switch"
        aria-checked={on}
      >
        <span className={'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ' + (on ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </div>
  );
}

function AppearanceTab() {
  const [density, setDensity] = useState(localStorage.getItem('concord_density') ?? 'cozy');
  const [theme, setTheme] = useState(localStorage.getItem('concord_theme') ?? 'dark');
  const [zoom, setZoom] = useState(() => parseInt(localStorage.getItem('concord_zoom') ?? '100', 10));

  function applyDensity(v: string) {
    setDensity(v);
    localStorage.setItem('concord_density', v);
    document.documentElement.dataset.density = v;
  }
  function applyTheme(v: string) {
    setTheme(v);
    localStorage.setItem('concord_theme', v);
    document.documentElement.dataset.theme = v;
  }
  function applyZoom(v: number) {
    setZoom(v);
    localStorage.setItem('concord_zoom', String(v));
    (document.documentElement.style as any).zoom = String(v / 100);
  }
  useEffect(() => {
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.theme = theme;
  }, [density, theme]);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('appearance.title')}</h2>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('appearance.language')}</h3>
        <p className="text-xs text-ink-secondary mb-3">{t('appearance.language.sub')}</p>
        <div className="grid grid-cols-2 gap-3">
          {LOCALES.map((l) => (
            <button
              key={l.value}
              onClick={() => { if (l.value !== getLocale()) setLocale(l.value); }}
              className={
                'p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2 ' +
                (getLocale() === l.value ? 'border-brand-500 bg-brand-500/5' : 'border-line bg-surface-1 hover:border-brand-500/40')
              }
            >
              <span className="text-xl">{l.flag}</span>
              <span className="font-semibold text-ink-primary">{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('appearance.density')}</h3>
        <p className="text-xs text-ink-secondary mb-3">
          Mesajlar arası boşluğu ve avatar boyutunu değiştirir.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => applyDensity('cozy')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (density === 'cozy'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">Rahat (Cozy)</div>
            <div className="text-xs text-ink-tertiary">Geniş aralık, büyük avatarlar</div>
          </button>
          <button
            onClick={() => applyDensity('compact')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (density === 'compact'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">Yoğun (Compact)</div>
            <div className="text-xs text-ink-tertiary">Dar satırlar, IRC tarzı</div>
          </button>
        </div>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h3 className="text-sm font-bold text-ink-primary mb-2">{t('appearance.theme')}</h3>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => applyTheme('dark')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (theme === 'dark'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">🌙 {t('appearance.theme.dark')}</div>
            <div className="text-xs text-ink-tertiary">{t('appearance.theme.darkSub')}</div>
          </button>
          <button
            onClick={() => applyTheme('light')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (theme === 'light'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">☀️ {t('appearance.theme.light')}</div>
            <div className="text-xs text-ink-tertiary">{t('appearance.theme.lightSub')}</div>
          </button>
          <button
            onClick={() => applyTheme('amoled')}
            className={
              'p-4 rounded-xl border-2 text-left transition-all ' +
              (theme === 'amoled'
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-line bg-surface-1 hover:border-brand-500/40')
            }
          >
            <div className="font-semibold text-ink-primary mb-1">⚫ {t('appearance.theme.amoled')}</div>
            <div className="text-xs text-ink-tertiary">{t('appearance.theme.amoledSub')}</div>
          </button>
        </div>
      </div>

      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-ink-primary">Yakınlaştırma Düzeyi</h3>
          <span className="text-sm font-mono text-ink-secondary">{zoom}%</span>
        </div>
        <p className="text-xs text-ink-secondary mb-3">Tüm arayüzü büyütür veya küçültür.</p>
        <div className="flex items-center gap-3">
          <button onClick={() => applyZoom(Math.max(50, zoom - 10))} className="w-8 h-8 rounded-lg bg-surface-1 border border-line text-ink-primary font-bold hover:border-brand-500/40">−</button>
          <input
            type="range"
            min={50}
            max={150}
            step={10}
            value={zoom}
            onChange={(e) => applyZoom(parseInt(e.target.value, 10))}
            className="flex-1 accent-brand-500"
          />
          <button onClick={() => applyZoom(Math.min(150, zoom + 10))} className="w-8 h-8 rounded-lg bg-surface-1 border border-line text-ink-primary font-bold hover:border-brand-500/40">+</button>
          <button onClick={() => applyZoom(100)} className="text-xs text-ink-tertiary hover:text-ink-primary px-2">Sıfırla</button>
        </div>
      </div>
    </div>
  );
}

function KeyboardTab() {
  const shortcuts = [
    { keys: ['Ctrl', 'K'], label: 'Sunucu/kanal hızlı geçiş (arama)' },
    { keys: ['Ctrl', 'Shift', 'K'], label: 'Yeni DM oluştur' },
    { keys: ['Ctrl', '/'], label: 'Bu yardımı göster' },
    { keys: ['Ctrl', 'B'], label: 'Üye listesini aç/kapat' },
    { keys: ['Enter'], label: 'Mesaj gönder' },
    { keys: ['Shift', 'Enter'], label: 'Yeni satır' },
    { keys: ['Escape'], label: 'Düzenlemeyi iptal et / Modal kapat' },
    { keys: ['↑'], label: 'Son mesajı düzenle' },
    { keys: ['Ctrl', 'Shift', 'M'], label: 'Mikrofonu sustur/aç' },
    { keys: ['Ctrl', 'Shift', 'D'], label: 'Sağırlaştır/aç' },
    { keys: ['@', 'isim'], label: 'Bir üyeyi bahset' },
    { keys: ['#', 'isim'], label: 'Bir kanal bağla' },
    { keys: [':emoji:'], label: 'Emoji ekle' },
    { keys: ['/komut'], label: 'Slash komut çalıştır' },
    { keys: ['Ctrl', 'Shift', 'R'], label: 'Sayfayı sert yenile' },
  ];
  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">Klavye Kısayolları</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-2">
        {shortcuts.map((s, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-line last:border-b-0">
            <span className="text-sm text-ink-primary">{s.label}</span>
            <div className="flex items-center gap-1">
              {s.keys.map((k, j) => (
                <kbd
                  key={j}
                  className="px-2 py-0.5 rounded bg-surface-3 text-ink-primary text-xs font-mono border border-line"
                >
                  {k}
                </kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

void closeModal;

// Bağlantılar — platform hesaplarını profiline ekle (Discord "Connections" paritesi)
function ConnectionsTab() {
  const dispatch = useAppDispatch();
  const [list, setList] = useState<APIConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState('github');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const CONN_TYPES: Array<{ value: string; label: string }> = [
    { value: 'github', label: '🐙 GitHub' },
    { value: 'steam', label: '🎮 Steam' },
    { value: 'spotify', label: '🎵 Spotify' },
    { value: 'youtube', label: '▶️ YouTube' },
    { value: 'twitch', label: '📺 Twitch' },
    { value: 'x', label: '✖️ X' },
    { value: 'reddit', label: '👽 Reddit' },
    { value: 'instagram', label: '📷 Instagram' },
    { value: 'website', label: '🌐 Web Sitesi' },
    { value: 'custom', label: '🔗 Diğer' },
  ];

  const load = () => {
    api.connections
      .list()
      .then(setList)
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const add = () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    api.connections
      .create(newType, name)
      .then(() => {
        setNewName('');
        load();
        dispatch(addToast({ kind: 'success', message: 'Bağlantı eklendi' }));
      })
      .catch((e: any) => dispatch(addToast({ kind: 'error', message: e?.message || 'Eklenemedi' })))
      .finally(() => setBusy(false));
  };

  const connectGitHub = () => {
    api.connections
      .githubAuthorize()
      .then(({ url }) => {
        window.open(url, '_blank', 'width=600,height=720');
        dispatch(addToast({ kind: 'info', message: 'GitHub penceresinde onayla; dönünce liste güncellenir' }));
      })
      .catch(() =>
        dispatch(addToast({ kind: 'info', message: 'GitHub OAuth bu sunucuda yapılandırılmamış — hesabını elle ekleyebilirsin' })),
      );
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold text-ink-primary mb-1">Bağlantılar</h2>
      <p className="text-sm text-ink-tertiary mb-4">
        Diğer platform hesaplarını profilinde göster. OAuth ile bağlananlar "doğrulanmış" rozeti alır.
      </p>

      <div className="flex gap-2 mb-3">
        <button
          onClick={connectGitHub}
          className="h-9 px-3 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line text-sm font-semibold text-ink-primary flex items-center gap-1.5"
        >
          🐙 GitHub ile Doğrula
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="bg-surface-2 border border-line rounded-lg px-2 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
          aria-label="Platform"
        >
          {CONN_TYPES.map((tpe) => (
            <option key={tpe.value} value={tpe.value}>
              {tpe.label}
            </option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Kullanıcı adı / bağlantı"
          className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
        />
        <button
          onClick={add}
          disabled={!newName.trim() || busy}
          className="h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-semibold"
        >
          Ekle
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-ink-tertiary">Yükleniyor...</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-ink-tertiary border border-dashed border-line rounded-xl p-6 text-center">
          Henüz bağlantı eklemedin.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3">
              <span className="text-lg" aria-hidden>
                {{ github: '🐙', steam: '🎮', spotify: '🎵', youtube: '▶️', twitch: '📺', x: '✖️', reddit: '👽', instagram: '📷', website: '🌐' }[c.type] ?? '🔗'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink-primary truncate flex items-center gap-1.5">
                  {c.name}
                  {c.verified && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-brand-400">
                      <BadgeCheck size={12} /> Doğrulanmış
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-tertiary capitalize">{c.type}</div>
              </div>
              <button
                onClick={() => {
                  api.connections.setVisible(c.id, !c.visible).then(load).catch(() => {});
                }}
                className="w-8 h-8 rounded-lg hover:bg-surface-3 text-ink-tertiary hover:text-ink-primary flex items-center justify-center"
                title={c.visible ? 'Profilde gizle' : 'Profilde göster'}
                aria-label={c.visible ? 'Profilde gizle' : 'Profilde göster'}
              >
                {c.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                onClick={() => {
                  api.connections.remove(c.id).then(load).catch(() => {});
                }}
                className="w-8 h-8 rounded-lg hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center"
                title="Bağlantıyı kaldır" aria-label="Bağlantıyı kaldır"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Geliştirici — bot uygulamaları (Discord "Developer Portal" paritesi, sadeleştirilmiş)
function DeveloperTab() {
  const dispatch = useAppDispatch();
  const guilds = useAppSelector((s) => s.guilds.list);
  const [apps, setApps] = useState<APIApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  // Yeni üretilen token'lar (bir daha gösterilmez — sadece bu oturumda)
  const [freshTokens, setFreshTokens] = useState<Record<string, string>>({});
  const [addingGuildFor, setAddingGuildFor] = useState<string | null>(null);

  const load = () => {
    api.applications
      .list()
      .then(setApps)
      .catch(() => setApps([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const create = () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    api.applications
      .create(name)
      .then((app) => {
        setNewName('');
        if (app.token) setFreshTokens((p) => ({ ...p, [app.id]: app.token! }));
        load();
        dispatch(addToast({ kind: 'success', message: 'Bot uygulaması oluşturuldu — token\'ı kopyalamayı unutma!' }));
      })
      .catch((e: any) => dispatch(addToast({ kind: 'error', message: e?.message || 'Oluşturulamadı' })))
      .finally(() => setBusy(false));
  };

  const resetToken = (id: string) => {
    api.applications
      .resetToken(id)
      .then(({ token }) => {
        setFreshTokens((p) => ({ ...p, [id]: token }));
        dispatch(addToast({ kind: 'success', message: 'Token sıfırlandı — eskisi geçersiz' }));
      })
      .catch(() => dispatch(addToast({ kind: 'error', message: 'Sıfırlanamadı' })));
  };

  const remove = (id: string) => {
    if (!confirm('Bu bot uygulamasını silmek istediğine emin misin? Bot tüm sunuculardan çıkarılır.')) return;
    api.applications
      .remove(id)
      .then(() => {
        setFreshTokens((p) => {
          const n = { ...p };
          delete n[id];
          return n;
        });
        load();
        dispatch(addToast({ kind: 'success', message: 'Uygulama silindi' }));
      })
      .catch(() => dispatch(addToast({ kind: 'error', message: 'Silinemedi' })));
  };

  const addToGuild = (appId: string, guildId: string) => {
    api.applications
      .addToGuild(guildId, appId)
      .then(() => {
        setAddingGuildFor(null);
        dispatch(addToast({ kind: 'success', message: 'Bot sunucuya eklendi' }));
      })
      .catch((e: any) => dispatch(addToast({ kind: 'error', message: e?.message || 'Eklenemedi (Sunucuyu Yönet yetkin var mı?)' })));
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => dispatch(addToast({ kind: 'success', message: 'Kopyalandı' })));
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold text-ink-primary mb-1">Bot Uygulamaları</h2>
      <p className="text-sm text-ink-tertiary mb-4">
        Bot oluştur, token al, sunucuna ekle. Bot REST API'ye{' '}
        <code className="bg-surface-2 px-1 rounded text-xs">Authorization: Bot &lt;token&gt;</code> başlığıyla erişir;
        gateway bağlantısı için <code className="bg-surface-2 px-1 rounded text-xs">POST /api/v1/auth/bot-session</code> ile JWT alır.
      </p>

      <div className="flex gap-2 mb-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder="Uygulama adı (örn. Müzik Botu)"
          maxLength={32}
          className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary outline-none focus:border-brand-500/50"
        />
        <button
          onClick={create}
          disabled={newName.trim().length < 2 || busy}
          className="h-9 px-4 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-semibold flex items-center gap-1.5"
        >
          <Plus size={15} /> Oluştur
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-ink-tertiary">Yükleniyor...</div>
      ) : apps.length === 0 ? (
        <div className="text-sm text-ink-tertiary border border-dashed border-line rounded-xl p-6 text-center">
          Henüz bot uygulaman yok.
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="bg-surface-2 border border-line rounded-xl p-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center shrink-0">
                  <Bot size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink-primary truncate flex items-center gap-1.5">
                    {a.name}
                    <span className="bg-brand-500/15 text-brand-500 text-[9px] font-semibold px-1 rounded">BOT</span>
                  </div>
                  <div className="text-xs text-ink-tertiary truncate">@{a.bot_username}</div>
                </div>
                <button
                  onClick={() => setAddingGuildFor(addingGuildFor === a.id ? null : a.id)}
                  className="h-8 px-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold"
                >
                  Sunucuya Ekle
                </button>
                <button
                  onClick={() => resetToken(a.id)}
                  className="w-8 h-8 rounded-lg hover:bg-surface-3 text-ink-tertiary hover:text-ink-primary flex items-center justify-center"
                  title="Token'ı sıfırla" aria-label="Token'ı sıfırla"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="w-8 h-8 rounded-lg hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center"
                  title="Uygulamayı sil" aria-label="Uygulamayı sil"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              {freshTokens[a.id] && (
                <div className="mt-3 bg-surface-1 border border-brand-500/30 rounded-lg p-2.5">
                  <div className="text-[10px] font-bold uppercase text-brand-400 tracking-wider mb-1">
                    Bot Token — bir daha gösterilmez, şimdi kopyala
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-ink-primary truncate flex-1">{freshTokens[a.id]}</code>
                    <button
                      onClick={() => copy(freshTokens[a.id])}
                      className="w-7 h-7 rounded-md hover:bg-surface-3 text-ink-secondary flex items-center justify-center shrink-0"
                      title="Kopyala" aria-label="Token'ı kopyala"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              )}

              {addingGuildFor === a.id && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="text-xs font-semibold text-ink-tertiary mb-1.5">
                    Hangi sunucuya? (Sunucuyu Yönet yetkisi gerekir)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {guilds.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => addToGuild(a.id, g.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-surface-3 hover:bg-brand-500 hover:text-white text-xs font-medium text-ink-secondary"
                      >
                        {g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
