import { BadgeCheck } from 'lucide-react';
import type { APIConnection } from '../api';
import { t } from '../i18n';

// Platform görselleri — marka ikonu kullanmıyoruz (görsel kopya yasak), emoji + etiket yeterli
export const CONN_META: Record<string, { icon: string; label: string }> = {
  github: { icon: '🐙', label: 'GitHub' },
  steam: { icon: '🎮', label: 'Steam' },
  spotify: { icon: '🎵', label: 'Spotify' },
  youtube: { icon: '▶️', label: 'YouTube' },
  twitch: { icon: '📺', label: 'Twitch' },
  x: { icon: '✖️', label: 'X' },
  reddit: { icon: '👽', label: 'Reddit' },
  instagram: { icon: '📷', label: 'Instagram' },
  website: { icon: '🌐', label: t('conn.website') },
  custom: { icon: '🔗', label: t('conn.other') },
};

export function connMeta(type: string) {
  return CONN_META[type] ?? CONN_META.custom;
}

// Profil panellerinde görünen bağlantı çipleri
export function ConnectionChips({ connections }: { connections?: APIConnection[] }) {
  if (!connections || connections.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-ink-tertiary mb-1.5">
        {t('conn.sectionTitle')}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {connections.map((c) => {
          const meta = connMeta(c.type);
          return (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 bg-surface-2 border border-line rounded-lg px-2 py-1 text-xs text-ink-secondary"
              title={`${meta.label}: ${c.name}${c.verified ? ` (${t('conn.verified')})` : ''}`}
            >
              <span aria-hidden>{meta.icon}</span>
              <span className="font-medium text-ink-primary">{c.name}</span>
              {c.verified && (
                <BadgeCheck
                  size={12}
                  className="text-brand-400"
                  aria-label={t('conn.verifiedLabel')}
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
