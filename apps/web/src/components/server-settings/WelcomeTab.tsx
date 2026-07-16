import { useEffect, useState } from 'react';
import { Trash2, Plus, Check, X } from 'lucide-react';
import { t } from '../../i18n';
import {
  api,
  type APIRole,
  type APIChannel,
  type APIGuildWelcome,
  type APIOnboardingPrompt,
  type APIOnboardingOption,
} from '../../api';

export function WelcomeTab({ guildId }: { guildId: string }) {
  const [w, setW] = useState<APIGuildWelcome | null>(null);
  const [channels, setChannels] = useState<APIChannel[]>([]);
  const [roles, setRoles] = useState<APIRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function refresh() {
    const [data, c, r] = await Promise.all([
      api.welcome.get(guildId).catch(() => null),
      api.guilds.channels(guildId).catch(() => []),
      api.guilds.roles(guildId).catch(() => [] as APIRole[]),
    ]);
    setW(data);
    setChannels(c.filter((ch) => ch.type !== 'voice'));
    setRoles(r.filter((x) => !x.is_everyone));
  }
  useEffect(() => {
    refresh();
  }, [guildId]);

  if (!w) return <p className="text-ink-tertiary text-sm">{t('common.loading')}</p>;

  function patch(p: Partial<APIGuildWelcome>) {
    setW((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  function addChannel() {
    patch({
      welcome_channels: [
        ...w!.welcome_channels,
        { channel_id: channels[0]?.id ?? '', description: '' },
      ],
    });
  }
  function updateChannel(i: number, p: Partial<{ channel_id: string; description: string }>) {
    const next = w!.welcome_channels.map((wc, idx) => (idx === i ? { ...wc, ...p } : wc));
    patch({ welcome_channels: next });
  }
  function removeChannel(i: number) {
    patch({ welcome_channels: w!.welcome_channels.filter((_, idx) => idx !== i) });
  }

  // Onboarding prompt yönetimi
  const prompts = w.onboarding_prompts ?? [];
  const rid = () => Math.random().toString(36).slice(2, 9);
  function addPrompt() {
    patch({ onboarding_prompts: [...prompts, { id: rid(), title: t('welcome.newQuestion'), options: [] }] });
  }
  function updatePrompt(i: number, p: Partial<APIOnboardingPrompt>) {
    patch({ onboarding_prompts: prompts.map((x, idx) => (idx === i ? { ...x, ...p } : x)) });
  }
  function removePrompt(i: number) {
    patch({ onboarding_prompts: prompts.filter((_, idx) => idx !== i) });
  }
  function addOption(pi: number) {
    const next = prompts.map((p, idx) =>
      idx === pi
        ? {
            ...p,
            options: [...p.options, { id: rid(), label: t('welcome.option'), emoji: '', role_ids: [] }],
          }
        : p,
    );
    patch({ onboarding_prompts: next });
  }
  function updateOption(pi: number, oi: number, p: Partial<APIOnboardingOption>) {
    const next = prompts.map((pr, idx) =>
      idx === pi
        ? { ...pr, options: pr.options.map((o, j) => (j === oi ? { ...o, ...p } : o)) }
        : pr,
    );
    patch({ onboarding_prompts: next });
  }
  function removeOption(pi: number, oi: number) {
    const next = prompts.map((pr, idx) =>
      idx === pi ? { ...pr, options: pr.options.filter((_, j) => j !== oi) } : pr,
    );
    patch({ onboarding_prompts: next });
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api.welcome.update(guildId, {
        enabled: w!.enabled,
        description: w!.description,
        welcome_channels: w!.welcome_channels.filter((wc) => wc.channel_id),
        rules_text: w!.rules_text,
        require_accept: w!.require_accept,
        onboarding_prompts: prompts,
      });
      setW(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-ink-primary mb-1">{t('welcome.title')}</h2>
      <p className="text-sm text-ink-secondary mb-4">
        Yeni üyeler sunucuya katıldığında gösterilecek karşılama ekranını ayarla.
      </p>

      <label className="flex items-center gap-3 bg-surface-2 border border-line rounded-xl px-4 py-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={w.enabled}
          onChange={(e) => patch({ enabled: e.target.checked })}
          className="w-4 h-4 accent-brand-500"
        />
        <div>
          <div className="text-sm font-semibold text-ink-primary">{t('welcome.enabled')}</div>
          <div className="text-xs text-ink-tertiary">
            Kapalıysa yeni üyelere hiçbir şey gösterilmez.
          </div>
        </div>
      </label>

      <div
        className="space-y-4 opacity-100"
        style={{ opacity: w.enabled ? 1 : 0.5, pointerEvents: w.enabled ? 'auto' : 'none' }}
      >
        <div>
          <label className="block text-xs font-semibold text-ink-tertiary mb-1">{t('welcome.description')}</label>
          <textarea
            value={w.description}
            onChange={(e) => patch({ description: e.target.value })}
            rows={2}
            placeholder={t('welcome.descPlaceholder')}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-ink-tertiary">{t('welcome.featuredChannels')}</label>
            <button
              onClick={addChannel}
              className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              <Plus size={12} /> Kanal ekle
            </button>
          </div>
          <div className="space-y-2">
            {w.welcome_channels.length === 0 && (
              <p className="text-xs text-ink-tertiary">{t('welcome.noFeatured')}</p>
            )}
            {w.welcome_channels.map((wc, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={wc.channel_id}
                  onChange={(e) => updateChannel(i, { channel_id: e.target.value })}
                  className="bg-surface-1 border border-line rounded-lg px-2 py-2 text-ink-primary text-sm focus:border-brand-500/50 focus:outline-none"
                >
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      #{c.name}
                    </option>
                  ))}
                </select>
                <input
                  value={wc.description ?? ''}
                  onChange={(e) => updateChannel(i, { description: e.target.value })}
                  placeholder={t('welcome.channelDescPlaceholder')}
                  className="flex-1 bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary text-sm focus:border-brand-500/50 focus:outline-none"
                />
                <button
                  onClick={() => removeChannel(i)}
                  className="text-ink-tertiary hover:text-accent-500"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-ink-tertiary mb-1">
            Kurallar metni
          </label>
          <textarea
            value={w.rules_text}
            onChange={(e) => patch({ rules_text: e.target.value })}
            rows={4}
            placeholder={t('welcome.rulesPlaceholder')}
            className="w-full bg-surface-1 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none resize-none"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={w.require_accept}
            onChange={(e) => patch({ require_accept: e.target.checked })}
            className="w-4 h-4 accent-brand-500"
          />
          <div>
            <div className="text-sm font-semibold text-ink-primary">{t('welcome.rulesRequired')}</div>
            <div className="text-xs text-ink-tertiary">
              Üye kabul edene kadar karşılama ekranı tam ekran gösterilir.
            </div>
          </div>
        </label>
      </div>

      {/* Onboarding soruları (ilgi → rol) */}
      <div className="bg-surface-2 rounded-xl border border-line p-4 mt-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-ink-primary">{t('welcome.onboardingQuestions')}</h3>
          <button onClick={addPrompt} className="text-xs text-brand-500 hover:underline">
            + Soru ekle
          </button>
        </div>
        <p className="text-xs text-ink-secondary mb-3">
          Yeni üyeye ilgi alanlarını sor; seçtiği seçeneğe bağlı roller otomatik atanır.
        </p>
        <div className="space-y-3">
          {prompts.length === 0 && <p className="text-xs text-ink-tertiary">{t('welcome.noQuestions')}</p>}
          {prompts.map((p, pi) => (
            <div key={p.id} className="bg-surface-1 border border-line rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <input
                  value={p.title}
                  onChange={(e) => updatePrompt(pi, { title: e.target.value })}
                  placeholder={t('welcome.questionPlaceholder')}
                  className="flex-1 bg-surface-2 border border-line rounded-lg px-2 py-1.5 text-sm text-ink-primary focus:outline-none focus:border-brand-500/50"
                />
                <button
                  onClick={() => removePrompt(pi)}
                  className="text-ink-tertiary hover:text-accent-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-1.5 pl-2">
                {p.options.map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <input
                      value={o.emoji ?? ''}
                      onChange={(e) => updateOption(pi, oi, { emoji: e.target.value.slice(0, 4) })}
                      placeholder="🎮"
                      className="w-10 text-center bg-surface-2 border border-line rounded-lg px-1 py-1 text-sm"
                    />
                    <input
                      value={o.label}
                      onChange={(e) => updateOption(pi, oi, { label: e.target.value })}
                      placeholder={t('welcome.optionPlaceholder')}
                      className="flex-1 bg-surface-2 border border-line rounded-lg px-2 py-1 text-sm text-ink-primary focus:outline-none focus:border-brand-500/50"
                    />
                    <select
                      value={o.role_ids[0] ?? ''}
                      onChange={(e) =>
                        updateOption(pi, oi, { role_ids: e.target.value ? [e.target.value] : [] })
                      }
                      className="bg-surface-2 border border-line rounded-lg px-2 py-1 text-sm text-ink-primary max-w-[120px]"
                    >
                      <option value="">{t('welcome.noRole')}</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeOption(pi, oi)}
                      className="text-ink-tertiary hover:text-accent-500 shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => addOption(pi)}
                  className="text-xs text-brand-500 hover:underline"
                >
                  + Seçenek
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 text-white font-semibold"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400 flex items-center gap-1">
            <Check size={14} /> Kaydedildi
          </span>
        )}
      </div>
    </div>
  );
}
