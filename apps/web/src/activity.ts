import { t } from './i18n';
// Rich presence aktivite yardımcıları (üye listesi + profil kartı ortak)
export interface Activity {
  type: string;
  name: string;
  started_at?: number;
}

export function activityLabel(a: Activity): string {
  switch (a.type) {
    case 'listening':
      return `🎵 ${a.name} dinliyor`;
    case 'watching':
      return `📺 ${a.name} izliyor`;
    case 'streaming':
      return `🔴 ${a.name} yayınlıyor`;
    case 'custom':
      return a.name;
    default:
      return `🎮 ${a.name} oynuyor`;
  }
}

export function activityVerb(type: string): string {
  switch (type) {
    case 'listening':
      return 'Dinliyor';
    case 'watching':
      return 'İzliyor';
    case 'streaming':
      return 'Yayında';
    case 'custom':
      return 'Aktivite';
    default:
      return 'Oynuyor';
  }
}

export function activityElapsed(startedAt?: number): string {
  if (!startedAt) return '';
  const mins = Math.max(0, Math.floor((Date.now() - startedAt) / 60000));
  if (mins < 1) return t('activity.justStarted');
  if (mins < 60) return `${mins} dakikadır`;
  const h = Math.floor(mins / 60);
  return `${h} saat ${mins % 60} dakikadır`;
}
