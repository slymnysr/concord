import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { useAppDispatch, useAppSelector, addToast, fetchMembers } from '../store';
import { t } from '../i18n';

export function GuildProfileModal({ guildId, onClose }: { guildId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const me = useAppSelector((s) => s.auth.user);
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === guildId));
  const myMember = useAppSelector((s) =>
    me ? (s.members.byGuild[guildId] ?? []).find((m) => m.user_id === me.id) : undefined,
  );

  const [nickname, setNickname] = useState(myMember?.nickname ?? '');
  const [avatarUrl, setAvatarUrl] = useState(myMember?.guild_avatar_url ?? '');
  const [bio, setBio] = useState(myMember?.guild_bio ?? '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadAvatar(file: File) {
    setUploading(true);
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
      setAvatarUrl(presign.public_url);
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: t('guild.uploadFailed') }));
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api.guilds.setMyProfile(guildId, {
        nickname: nickname.trim(),
        guild_avatar_url: avatarUrl.trim() || null,
        guild_bio: bio.trim() || null,
      });
      await dispatch(fetchMembers(guildId));
      dispatch(addToast({ kind: 'success', message: t('guild.profileUpdated') }));
      onClose();
    } catch (e: any) {
      dispatch(addToast({ kind: 'error', message: e?.detail || e?.message || t('common.saveFailed') }));
    } finally {
      setBusy(false);
    }
  }

  const effectiveColor = me?.avatar_color ?? '#5865F2';
  const initial = (nickname || me?.display_name || '?').slice(0, 1).toUpperCase();

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-surface-1 border border-line rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-lg font-bold text-ink-primary">{t('guild.profile')}</h2>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink-primary"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-ink-tertiary">
            <span className="font-semibold text-ink-secondary">{guild?.name}</span> sunucusuna özel görünümün. Boş bırakılan alanlar genel profilinden alınır.
          </p>

          {/* Avatar önizleme + yükleme */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-xl font-bold shrink-0" style={{ backgroundColor: effectiveColor }}>
              {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initial}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={'px-3 py-1.5 rounded-lg bg-surface-3 hover:bg-surface-2 text-ink-primary text-sm font-semibold cursor-pointer ' + (uploading ? 'opacity-50' : '')}>
                {uploading ? t('common.loading') : t('guild.uploadAvatar')}
                <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
              </label>
              {avatarUrl && (
                <button onClick={() => setAvatarUrl('')} className="text-xs text-accent-500 hover:underline text-left">{t('guild.removeAvatar')}</button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">{t('guild.nickname')}</label>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={32}
              placeholder={me?.display_name ?? t('guild.nicknamePlaceholder')}
              className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-secondary mb-1.5">{t('guild.aboutMe')}</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={190}
              rows={3}
              placeholder={t('guild.aboutPlaceholder')}
              className="w-full bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary resize-none"
            />
            <div className="text-right text-[10px] text-ink-tertiary mt-0.5">{bio.length}/190</div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-line flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-ink-secondary hover:text-ink-primary text-sm">{t('common.cancel')}</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-sm font-semibold">
            {busy ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
}
