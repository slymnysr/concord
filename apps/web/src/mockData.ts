import type { Guild, Channel, Message, User } from './types';

export const currentUser: User = {
  id: 'u_me',
  username: 'slmnys',
  displayName: 'Süleyman',
  avatarColor: '#5865F2',
  status: 'online',
};

export const users: User[] = [
  currentUser,
  {
    id: 'u_1',
    username: 'ayse',
    displayName: 'Ayşe Kaya',
    avatarColor: '#EB459E',
    status: 'online',
  },
  {
    id: 'u_2',
    username: 'mehmet',
    displayName: 'Mehmet Demir',
    avatarColor: '#FEE75C',
    status: 'idle',
  },
  {
    id: 'u_3',
    username: 'zeynep',
    displayName: 'Zeynep Yıldız',
    avatarColor: '#57F287',
    status: 'online',
  },
  { id: 'u_4', username: 'emre', displayName: 'Emre Şahin', avatarColor: '#ED4245', status: 'dnd' },
  {
    id: 'u_5',
    username: 'ceren',
    displayName: 'Ceren Aksoy',
    avatarColor: '#9B59B6',
    status: 'offline',
  },
  {
    id: 'u_6',
    username: 'burak',
    displayName: 'Burak Çelik',
    avatarColor: '#3498DB',
    status: 'online',
  },
  {
    id: 'u_7',
    username: 'elif',
    displayName: 'Elif Arslan',
    avatarColor: '#1ABC9C',
    status: 'online',
  },
  {
    id: 'u_8',
    username: 'kaan',
    displayName: 'Kaan Doğan',
    avatarColor: '#E67E22',
    status: 'idle',
  },
  {
    id: 'u_9',
    username: 'deniz',
    displayName: 'Deniz Yılmaz',
    avatarColor: '#F39C12',
    status: 'offline',
  },
  {
    id: 'u_bot',
    username: 'sidbot',
    displayName: 'SidBot',
    avatarColor: '#95A5A6',
    status: 'online',
    bot: true,
  },
];

export const guilds: Guild[] = [
  {
    id: 'g_yazilim',
    name: 'Yazılım Türkiye',
    iconText: 'YT',
    iconColor: '#5865F2',
    memberCount: 12483,
  },
  {
    id: 'g_oyun',
    name: 'Türk Oyuncuları',
    iconText: 'TO',
    iconColor: '#ED4245',
    memberCount: 8721,
  },
  {
    id: 'g_universite',
    name: 'YTÜ Bilgisayar',
    iconText: 'YB',
    iconColor: '#57F287',
    memberCount: 342,
  },
  {
    id: 'g_muzik',
    name: 'Müzik Sohbet',
    iconText: 'MS',
    iconColor: '#FEE75C',
    memberCount: 1054,
  },
];

export const channels: Record<string, Channel[]> = {
  g_yazilim: [
    {
      id: 'c_yt_kurallar',
      guildId: 'g_yazilim',
      name: 'kurallar',
      type: 'text',
      category: 'BİLGİ',
    },
    {
      id: 'c_yt_duyurular',
      guildId: 'g_yazilim',
      name: 'duyurular',
      type: 'announcement',
      category: 'BİLGİ',
    },
    { id: 'c_yt_genel', guildId: 'g_yazilim', name: 'genel', type: 'text', category: 'SOHBET' },
    { id: 'c_yt_sorular', guildId: 'g_yazilim', name: 'sorular', type: 'text', category: 'SOHBET' },
    {
      id: 'c_yt_kaynaklar',
      guildId: 'g_yazilim',
      name: 'kaynaklar',
      type: 'text',
      category: 'SOHBET',
    },
    {
      id: 'c_yt_is-ilanlari',
      guildId: 'g_yazilim',
      name: 'iş-ilanları',
      type: 'text',
      category: 'SOHBET',
    },
    {
      id: 'c_yt_kahve-molasi',
      guildId: 'g_yazilim',
      name: 'Kahve Molası',
      type: 'voice',
      category: 'SES',
    },
    {
      id: 'c_yt_kod-yazimi',
      guildId: 'g_yazilim',
      name: 'Kod Yazımı',
      type: 'voice',
      category: 'SES',
    },
  ],
  g_oyun: [
    { id: 'c_to_genel', guildId: 'g_oyun', name: 'genel', type: 'text', category: 'SOHBET' },
    {
      id: 'c_to_lol',
      guildId: 'g_oyun',
      name: 'league-of-legends',
      type: 'text',
      category: 'OYUNLAR',
    },
    { id: 'c_to_valorant', guildId: 'g_oyun', name: 'valorant', type: 'text', category: 'OYUNLAR' },
    { id: 'c_to_cs', guildId: 'g_oyun', name: 'counter-strike', type: 'text', category: 'OYUNLAR' },
    { id: 'c_to_lobi1', guildId: 'g_oyun', name: 'Lobi 1', type: 'voice', category: 'SES' },
    { id: 'c_to_lobi2', guildId: 'g_oyun', name: 'Lobi 2', type: 'voice', category: 'SES' },
  ],
  g_universite: [
    {
      id: 'c_yb_duyuru',
      guildId: 'g_universite',
      name: 'bölüm-duyuruları',
      type: 'announcement',
      category: 'BİLGİ',
    },
    { id: 'c_yb_genel', guildId: 'g_universite', name: 'genel', type: 'text', category: 'SOHBET' },
    {
      id: 'c_yb_dersler',
      guildId: 'g_universite',
      name: 'dersler',
      type: 'text',
      category: 'AKADEMİK',
    },
    {
      id: 'c_yb_proje',
      guildId: 'g_universite',
      name: 'bitirme-projesi',
      type: 'text',
      category: 'AKADEMİK',
    },
    {
      id: 'c_yb_lab',
      guildId: 'g_universite',
      name: 'Lab Çalışması',
      type: 'voice',
      category: 'SES',
    },
  ],
  g_muzik: [
    { id: 'c_ms_genel', guildId: 'g_muzik', name: 'genel', type: 'text', category: 'SOHBET' },
    { id: 'c_ms_oneriler', guildId: 'g_muzik', name: 'öneriler', type: 'text', category: 'SOHBET' },
    { id: 'c_ms_dj', guildId: 'g_muzik', name: 'DJ Odası', type: 'voice', category: 'SES' },
  ],
};

const now = Date.now();
const min = 60 * 1000;
const hour = 60 * min;

export const messages: Record<string, Message[]> = {
  c_yt_genel: [
    {
      id: 'm1',
      channelId: 'c_yt_genel',
      authorId: 'u_1',
      content: 'Selam millet, bugün yeni proje başlattım. Discord clone yapıyoruz, Concord adı.',
      ts: now - 4 * hour,
    },
    {
      id: 'm2',
      channelId: 'c_yt_genel',
      authorId: 'u_2',
      content: 'Vay be, hayırlı olsun. Hangi stack ile?',
      ts: now - 4 * hour + 3 * min,
    },
    {
      id: 'm3',
      channelId: 'c_yt_genel',
      authorId: 'u_1',
      content: 'Elixir gateway, Go API, React web. Voice için mediasoup.',
      ts: now - 4 * hour + 5 * min,
    },
    {
      id: 'm4',
      channelId: 'c_yt_genel',
      authorId: 'u_3',
      content: 'Elixir muhteşem bir seçim BTW, Discord da Elixir kullanıyor.',
      ts: now - 4 * hour + 8 * min,
    },
    {
      id: 'm5',
      channelId: 'c_yt_genel',
      authorId: 'u_4',
      content: 'Türkiye için bu büyük ihtiyaç, BTK yasağından beri bekleniyordu.',
      ts: now - 3 * hour,
    },
    {
      id: 'm6',
      channelId: 'c_yt_genel',
      authorId: 'u_6',
      content: 'KVKK uyumu nasıl olacak peki? Türkiye DC kullanacak mısınız?',
      ts: now - 2 * hour,
    },
    {
      id: 'm7',
      channelId: 'c_yt_genel',
      authorId: 'u_1',
      content: 'Evet, prod ortamı Türk Telekom DC üzerinde olacak. Veriler yurt içinde.',
      ts: now - 2 * hour + 4 * min,
    },
    {
      id: 'm8',
      channelId: 'c_yt_genel',
      authorId: 'u_7',
      content: 'Open source olacak mı?',
      ts: now - 1 * hour - 30 * min,
    },
    {
      id: 'm9',
      channelId: 'c_yt_genel',
      authorId: 'u_1',
      content: 'Lisans henüz seçilmedi, muhtemelen AGPL veya kaynak açık + ticari lisans modeli.',
      ts: now - 1 * hour - 25 * min,
    },
    {
      id: 'm10',
      channelId: 'c_yt_genel',
      authorId: 'u_bot',
      content: '🎉 Concord projesine hoş geldiniz! Komutlar için `/yardım` yazın.',
      ts: now - 1 * hour,
    },
    {
      id: 'm11',
      channelId: 'c_yt_genel',
      authorId: 'u_8',
      content: 'Mediasoup ile WebRTC tarafında kaç eşzamanlı kullanıcı hedefliyorsunuz?',
      ts: now - 45 * min,
    },
    {
      id: 'm12',
      channelId: 'c_yt_genel',
      authorId: 'u_1',
      content: 'Tek SFU node başına ~500 stream. Cluster ile lineer ölçeklenir.',
      ts: now - 42 * min,
    },
    {
      id: 'm13',
      channelId: 'c_yt_genel',
      authorId: 'u_3',
      content: 'Mobil tarafta React Native mı, native mi?',
      ts: now - 30 * min,
    },
    {
      id: 'm14',
      channelId: 'c_yt_genel',
      authorId: 'u_1',
      content: 'RN, Discord da bunu kullanıyor. Tek codebase iOS + Android.',
      ts: now - 28 * min,
    },
    {
      id: 'm15',
      channelId: 'c_yt_genel',
      authorId: 'u_7',
      content: 'GitHub linki var mı paylaşabileceğin?',
      ts: now - 10 * min,
    },
  ],
  c_yt_duyurular: [
    {
      id: 'd1',
      channelId: 'c_yt_duyurular',
      authorId: 'u_bot',
      content: '📢 **Concord v0.0.1** — Faz 0 iskeleti tamamlandı. Gateway, API, Web çalışıyor.',
      ts: now - 6 * hour,
    },
    {
      id: 'd2',
      channelId: 'c_yt_duyurular',
      authorId: 'u_1',
      content: 'Bu hafta Faz 1 başlıyor: auth + sunucu/kanal/rol + ilk gerçek mesaj akışı.',
      ts: now - 2 * hour,
    },
  ],
  c_yt_sorular: [
    {
      id: 's1',
      channelId: 'c_yt_sorular',
      authorId: 'u_4',
      content: 'Postgres üzerinde Snowflake ID için en iyi yaklaşım nedir?',
      ts: now - 8 * hour,
    },
    {
      id: 's2',
      channelId: 'c_yt_sorular',
      authorId: 'u_3',
      content: 'PL/pgSQL function + sequence. Discord blog yazısı var, oradan başlayın.',
      ts: now - 7 * hour,
    },
    {
      id: 's3',
      channelId: 'c_yt_sorular',
      authorId: 'u_4',
      content: 'Teşekkürler, deneyeceğim 🙏',
      ts: now - 7 * hour + 2 * min,
    },
  ],
  c_yt_kaynaklar: [
    {
      id: 'k1',
      channelId: 'c_yt_kaynaklar',
      authorId: 'u_6',
      content: 'Discord mühendislik blog: https://discord.com/category/engineering',
      ts: now - 12 * hour,
    },
    {
      id: 'k2',
      channelId: 'c_yt_kaynaklar',
      authorId: 'u_7',
      content: 'Phoenix Channel docs: https://hexdocs.pm/phoenix/channels.html',
      ts: now - 11 * hour,
    },
    {
      id: 'k3',
      channelId: 'c_yt_kaynaklar',
      authorId: 'u_3',
      content: 'mediasoup demo: https://github.com/versatica/mediasoup-demo',
      ts: now - 10 * hour,
    },
  ],
  c_yt_is_ilanlari: [],
  c_to_genel: [
    {
      id: 'to1',
      channelId: 'c_to_genel',
      authorId: 'u_2',
      content: "Bu akşam Valorant lobimiz var, 5'inci kişi arıyoruz.",
      ts: now - 30 * min,
    },
    {
      id: 'to2',
      channelId: 'c_to_genel',
      authorId: 'u_8',
      content: 'Bana yazın, varım 🎮',
      ts: now - 28 * min,
    },
  ],
  c_to_lol: [
    {
      id: 'l1',
      channelId: 'c_to_lol',
      authorId: 'u_4',
      content: 'Yeni meta hakkında ne düşünüyorsunuz?',
      ts: now - 3 * hour,
    },
  ],
  c_yb_genel: [
    {
      id: 'yb1',
      channelId: 'c_yb_genel',
      authorId: 'u_5',
      content: 'Vize haftası başladı arkadaşlar, kolay gelsin.',
      ts: now - 5 * hour,
    },
    {
      id: 'yb2',
      channelId: 'c_yb_genel',
      authorId: 'u_9',
      content: 'Algoritma vizesi hangi gün?',
      ts: now - 4 * hour,
    },
  ],
  c_yb_proje: [
    {
      id: 'p1',
      channelId: 'c_yb_proje',
      authorId: 'u_1',
      content: 'Bitirme projeleri için hocalardan onay alındı mı?',
      ts: now - 2 * day(),
    },
  ],
  c_ms_genel: [
    {
      id: 'mu1',
      channelId: 'c_ms_genel',
      authorId: 'u_3',
      content: 'Yeni Kendrick albümü 🔥',
      ts: now - 2 * hour,
    },
  ],
};

function day() {
  return 24 * 60 * 60 * 1000;
}

export const memberPresence: Record<string, string[]> = {
  g_yazilim: users.map((u) => u.id),
  g_oyun: ['u_me', 'u_2', 'u_4', 'u_8', 'u_bot'],
  g_universite: ['u_me', 'u_5', 'u_9', 'u_3'],
  g_muzik: ['u_me', 'u_3', 'u_7'],
};
