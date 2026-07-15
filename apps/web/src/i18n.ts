// Hafif i18n altyapısı — varsayılan Türkçe, İngilizce opsiyonel.
// Dil değişince sayfa yeniden yüklenir (en basit ve güvenilir yaklaşım).
// Yeni metinleri t('anahtar') ile sarmalayarak kademeli olarak çevirilebilir hale getir.

export type Locale = 'tr' | 'en';

const STORAGE_KEY = 'concord_locale';

export function getLocale(): Locale {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  return v === 'en' ? 'en' : 'tr';
}

export function setLocale(l: Locale) {
  localStorage.setItem(STORAGE_KEY, l);
  // Tüm metinler render anında okunduğu için en güvenli yenileme reload'dur.
  location.reload();
}

type Dict = Record<string, string>;

// Türkçe = referans (anahtar = TR metin değil, semantik anahtar).
const tr: Dict = {
  // Genel
  'common.save': 'Kaydet',
  'common.cancel': 'İptal',
  'common.delete': 'Sil',
  'common.close': 'Kapat',
  'common.add': 'Ekle',
  'common.edit': 'Düzenle',
  'common.saved': 'Kaydedildi',
  'common.loading': 'Yükleniyor…',
  'common.search': 'Ara',
  // Ayarlar sekmeleri
  'settings.profile': 'Profil',
  'settings.account': 'Hesap',
  'settings.status': 'Özel Durum',
  'settings.notifications': 'Bildirimler',
  'settings.voice': 'Ses & Görüntü',
  'settings.appearance': 'Görünüm',
  'settings.keyboard': 'Klavye',
  // Görünüm
  'appearance.title': 'Görünüm',
  'appearance.theme': 'Tema',
  'appearance.theme.dark': 'Koyu',
  'appearance.theme.darkSub': 'Varsayılan Concord',
  'appearance.theme.light': 'Aydınlık',
  'appearance.theme.lightSub': 'Beyaz arayüz',
  'appearance.theme.amoled': 'AMOLED',
  'appearance.theme.amoledSub': 'Tam siyah arka plan',
  'appearance.density': 'Mesaj Yoğunluğu',
  'appearance.language': 'Dil',
  'appearance.language.sub': 'Arayüz dilini seç (değişiklik için sayfa yenilenir).',
  'appearance.zoom': 'Yakınlaştırma Düzeyi',
  // Durum
  'status.online': 'Çevrimiçi',
  'status.idle': 'Uzakta',
  'status.dnd': 'Rahatsız Etmeyin',
  'status.offline': 'Görünmez',
};

const en: Dict = {
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.close': 'Close',
  'common.add': 'Add',
  'common.edit': 'Edit',
  'common.saved': 'Saved',
  'common.loading': 'Loading…',
  'common.search': 'Search',
  'settings.profile': 'Profile',
  'settings.account': 'Account',
  'settings.status': 'Custom Status',
  'settings.notifications': 'Notifications',
  'settings.voice': 'Voice & Video',
  'settings.appearance': 'Appearance',
  'settings.keyboard': 'Keyboard',
  'appearance.title': 'Appearance',
  'appearance.theme': 'Theme',
  'appearance.theme.dark': 'Dark',
  'appearance.theme.darkSub': 'Default Concord',
  'appearance.theme.light': 'Light',
  'appearance.theme.lightSub': 'White interface',
  'appearance.theme.amoled': 'AMOLED',
  'appearance.theme.amoledSub': 'Pure black background',
  'appearance.density': 'Message Density',
  'appearance.language': 'Language',
  'appearance.language.sub': 'Choose the interface language (page reloads to apply).',
  'appearance.zoom': 'Zoom Level',
  'status.online': 'Online',
  'status.idle': 'Idle',
  'status.dnd': 'Do Not Disturb',
  'status.offline': 'Invisible',
};

const dicts: Record<Locale, Dict> = { tr, en };

/**
 * t — anahtarı geçerli dile çevirir. Anahtar yoksa fallback (varsa) ya da anahtarın kendisi döner.
 * Parametre ikamesi: t('x.y', { name: 'Ali' }) → '{name}' yerini doldurur.
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const loc = getLocale();
  let out = dicts[loc]?.[key] ?? dicts.tr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
}

export const LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];
