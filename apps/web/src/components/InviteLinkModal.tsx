import { useEffect, useState } from 'react';
import { Link as LinkIcon, Copy, Check, Clock, Users, Trash2 } from 'lucide-react';
import { useAppSelector } from '../store';
import { api, type APIInvite } from '../api';
import { t } from '../i18n';

const DURATIONS: { label: string; sec?: number }[] = [
  { label: '30 dakika', sec: 30 * 60 },
  { label: '1 saat', sec: 60 * 60 },
  { label: '6 saat', sec: 6 * 60 * 60 },
  { label: '1 gün', sec: 24 * 60 * 60 },
  { label: '7 gün', sec: 7 * 24 * 60 * 60 },
  { label: t('invite.never'), sec: undefined },
];

const MAX_USES: { label: string; n?: number }[] = [
  { label: 'Sınırsız', n: undefined },
  { label: '1', n: 1 },
  { label: '5', n: 5 },
  { label: '10', n: 10 },
  { label: '25', n: 25 },
  { label: '50', n: 50 },
  { label: '100', n: 100 },
];

export function InviteLinkModal() {
  const guild = useAppSelector((s) => s.guilds.list.find((g) => g.id === s.guilds.selectedId));
  const [invites, setInvites] = useState<APIInvite[]>([]);
  const [duration, setDuration] = useState(DURATIONS[3]);
  const [maxUses, setMaxUses] = useState(MAX_USES[0]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!guild) return;
    const list = await api.guilds.invites(guild.id).catch(() => []);
    setInvites(list);
  }

  useEffect(() => {
    refresh();
  }, [guild?.id]);

  async function create() {
    if (!guild) return;
    setLoading(true);
    setError(null);
    try {
      await api.guilds.createInvite(guild.id, {
        max_uses: maxUses.n,
        expires_in_sec: duration.sec,
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message || t('invite.genFailed'));
    } finally {
      setLoading(false);
    }
  }

  function copy(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  async function remove(code: string) {
    if (!confirm(t('invite.deleteConfirm'))) return;
    await api.invites.delete(code);
    refresh();
  }

  if (!guild) return null;

  return (
    <div className="p-6 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
          <LinkIcon size={20} />
        </div>
        <h2 className="text-xl font-bold text-ink-primary">{t('invite.create')}</h2>
      </div>
      <p className="text-sm text-ink-secondary mb-5">
        <span className="font-semibold text-ink-primary">{guild.name}</span> için yeni davet üret.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Select
          icon={<Clock size={14} />}
          label={t('invite.expiry')}
          value={duration.label}
          options={DURATIONS.map((d) => d.label)}
          onSelect={(label) => setDuration(DURATIONS.find((d) => d.label === label)!)}
        />
        <Select
          icon={<Users size={14} />}
          label={t('invite.maxUses')}
          value={maxUses.label}
          options={MAX_USES.map((m) => m.label)}
          onSelect={(label) => setMaxUses(MAX_USES.find((m) => m.label === label)!)}
        />
      </div>

      <button
        onClick={create}
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:bg-surface-3 disabled:text-ink-tertiary text-white font-semibold transition-colors"
      >
        {loading ? t('common.creating') : t('invite.createNew')}
      </button>
      {error && <p className="text-accent-500 text-sm mt-2">{error}</p>}

      <div className="mt-6">
        <h3 className="text-sm font-bold text-ink-primary uppercase tracking-wider mb-2">
          Aktif Davetler ({invites.length})
        </h3>
        {invites.length === 0 && (
          <p className="text-sm text-ink-tertiary">{t('invite.none')}</p>
        )}
        <ul className="space-y-2">
          {invites.map((inv) => (
            <li
              key={inv.code}
              className="bg-surface-2 border border-line rounded-xl p-3 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-ink-primary tracking-wider">{inv.code}</div>
                <div className="text-xs text-ink-tertiary mt-0.5 flex items-center gap-3">
                  <span>
                    {inv.uses} / {inv.max_uses ?? '∞'} kullanım
                  </span>
                  <span>
                    {inv.expires_at ? `${formatRelative(inv.expires_at)} sonra dolar` : t('invite.unlimited')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => copy(inv.code)}
                className="w-9 h-9 rounded-lg bg-surface-3 hover:bg-brand-500 hover:text-white text-ink-secondary flex items-center justify-center transition-colors"
                title={t('common.copy')} aria-label={t('common.copy')}
              >
                {copied === inv.code ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                onClick={() => remove(inv.code)}
                className="w-9 h-9 rounded-lg bg-surface-3 hover:bg-accent-500 hover:text-white text-ink-secondary flex items-center justify-center transition-colors"
                title={t('common.delete')} aria-label={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Select({
  icon,
  label,
  value,
  options,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: string[];
  onSelect: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-ink-secondary uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink-primary focus:border-brand-500/50 focus:outline-none text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-surface-1">
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatRelative(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'dolmuş';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const d = Math.floor(hr / 24);
  return t('invite.dayCount', { n: d });
}
