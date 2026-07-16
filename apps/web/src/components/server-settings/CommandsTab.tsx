import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../api';
import { t } from '../../i18n';

export function CommandsTab({ guildId }: { guildId: string }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.commands.list>>>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [response, setResponse] = useState('');
  const [options, setOptions] = useState<
    Array<{ name: string; description: string; required: boolean }>
  >([]);

  async function refresh() {
    setList(await api.commands.list(guildId).catch(() => []));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  async function submit() {
    try {
      const opts = options
        .filter((o) => o.name.trim())
        .map((o) => ({
          name: o.name.trim().toLowerCase(),
          description: o.description.trim(),
          required: o.required,
        }));
      await api.commands.create(guildId, { name, description, response, options: opts });
      setName('');
      setDescription('');
      setResponse('');
      setOptions([]);
      refresh();
    } catch (e) {
      console.warn(e);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-ink-primary mb-4">{t('cmd.title')}</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Bir kanalda <span className="font-mono text-ink-primary">/komut</span> yazıldığında otomatik
        yanıt verir.
      </p>
      <div className="bg-surface-2 border border-line rounded-xl p-4 mb-4 space-y-2">
        <div className="flex gap-2">
          <span className="text-ink-tertiary text-sm py-2">/</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder={t('cmd.namePlaceholder')}
            maxLength={32}
            className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary font-mono focus:border-brand-500/50 focus:outline-none"
          />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('cmd.descPlaceholder')}
          maxLength={100}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none"
        />
        <textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Komut çalışınca kanala yazılacak yanıt. {argüman} ve {user} yer tutucuları desteklenir."
          rows={3}
          className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
        />

        {/* Argümanlar (options) */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-ink-secondary">
              Argümanlar (yanıtta <span className="font-mono">{'{ad}'}</span> ile kullan)
            </span>
            {options.length < 10 && (
              <button
                onClick={() =>
                  setOptions((o) => [...o, { name: '', description: '', required: false }])
                }
                className="text-xs text-brand-500 hover:underline"
              >
                + Argüman
              </button>
            )}
          </div>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5">
              <input
                value={o.name}
                onChange={(e) =>
                  setOptions((arr) =>
                    arr.map((x, j) =>
                      j === i
                        ? { ...x, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }
                        : x,
                    ),
                  )
                }
                placeholder={t('cmd.optName')}
                className="w-28 bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm font-mono text-ink-primary focus:outline-none focus:border-brand-500/50"
              />
              <input
                value={o.description}
                onChange={(e) =>
                  setOptions((arr) =>
                    arr.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)),
                  )
                }
                placeholder={t('cmd.optDesc')}
                className="flex-1 bg-surface-1 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary focus:outline-none focus:border-brand-500/50"
              />
              <label className="flex items-center gap-1 text-[11px] text-ink-tertiary cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={o.required}
                  onChange={(e) =>
                    setOptions((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)),
                    )
                  }
                  className="accent-brand-500"
                />
                zorunlu
              </label>
              <button
                onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))}
                className="text-ink-tertiary hover:text-accent-500 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={submit}
          disabled={!name.trim() || !description.trim() || !response.trim()}
          className="w-full py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          Komutu Ekle
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-ink-tertiary text-sm">{t('cmd.none')}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-brand-500">
                  /{c.name}
                  {(c.options ?? []).map((o) => (
                    <span
                      key={o.name}
                      className={
                        'ml-1 text-[11px] ' +
                        (o.required ? 'text-ink-secondary' : 'text-ink-tertiary')
                      }
                    >
                      {o.required ? `<${o.name}>` : `[${o.name}]`}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-ink-secondary mt-0.5">{c.description}</div>
                <div className="text-xs text-ink-tertiary mt-1 truncate whitespace-pre-wrap">
                  → {c.response}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`/${c.name} komutunu sil?`)) {
                    api.commands.delete(c.id).then(refresh);
                  }
                }}
                className="text-ink-tertiary hover:text-accent-500"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
