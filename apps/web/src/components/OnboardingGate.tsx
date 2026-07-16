import { useEffect, useState } from 'react';
import { Hand, Check } from 'lucide-react';
import { useAppSelector } from '../store';
import { api, type APIGuildWelcome } from '../api';
import { t } from '../i18n';

// OnboardingGate — seçili sunucu için karşılama ekranı etkinse ve kuralların
// kabulü zorunluysa, üye kabul edene kadar tam ekran karşılama gösterir.
export function OnboardingGate() {
  const guildId = useAppSelector((s) => s.guilds.selectedId);
  const guildName = useAppSelector(
    (s) => s.guilds.list.find((g) => g.id === s.guilds.selectedId)?.name ?? '',
  );
  const [welcome, setWelcome] = useState<APIGuildWelcome | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleOption(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setWelcome(null);
    if (!guildId) return;
    api.welcome
      .get(guildId)
      .then((w) => {
        if (!cancelled) setWelcome(w);
      })
      .catch(() => {
        if (!cancelled) setWelcome(null);
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  if (!guildId || !welcome) return null;
  const prompts = welcome.onboarding_prompts ?? [];
  if (!welcome.enabled || welcome.accepted) return null;
  if (!welcome.require_accept && prompts.length === 0) return null;

  async function accept() {
    if (!guildId) return;
    setAccepting(true);
    try {
      await api.welcome.acceptOnboarding(guildId, [...selected]);
      setWelcome((w) => (w ? { ...w, accepted: true } : w));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-bg/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-surface-1 border border-line rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-brand-500/10 px-6 py-8 text-center border-b border-line">
          <div className="w-14 h-14 rounded-2xl bg-brand-500 mx-auto flex items-center justify-center mb-3">
            <Hand size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink-primary">{guildName}</h1>
          {welcome.description && (
            <p className="text-sm text-ink-secondary mt-2 whitespace-pre-wrap">
              {welcome.description}
            </p>
          )}
        </div>

        <div className="px-6 py-5 max-h-[50vh] overflow-y-auto space-y-5">
          {welcome.welcome_channels.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-ink-tertiary">
                {t('onboard.getStarted')}
              </h3>
              {welcome.welcome_channels.map((wc, i) => (
                <div key={i} className="bg-surface-2 border border-line rounded-xl px-4 py-3">
                  <div className="text-sm font-semibold text-ink-primary">
                    {wc.emoji ? `${wc.emoji} ` : '#'}
                    {wc.channel_id}
                  </div>
                  {wc.description && (
                    <div className="text-xs text-ink-secondary mt-0.5">{wc.description}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {welcome.rules_text && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-ink-tertiary">
                {t('onboard.rules')}
              </h3>
              <div className="bg-surface-2 border border-line rounded-xl px-4 py-3 text-sm text-ink-secondary whitespace-pre-wrap">
                {welcome.rules_text}
              </div>
            </div>
          )}

          {prompts.map((p) => (
            <div key={p.id} className="space-y-2">
              <h3 className="text-xs font-bold uppercase text-ink-tertiary">{p.title}</h3>
              <div className="grid grid-cols-2 gap-2">
                {p.options.map((o) => {
                  const on = selected.has(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() => toggleOption(o.id)}
                      className={
                        'p-3 rounded-xl border-2 text-left transition-all flex items-center gap-2 ' +
                        (on
                          ? 'border-brand-500 bg-brand-500/10'
                          : 'border-line bg-surface-2 hover:border-brand-500/40')
                      }
                    >
                      {o.emoji && <span className="text-lg shrink-0">{o.emoji}</span>}
                      <span className="text-sm font-medium text-ink-primary flex-1 min-w-0 truncate">
                        {o.label}
                      </span>
                      {on && <Check size={14} className="text-brand-500 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-line">
          <button
            onClick={accept}
            disabled={accepting}
            className="w-full py-2.5 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold flex items-center justify-center gap-2"
          >
            <Check size={16} />
            {accepting
              ? t('common.saving')
              : welcome.require_accept
                ? prompts.length > 0
                  ? t('onboard.acceptRulesContinue')
                  : t('onboard.acceptRules')
                : t('onboard.saveSelection')}
          </button>
        </div>
      </div>
    </div>
  );
}
