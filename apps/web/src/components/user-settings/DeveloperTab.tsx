import { useEffect, useState } from 'react';
import { Trash2, Bot, Copy, RefreshCw, Plus } from 'lucide-react';
import { api, type APIApplication } from '../../api';
import { useAppDispatch, useAppSelector, addToast } from '../../store';
import { t, errText } from '../../i18n';

export function DeveloperTab() {
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
        dispatch(
          addToast({
            kind: 'success',
            message: "Bot uygulaması oluşturuldu — token'ı kopyalamayı unutma!",
          }),
        );
      })
      .catch((e: any) =>
        dispatch(addToast({ kind: 'error', message: errText(e, t('common.createFailed')) })),
      )
      .finally(() => setBusy(false));
  };

  const resetToken = (id: string) => {
    api.applications
      .resetToken(id)
      .then(({ token }) => {
        setFreshTokens((p) => ({ ...p, [id]: token }));
        dispatch(addToast({ kind: 'success', message: t('dev.tokenReset') }));
      })
      .catch(() => dispatch(addToast({ kind: 'error', message: t('dev.resetFailed') })));
  };

  const remove = (id: string) => {
    if (
      !confirm('Bu bot uygulamasını silmek istediğine emin misin? Bot tüm sunuculardan çıkarılır.')
    )
      return;
    api.applications
      .remove(id)
      .then(() => {
        setFreshTokens((p) => {
          const n = { ...p };
          delete n[id];
          return n;
        });
        load();
        dispatch(addToast({ kind: 'success', message: t('dev.appDeleted') }));
      })
      .catch(() => dispatch(addToast({ kind: 'error', message: t('common.deleteFailed') })));
  };

  const addToGuild = (appId: string, guildId: string) => {
    api.applications
      .addToGuild(guildId, appId)
      .then(() => {
        setAddingGuildFor(null);
        dispatch(addToast({ kind: 'success', message: t('dev.botAdded') }));
      })
      .catch((e: any) =>
        dispatch(
          addToast({
            kind: 'error',
            message: errText(e, t('dev.addFailed')),
          }),
        ),
      );
  };

  const copy = (text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => dispatch(addToast({ kind: 'success', message: t('common.copied') })));
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-bold text-ink-primary mb-1">{t('dev.botApps')}</h2>
      <p className="text-sm text-ink-tertiary mb-4">
        Bot oluştur, token al, sunucuna ekle. Bot REST API'ye{' '}
        <code className="bg-surface-2 px-1 rounded text-xs">Authorization: Bot &lt;token&gt;</code>{' '}
        başlığıyla erişir; gateway bağlantısı için{' '}
        <code className="bg-surface-2 px-1 rounded text-xs">POST /api/v1/auth/bot-session</code> ile
        JWT alır.
      </p>

      <div className="flex gap-2 mb-5">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder={t('dev.appNamePlaceholder')}
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
        <div className="text-sm text-ink-tertiary">{t('common.loading')}</div>
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
                    <span className="bg-brand-500/15 text-brand-500 text-[9px] font-semibold px-1 rounded">
                      BOT
                    </span>
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
                  title={t('dev.resetToken')}
                  aria-label={t('dev.resetToken')}
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="w-8 h-8 rounded-lg hover:bg-accent-500/15 text-ink-tertiary hover:text-accent-500 flex items-center justify-center"
                  title={t('dev.deleteApp')}
                  aria-label={t('dev.deleteApp')}
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
                    <code className="text-xs text-ink-primary truncate flex-1">
                      {freshTokens[a.id]}
                    </code>
                    <button
                      onClick={() => copy(freshTokens[a.id])}
                      className="w-7 h-7 rounded-md hover:bg-surface-3 text-ink-secondary flex items-center justify-center shrink-0"
                      title={t('common.copy')}
                      aria-label={t('dev.copyToken')}
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
