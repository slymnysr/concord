import { useState } from 'react';
import { Compass } from 'lucide-react';
import { useAppDispatch, acceptInviteThunk, closeModal, selectGuild } from '../store';
import { api, type APIInvitePreview } from '../api';
import { t } from '../i18n';

export function JoinGuildModal() {
  const dispatch = useAppDispatch();
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<APIInvitePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Davet bağlantısı da yapıştırılırsa kodu çıkar
  function normalize(input: string) {
    const m = input.trim().match(/(?:concord\.com\/(?:invite|davet)\/)?([a-z0-9]{4,16})/i);
    return m ? m[1] : input.trim();
  }

  async function lookup() {
    const c = normalize(code);
    if (!c) return;
    setLoading(true);
    setError(null);
    try {
      const p = await api.invites.preview(c);
      setPreview(p);
    } catch (e: any) {
      setPreview(null);
      setError(e?.message || t('invite.notFound'));
    } finally {
      setLoading(false);
    }
  }

  async function accept() {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const guild = await dispatch(acceptInviteThunk(preview.code)).unwrap();
      dispatch(selectGuild(guild.id));
      dispatch(closeModal());
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || t('invite.joinFailed2'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
          <Compass size={20} />
        </div>
        <h2 className="text-xl font-bold text-ink-primary">{t('invite.joinGuild')}</h2>
      </div>
      <p className="text-sm text-ink-secondary mb-5">
        Arkadaşından aldığın davet kodunu veya bağlantısını gir.
      </p>

      <label className="block text-sm font-semibold text-ink-primary mb-1.5">Davet kodu</label>
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder={t('invite.codePlaceholder')}
          className="flex-1 bg-surface-2 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2.5 text-ink-primary placeholder:text-ink-tertiary font-mono"
        />
        <button
          onClick={lookup}
          disabled={!code.trim() || loading}
          className="px-4 rounded-lg bg-surface-2 hover:bg-surface-3 disabled:opacity-50 text-ink-primary border border-line"
        >
          Bul
        </button>
      </div>
      {error && <p className="text-accent-500 text-sm mt-2">{error}</p>}

      {preview && (
        <div className="mt-5 p-4 bg-surface-2 border border-line rounded-xl">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: preview.guild.icon_color }}
            >
              {preview.guild.icon_text}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-ink-primary truncate">{preview.guild.name}</div>
              <div className="text-xs text-ink-tertiary">
                {preview.member_count} üye · davet eden: {preview.inviter.display_name}
              </div>
            </div>
          </div>
          <button
            onClick={accept}
            disabled={loading}
            className="w-full mt-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold transition-colors"
          >
            {loading ? t('common.joiningShort') : t('common.join')}
          </button>
        </div>
      )}
    </div>
  );
}
