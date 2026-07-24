import { useEffect, useState } from 'react';
import { Shield } from 'lucide-react';
import { api, tokenStore } from '../../api';
import { useAppDispatch, useAppSelector, fetchMe, addToast, logout } from '../../store';
import { t, errText, localeTag } from '../../i18n';

export function AccountTab() {
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
      dispatch(
        addToast({
          kind: 'success',
          message: t('account.confirmSent', { email: r.pending_email }),
        }),
      );
      setNewEmail('');
      setEmailPass('');
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: errText(e, t('account.emailChangeFailed')) }));
    } finally {
      setEmailBusy(false);
    }
  }

  async function submit() {
    setErr(null);
    setOk(false);
    if (next !== confirm) {
      setErr(t('account.passwordMismatch'));
      return;
    }
    if (next.length < 8) {
      setErr(t('account.passwordMin'));
      return;
    }
    try {
      await api.changePassword(current, next);
      setOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (e: any) {
      setErr(errText(e, t('common.error')));
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('settings.account')}</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-2 text-sm mb-5">
        <div>
          <span className="text-ink-tertiary">{t('account.username')}</span>
          <span className="text-ink-primary font-mono">@{me.username}</span>
        </div>
        <div>
          <span className="text-ink-tertiary">{t('account.email')}</span>
          <span className="text-ink-primary">{me.email}</span>
        </div>
      </div>

      <h3 className="text-base font-bold text-ink-primary mb-2">{t('account.changeEmail')}</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3 mb-5">
        <p className="text-xs text-ink-tertiary">
          Yeni adrese onay bağlantısı gönderilir; adresin ancak onaylayınca değişir.
        </p>
        <input
          type="email"
          placeholder={t('account.newEmailPlaceholder')}
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder={t('account.currentPasswordSecurity')}
          value={emailPass}
          onChange={(e) => setEmailPass(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <button
          onClick={changeEmail}
          disabled={!newEmail.trim() || !emailPass || emailBusy}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-40 text-white text-sm font-semibold"
        >
          {emailBusy ? t('common.sending') : t('account.sendConfirmLink')}
        </button>
      </div>

      <h3 className="text-base font-bold text-ink-primary mb-2">{t('account.changePassword')}</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-3">
        <input
          type="password"
          placeholder={t('account.currentPassword')}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder={t('account.newPassword')}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <input
          type="password"
          placeholder={t('account.newPasswordRepeat')}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        {err && <p className="text-accent-500 text-sm">{err}</p>}
        {ok && <p className="text-status-online text-sm">{t('ui.parolaBasariylaDegistirildi')}</p>}
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
      setErr(errText(e, 'Başlatılamadı'));
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
      setErr(errText(e, 'Kod hatalı'));
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
      setErr(errText(e, 'Kapatılamadı'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-ink-primary mb-2">{t('ui.ikiAdimliDogrulama2fa')}</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        {me.totp_enabled ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-status-online flex items-center gap-2">
              <Shield size={16} /> 2FA etkin — hesabın korunuyor
            </p>
            <button
              onClick={disable}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-sm font-semibold"
            >
              Devre dışı bırak
            </button>
          </div>
        ) : step === 'idle' ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-secondary">
              Authenticator uygulamasıyla hesabına ekstra bir güvenlik katmanı ekle.
            </p>
            <button
              onClick={startEnable}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-400 text-white text-sm font-semibold shrink-0"
            >
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
              <button
                onClick={verify}
                disabled={busy || code.length !== 6}
                className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold"
              >
                Doğrula ve Etkinleştir
              </button>
              <button
                onClick={() => {
                  setStep('idle');
                  setCode('');
                  setErr(null);
                }}
                className="px-3 py-2 text-ink-tertiary hover:text-ink-primary text-sm"
              >
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
    api.privacy
      .get()
      .then((p) => {
        setAllow(p.allow_dms_from);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function change(v: 'everyone' | 'friends') {
    setAllow(v);
    await api.privacy.set(v).catch(() => {});
  }

  return (
    <div className="mt-6">
      <h3 className="text-base font-bold text-ink-primary mb-2">{t('settings.privacy')}</h3>
      <div className="bg-surface-2 rounded-xl border border-line p-4">
        <h4 className="text-sm font-semibold text-ink-primary mb-1">Bana kimler DM atabilir?</h4>
        <p className="text-xs text-ink-secondary mb-3">
          "Sadece arkadaşlar" seçilirse, arkadaşın olmayanlar seninle DM başlatamaz.
        </p>
        {loading ? (
          <p className="text-xs text-ink-tertiary">{t('ui.yukleniyor')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => change('everyone')}
              className={
                'p-3 rounded-xl border-2 text-left transition-all ' +
                (allow === 'everyone'
                  ? 'border-brand-500 bg-brand-500/5'
                  : 'border-line bg-surface-1 hover:border-brand-500/40')
              }
            >
              <div className="font-semibold text-ink-primary text-sm">{t('privacy.everyone')}</div>
              <div className="text-xs text-ink-tertiary">{t('privacy.mutualGuild')}</div>
            </button>
            <button
              onClick={() => change('friends')}
              className={
                'p-3 rounded-xl border-2 text-left transition-all ' +
                (allow === 'friends'
                  ? 'border-brand-500 bg-brand-500/5'
                  : 'border-line bg-surface-1 hover:border-brand-500/40')
              }
            >
              <div className="font-semibold text-ink-primary text-sm">
                {t('ui.sadeceArkadaslar')}
              </div>
              <div className="text-xs text-ink-tertiary">{t('privacy.friendsOnly')}</div>
            </button>
          </div>
        )}
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
      setErr(errText(e, t('account.deleteFailed')));
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 pt-5 border-t border-accent-500/30">
      <h3 className="text-base font-bold text-accent-500 mb-2">{t('ui.tehlikeliBolge')}</h3>
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
            Bu işlem <span className="font-semibold text-ink-primary">{t('ui.geriAlinamaz')}</span>.
            Profilin anonimleştirilir, tüm oturumların kapatılır ve bir daha giriş yapamazsın.
            Onaylamak için parolanı gir.
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
            <button
              onClick={() => {
                setOpen(false);
                setPassword('');
                setErr(null);
              }}
              className="px-4 py-2 text-ink-secondary hover:text-ink-primary text-sm"
            >
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
  const [sessions, setSessions] = useState<
    Array<{ id: string; user_agent: string; created_at: string; expires_at: string }>
  >([]);
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
  useEffect(() => {
    load();
  }, []);

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
          <button
            onClick={revokeOthers}
            className="px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-primary text-xs font-semibold"
          >
            Diğer tüm oturumları kapat
          </button>
        )}
      </div>
      <div className="bg-surface-2 rounded-xl border border-line divide-y divide-line">
        {loading ? (
          <p className="text-sm text-ink-tertiary p-4">{t('ui.yukleniyor')}</p>
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
                    {isCurrent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 font-bold">
                        BU CİHAZ
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-ink-tertiary">
                    {new Date(s.created_at).toLocaleString(localeTag(), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    tarihinde giriş
                  </div>
                </div>
                {!isCurrent && (
                  <button
                    onClick={() => revoke(s.id)}
                    className="px-2.5 py-1 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary text-xs font-semibold shrink-0"
                  >
                    Kapat
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <p className="text-xs text-ink-tertiary mt-1.5">
        Tanımadığın bir oturum görürsen kapat ve parolanı değiştir.
      </p>
    </div>
  );
}
