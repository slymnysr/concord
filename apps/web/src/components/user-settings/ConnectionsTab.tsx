import { useEffect, useState } from 'react';
import { Eye, EyeOff, Trash2, BadgeCheck } from 'lucide-react';
import { api, type APIConnection } from '../../api';
import { useAppDispatch, addToast } from '../../store';
import { t } from '../../i18n';

export function ConnectionsTab() {
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
        dispatch(addToast({ kind: 'success', message: t('conn.added') }));
      })
      .catch((e: any) => dispatch(addToast({ kind: 'error', message: e?.message || t('common.addFailed') })))
      .finally(() => setBusy(false));
  };

  const connectGitHub = () => {
    api.connections
      .githubAuthorize()
      .then(({ url }) => {
        window.open(url, '_blank', 'width=600,height=720');
        dispatch(
          addToast({
            kind: 'info',
            message: 'GitHub penceresinde onayla; dönünce liste güncellenir',
          }),
        );
      })
      .catch(() =>
        dispatch(
          addToast({
            kind: 'info',
            message: 'GitHub OAuth bu sunucuda yapılandırılmamış — hesabını elle ekleyebilirsin',
          }),
        ),
      );
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-lg font-bold text-ink-primary mb-1">{t('conn.title')}</h2>
      <p className="text-sm text-ink-tertiary mb-4">
        Diğer platform hesaplarını profilinde göster. OAuth ile bağlananlar "doğrulanmış" rozeti
        alır.
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
          aria-label={t('conn.platform')}
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
          placeholder={t('conn.usernamePlaceholder')}
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
        <div className="text-sm text-ink-tertiary">{t('common.loading')}</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-ink-tertiary border border-dashed border-line rounded-xl p-6 text-center">
          Henüz bağlantı eklemedin.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3"
            >
              <span className="text-lg" aria-hidden>
                {{
                  github: '🐙',
                  steam: '🎮',
                  spotify: '🎵',
                  youtube: '▶️',
                  twitch: '📺',
                  x: '✖️',
                  reddit: '👽',
                  instagram: '📷',
                  website: '🌐',
                }[c.type] ?? '🔗'}
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
                  api.connections
                    .setVisible(c.id, !c.visible)
                    .then(load)
                    .catch(() => {});
                }}
                className="w-8 h-8 rounded-lg hover:bg-surface-3 text-ink-tertiary hover:text-ink-primary flex items-center justify-center"
                title={c.visible ? t('conn.hideOnProfile') : t('conn.showOnProfile')}
                aria-label={c.visible ? t('conn.hideOnProfile') : t('conn.showOnProfile')}
              >
                {c.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <button
                onClick={() => {
                  api.connections
                    .remove(c.id)
                    .then(load)
                    .catch(() => {});
                }}
                className="w-8 h-8 rounded-lg hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center"
                title={t('conn.remove')}
                aria-label={t('conn.remove')}
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
