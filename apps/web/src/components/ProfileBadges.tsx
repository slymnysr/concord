import type { APIPublicUser } from '../api';
import { t } from '../i18n';

// Erken üye eşiği — bu tarihten önce katılanlar "Erken Üye" rozeti alır
const EARLY_BEFORE = new Date('2026-07-01').getTime();

interface Badge {
  emoji: string;
  label: string;
  cls: string;
}

export function ProfileBadges({ user }: { user: APIPublicUser }) {
  const badges: Badge[] = [];
  if (user.bot)
    badges.push({ emoji: '🤖', label: t('badge.bot'), cls: 'bg-brand-500/15 text-brand-500' });
  if (user.email_verified)
    badges.push({
      emoji: '✓',
      label: t('badge.emailVerified'),
      cls: 'bg-emerald-500/15 text-emerald-400',
    });
  if (user.totp_enabled)
    badges.push({
      emoji: '🛡️',
      label: t('badge.twoFactorOn'),
      cls: 'bg-blue-500/15 text-blue-400',
    });
  if (user.created_at && new Date(user.created_at).getTime() < EARLY_BEFORE) {
    badges.push({
      emoji: '🎖️',
      label: t('badge.earlyMember'),
      cls: 'bg-amber-500/15 text-amber-400',
    });
  }
  if (badges.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {badges.map((b) => (
        <span
          key={b.label}
          title={b.label}
          className={
            'inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ' +
            b.cls
          }
        >
          <span>{b.emoji}</span>
          <span className="hidden sm:inline">{b.label}</span>
        </span>
      ))}
    </div>
  );
}
