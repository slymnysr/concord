import { useState } from 'react';
import { httpUrl } from '../../serverConfig';
import { Check } from 'lucide-react';
import { api } from '../../api';
import { useAppDispatch, useAppSelector, fetchMe, addToast } from '../../store';
import { t } from '../../i18n';

export function ProfileTab() {
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
      dispatch(
        addToast({
          kind: 'success',
          message: r.already_verified
            ? t('profile.emailVerified')
            : 'Doğrulama bağlantısı e-postana gönderildi — gelen kutunu kontrol et',
        }),
      );
    } catch {
      dispatch(addToast({ kind: 'error', message: t('profile.verifyMailFailed') }));
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
        body: JSON.stringify({
          display_name: displayName,
          bio,
          pronouns,
          accent_color: accent,
          avatar_decoration: decoration,
        }),
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
      <h2 className="text-2xl font-bold text-ink-primary mb-5">{t('profile.myProfile')}</h2>
      <div className="bg-surface-2 rounded-xl border border-line p-4 space-y-4">
        {/* Profil banner'ı */}
        <label
          className={
            'block w-full h-24 rounded-xl border border-dashed border-line hover:border-brand-500/60 cursor-pointer overflow-hidden relative ' +
            (uploadingBanner ? 'opacity-50' : '')
          }
          style={
            me.banner_url
              ? { background: `url(${me.banner_url}) center/cover` }
              : { backgroundColor: me.avatar_color + '40' }
          }
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
          <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">
            Görünen Ad
          </label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-ink-secondary mb-1">
            Hakkımda
          </label>
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
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              {t('profile.pronouns')}
            </label>
            <input
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value.slice(0, 40))}
              placeholder={t('profile.pronounsPlaceholder')}
              className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink-primary mb-1.5">
              Vurgu Rengi
            </label>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="w-full h-10 bg-surface-1 border border-line rounded-lg cursor-pointer"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-ink-primary mb-1.5">
            Avatar Süslemesi
          </label>
          <div className="flex flex-wrap gap-1.5">
            {['', '👑', '⭐', '🔥', '💎', '🌸', '🎮', '🦊', '🐱', '🍀', '⚡', '🎧'].map((d) => (
              <button
                key={d || 'none'}
                type="button"
                onClick={() => setDecoration(d)}
                className={
                  'w-9 h-9 rounded-lg flex items-center justify-center text-lg border-2 ' +
                  (decoration === d
                    ? 'border-brand-500 bg-brand-500/10'
                    : 'border-line bg-surface-1 hover:border-brand-500/40')
                }
                title={d ? t('profile.decoration') : t('common.none')}
              >
                {d || '∅'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-tertiary mt-1">{t('profile.decorationHint')}</p>
        </div>
        <div className="flex items-center justify-between bg-surface-1 border border-line rounded-lg px-3 py-2">
          <div>
            <div className="text-sm font-semibold text-ink-primary">{t('profile.email')}</div>
            <div className="text-xs text-ink-tertiary">{me.email}</div>
          </div>
          {me.email_verified ? (
            <span className="text-xs font-semibold text-status-online flex items-center gap-1">
              <Check size={14} /> Doğrulandı
            </span>
          ) : (
            <button
              onClick={verifyEmail}
              className="px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-400 text-white text-xs font-semibold"
            >
              Doğrula
            </button>
          )}
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}
