import { useEffect, useState } from 'react';
import { Trash2, Plus, ShieldAlert } from 'lucide-react';
import { api, type APIAutomodRule } from '../../api';
import { t, errText } from '../../i18n';

const AUTOMOD_TRIGGERS: {
  value: string;
  label: string;
  desc: string;
  dataKey?: string;
  placeholder?: string;
}[] = [
  {
    value: 'keyword',
    label: t('automod.keyword'),
    desc: t('automod.keywordDesc'),
    dataKey: 'keywords',
    placeholder: 'küfür, spam, reklam (virgülle ayır)',
  },
  {
    value: 'regex',
    label: t('automod.regex'),
    desc: t('automod.regexDesc'),
    dataKey: 'patterns',
    placeholder: '\\b(spam|scam)\\b',
  },
  {
    value: 'link_blacklist',
    label: t('automod.linkBlacklist'),
    desc: t('automod.linkBlacklistDesc'),
    dataKey: 'domains',
    placeholder: 'kotusite.com, virus.net',
  },
  {
    value: 'invite_blacklist',
    label: t('automod.inviteBlock'),
    desc: t('automod.inviteBlockDesc'),
  },
  {
    value: 'mention_spam',
    label: t('automod.mentionSpam'),
    desc: t('automod.mentionSpamDesc'),
    dataKey: 'max_mentions',
    placeholder: t('automod.maxMentions'),
  },
  {
    value: 'message_spam',
    label: t('automod.msgSpam'),
    desc: t('automod.msgSpamDesc'),
    dataKey: 'max_messages',
    placeholder: t('automod.maxMsgs'),
  },
  {
    value: 'caps',
    label: t('automod.caps'),
    desc: t('automod.capsDesc'),
    dataKey: 'threshold',
    placeholder: '70 (% oran)',
  },
];

export function AutomodTab({ guildId }: { guildId: string }) {
  const [rules, setRules] = useState<APIAutomodRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState('keyword');
  const [dataInput, setDataInput] = useState('');
  const [actBlock, setActBlock] = useState(true);
  const [actTimeout, setActTimeout] = useState(false);
  const [timeoutSec, setTimeoutSec] = useState(300);
  const [busy, setBusy] = useState(false);

  const trig = AUTOMOD_TRIGGERS.find((t) => t.value === trigger)!;

  function load() {
    setLoading(true);
    api.guilds
      .automodRules(guildId)
      .then(setRules)
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(load, [guildId]);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      // Trigger tipine göre backend'in beklediği trigger_data şeklini oluştur
      let trigger_data: any = {};
      const num = parseInt(dataInput, 10);
      switch (trigger) {
        case 'mention_spam':
          trigger_data = { max_mentions: num || 5 };
          break;
        case 'caps':
          // UI yüzde alır (ör. 70) → backend 0.0-1.0 oran bekler
          trigger_data = { threshold: (num || 70) / 100, min_length: 10 };
          break;
        case 'message_spam':
          // Varsayılanlar: 5 mesaj / 7 sn, 3 tekrar (backend default'ları)
          trigger_data = num ? { max_messages: num } : {};
          break;
        case 'invite_blacklist':
          trigger_data = {};
          break;
        default:
          // keyword | regex | link_blacklist → dizi
          if (trig.dataKey) {
            trigger_data = {
              [trig.dataKey]: dataInput
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
            };
          }
      }
      const actions: any[] = [];
      if (actBlock) actions.push({ type: 'block' });
      if (actTimeout) actions.push({ type: 'timeout', duration_sec: timeoutSec });
      await api.guilds.createAutomodRule(guildId, {
        name: name.trim(),
        trigger_type: trigger,
        trigger_data,
        actions,
        enabled: true,
      });
      setName('');
      setDataInput('');
      setCreating(false);
      load();
    } catch (e: any) {
      alert(errText(e, t('automod.createFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t('automod.deleteConfirm'))) return;
    await api.guilds.deleteAutomodRule(guildId, id).catch(() => {});
    load();
  }

  async function toggle(id: string, enabled: boolean) {
    // Optimistik
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, enabled } : r)));
    await api.guilds.updateAutomodRule(guildId, id, enabled).catch(() => load());
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xl font-bold text-ink-primary">{t('automod.title')}</h2>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
          >
            <Plus size={15} /> Kural Ekle
          </button>
        )}
      </div>
      <p className="text-sm text-ink-tertiary mb-4">
        Sunucunu zararlı içerikten otomatik koru. Kurallar mesaj gönderilirken çalışır.
      </p>

      {creating && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 mb-5 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('automod.rulePlaceholder')}
            className="w-full bg-surface-1 border border-line focus:border-brand-500/50 focus:outline-none rounded-lg px-3 py-2 text-sm text-ink-primary"
          />
          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">
              Tetikleyici Türü
            </label>
            <select
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value);
                setDataInput('');
              }}
              className="w-full mt-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
            >
              {AUTOMOD_TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-tertiary mt-1">{trig.desc}</p>
          </div>
          {trig.dataKey && (
            <div>
              <label className="text-xs font-semibold uppercase text-ink-tertiary">
                {trig.dataKey === 'threshold' ? t('automod.threshold') : t('automod.filterList')}
              </label>
              {trig.dataKey === 'threshold' ? (
                <input
                  value={dataInput}
                  onChange={(e) => setDataInput(e.target.value)}
                  placeholder={trig.placeholder}
                  className="w-full mt-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary"
                />
              ) : (
                <textarea
                  value={dataInput}
                  onChange={(e) => setDataInput(e.target.value)}
                  placeholder={trig.placeholder}
                  rows={2}
                  className="w-full mt-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-sm text-ink-primary resize-none"
                />
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-semibold uppercase text-ink-tertiary">
              {t('automod.actions')}
            </label>
            <label className="flex items-center gap-2 mt-1.5 text-sm text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={actBlock}
                onChange={(e) => setActBlock(e.target.checked)}
                className="accent-brand-500"
              />
              Mesajı engelle
            </label>
            <label className="flex items-center gap-2 mt-1 text-sm text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={actTimeout}
                onChange={(e) => setActTimeout(e.target.checked)}
                className="accent-brand-500"
              />
              Üyeyi zaman aşımına uğrat
              {actTimeout && (
                <select
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(parseInt(e.target.value, 10))}
                  className="ml-1 bg-surface-1 border border-line rounded px-2 py-0.5 text-xs"
                >
                  <option value={60}>1 dk</option>
                  <option value={300}>5 dk</option>
                  <option value={600}>10 dk</option>
                  <option value={3600}>1 saat</option>
                  <option value={86400}>{t('ui.1Gun')}</option>
                </select>
              )}
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={create}
              disabled={busy || !name.trim()}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
            >
              {busy ? t('common.creating') : t('common.create')}
            </button>
            <button
              onClick={() => setCreating(false)}
              className="text-ink-tertiary hover:text-ink-primary text-sm px-3"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-tertiary">{t('common.loading')}</p>
      ) : rules.length === 0 ? (
        <div className="text-center py-10 text-ink-tertiary">
          <ShieldAlert size={36} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('ui.henuzOtomatikModerasyonKuraliYok')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((r) => {
            const trigDef = AUTOMOD_TRIGGERS.find((x) => x.value === r.trigger_type);
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3"
              >
                <div
                  className={
                    'w-2 h-2 rounded-full ' + (r.enabled ? 'bg-emerald-500' : 'bg-ink-tertiary')
                  }
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink-primary truncate">{r.name}</div>
                  <div className="text-xs text-ink-tertiary truncate">
                    {trigDef?.label ?? r.trigger_type}
                    {(() => {
                      const td = r.trigger_data as any;
                      const list = td?.keywords ?? td?.domains ?? td?.patterns;
                      if (Array.isArray(list) && list.length)
                        return ` · ${list.slice(0, 4).join(', ')}${list.length > 4 ? '…' : ''}`;
                      if (td?.threshold) return t('automod.thresholdSuffix', { n: td.threshold });
                      return '';
                    })()}
                    {r.enabled ? '' : t('automod.disabledSuffix')}
                  </div>
                </div>
                <button
                  onClick={() => toggle(r.id, !r.enabled)}
                  title={r.enabled ? 'Devre dışı bırak' : 'Etkinleştir'}
                  className={
                    'shrink-0 w-9 h-5 rounded-full transition-colors relative ' +
                    (r.enabled ? 'bg-brand-500' : 'bg-surface-3')
                  }
                  role="switch"
                  aria-checked={r.enabled}
                >
                  <span
                    className={
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ' +
                      (r.enabled ? 'left-[18px]' : 'left-0.5')
                    }
                  />
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="text-ink-tertiary hover:text-accent-500"
                  title="Sil"
                  aria-label="Sil"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Takip Edilenler — bu sunucuya duyuru ileten kaynak kanallar (Discord "followed channels" paritesi)
