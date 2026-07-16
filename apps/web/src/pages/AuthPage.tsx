import { useState } from 'react';
import { useAppDispatch, useAppSelector, loginThunk, registerThunk } from '../store';
import { SERVER_BASE, setServerBase } from '../serverConfig';
import { api } from '../api';
import { t } from '../i18n';

type Mode = 'login' | 'register' | 'forgot' | 'reset';

// URL'de ?reset_token= varsa (şifre sıfırlama mailinden gelindi) doğrudan reset formunu aç
function initialResetToken(): string {
  try {
    return new URLSearchParams(location.search).get('reset_token') ?? '';
  } catch {
    return '';
  }
}

export function AuthPage() {
  const dispatch = useAppDispatch();
  const { loading, error } = useAppSelector((s) => s.auth);
  const [resetToken] = useState(initialResetToken);
  const [mode, setMode] = useState<Mode>(resetToken ? 'reset' : 'login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [flowMsg, setFlowMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [flowBusy, setFlowBusy] = useState(false);

  // 2FA gerekli mi? (backend "2fa_required" veya "invalid_2fa" döndürdü)
  const needs2fa = error === '2fa_required' || error === 'invalid_2fa';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFlowMsg(null);
    if (mode === 'login') {
      dispatch(loginThunk({ email, password, totp_code: needs2fa ? totpCode : undefined }));
    } else if (mode === 'register') {
      dispatch(
        registerThunk({
          email,
          password,
          username,
          display_name: displayName || username,
        }),
      );
    } else if (mode === 'forgot') {
      setFlowBusy(true);
      try {
        await api.forgotPassword(email);
        setFlowMsg({ kind: 'ok', text: t('auth.flow.forgotSent') });
      } catch {
        setFlowMsg({ kind: 'err', text: t('auth.flow.requestFailed') });
      } finally {
        setFlowBusy(false);
      }
    } else if (mode === 'reset') {
      if (newPassword !== newPassword2) {
        setFlowMsg({ kind: 'err', text: t('auth.flow.passwordMismatch') });
        return;
      }
      setFlowBusy(true);
      try {
        await api.resetPassword(resetToken, newPassword);
        setFlowMsg({ kind: 'ok', text: t('auth.flow.resetOk') });
        history.replaceState(null, '', location.pathname);
        setMode('login');
      } catch (err: any) {
        setFlowMsg({ kind: 'err', text: err?.message || t('auth.flow.linkInvalid') });
      } finally {
        setFlowBusy(false);
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/brand/logo.svg"
            width={56}
            height={56}
            alt="Concord"
            className="inline-block mb-3"
          />
          <h1 className="text-3xl font-bold tracking-tight">Concord</h1>
          <p className="text-ink-secondary text-sm mt-1">
            {mode === 'login'
              ? t('auth.subtitle.login')
              : mode === 'register'
                ? t('auth.subtitle.register')
                : mode === 'forgot'
                  ? t('auth.subtitle.forgot')
                  : t('auth.subtitle.reset')}
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-surface-1 rounded-2xl border border-line p-6 space-y-4"
        >
          {mode === 'register' && (
            <>
              <Field label={t('auth.username')} hint={t('auth.username.hint')}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.username.placeholder')}
                  required
                  autoComplete="username"
                  className={inputCls}
                />
              </Field>
              <Field label={t('auth.displayName')} hint={t('auth.displayName.hint')}>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('auth.displayName.placeholder')}
                  autoComplete="name"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {mode !== 'reset' && (
            <Field label={t('auth.email')}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('auth.email.placeholder')}
                required
                autoComplete="email"
                className={inputCls}
              />
            </Field>
          )}

          {(mode === 'login' || mode === 'register') && (
            <Field
              label={t('auth.password')}
              hint={mode === 'register' ? t('auth.password.hint.min8') : ''}
            >
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 8 : undefined}
                className={inputCls}
              />
            </Field>
          )}

          {mode === 'login' && (
            <div className="-mt-2 text-right">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot');
                  setFlowMsg(null);
                }}
                className="text-xs text-ink-tertiary hover:text-brand-400"
              >
                {t('auth.forgotLink')}
              </button>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <Field label={t('auth.newPassword')} hint={t('auth.password.hint.min8')}>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </Field>
              <Field label={t('auth.newPassword2')}>
                <input
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {flowMsg && (
            <div
              className={
                'text-sm rounded-lg px-3 py-2 border ' +
                (flowMsg.kind === 'ok'
                  ? 'text-brand-400 bg-brand-500/10 border-brand-500/30'
                  : 'text-accent-500 bg-accent-500/10 border-accent-500/30')
              }
            >
              {flowMsg.text}
            </div>
          )}

          {mode === 'login' && needs2fa && (
            <Field label={t('auth.totp')} hint={t('auth.totp.hint')}>
              <input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoFocus
                className={inputCls + ' tracking-[0.3em] text-center font-mono text-lg'}
              />
            </Field>
          )}

          {error && !needs2fa && (
            <div className="text-sm text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {error === 'invalid_2fa' && (
            <div className="text-sm text-accent-500 bg-accent-500/10 border border-accent-500/30 rounded-lg px-3 py-2">
              {t('auth.error.invalid2fa')}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || flowBusy || (needs2fa && totpCode.length !== 6)}
            className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold transition-colors"
          >
            {loading || flowBusy
              ? t('common.wait')
              : needs2fa
                ? t('auth.submit.verify')
                : mode === 'login'
                  ? t('auth.submit.login')
                  : mode === 'register'
                    ? t('auth.submit.register')
                    : mode === 'forgot'
                      ? t('auth.submit.forgot')
                      : t('auth.submit.reset')}
          </button>

          <div className="text-center text-sm text-ink-secondary pt-2">
            {mode === 'forgot' || mode === 'reset' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setFlowMsg(null);
                }}
                className="text-brand-500 hover:text-brand-400 font-medium"
              >
                {t('auth.backToLogin')}
              </button>
            ) : mode === 'login' ? (
              <>
                {t('auth.noAccount')}{' '}
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="text-brand-500 hover:text-brand-400 font-medium"
                >
                  {t('auth.registerLink')}
                </button>
              </>
            ) : (
              <>
                {t('auth.haveAccount')}{' '}
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-brand-500 hover:text-brand-400 font-medium"
                >
                  {t('auth.loginLink')}
                </button>
              </>
            )}
          </div>
        </form>

        <p className="text-center text-xs text-ink-tertiary mt-6">{t('auth.tagline')}</p>
        <p className="text-center mt-2">
          <button
            type="button"
            onClick={() => {
              const v = prompt(t('auth.serverPrompt'), SERVER_BASE);
              if (v === null) return;
              setServerBase(v);
              location.reload();
            }}
            className="text-[11px] text-ink-tertiary hover:text-ink-secondary underline decoration-dotted"
            title={t('auth.serverTitle')}
          >
            ⚙ {t('auth.serverLabel')}: {SERVER_BASE || t('auth.serverThisSite')}
          </button>
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-ink-primary mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-ink-tertiary mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-ink-primary placeholder:text-ink-tertiary transition-colors';
