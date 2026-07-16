// Concord WebSocket bağlantısı (Phoenix Channels) + presence
import { Socket, Channel, Presence } from 'phoenix';
import { tokenStore } from './api';
import { wsUrl } from './serverConfig';

let socket: Socket | null = null;
const guildChannels = new Map<string, Channel>();
const guildPresences = new Map<string, Presence>();
let userChannel: Channel | null = null;
const guildEventHandlers: Map<string, Map<string, ((ev: any) => void)[]>> = new Map();

export function connectGateway(): Socket | null {
  const token = tokenStore.access();
  if (!token) return null;

  if (socket) return socket;

  // params FONKSİYON olmalı: Phoenix onu closure()'la sarar ve HER yeniden bağlanmada
  // yeniden değerlendirir. Sabit `{ token }` verilirse soket kurulum anındaki token'a
  // KİLİTLENİR; access token TTL'i 15 dk olduğu için ağ kopması/uyku sonrası yeniden
  // bağlanma süresi dolmuş token'la yapılır → gateway 403 → Phoenix aynı ölü token'la
  // sonsuza dek dener → realtime, sayfa yenilenene kadar SESSİZCE ölür.
  socket = new Socket(wsUrl('/socket'), {
    params: () => ({ token: tokenStore.access() }),
    logger: () => {},
  });
  // Bağlantı durumu olaylarını yayınla → ConnectionBanner dinler
  socket.onOpen(() => {
    window.dispatchEvent(new CustomEvent('concord:gw', { detail: 'connected' }));
  });
  socket.onClose(() => {
    window.dispatchEvent(new CustomEvent('concord:gw', { detail: 'disconnected' }));
  });
  socket.onError(() => {
    window.dispatchEvent(new CustomEvent('concord:gw', { detail: 'disconnected' }));
  });
  socket.connect();
  return socket;
}

export function disconnectGateway() {
  for (const ch of guildChannels.values()) ch.leave();
  guildChannels.clear();
  guildPresences.clear();
  socket?.disconnect();
  socket = null;
}

export interface PresenceMeta {
  online_at: number;
  status: string;
  activity?: UserActivity;
}

// Rich presence aktivitesi (Oynuyor/Yayında/Dinliyor/İzliyor)
export interface UserActivity {
  type: 'playing' | 'streaming' | 'listening' | 'watching' | 'custom';
  name: string;
  started_at?: number;
}

// Presence durumu — "offline" = görünmez (presence'a yazılmaz, olaylar alınmaya devam eder)
let presenceStatus: string = 'online';

export function setPresenceStatus(status: 'online' | 'idle' | 'dnd' | 'offline') {
  presenceStatus = status;
  for (const ch of guildChannels.values()) {
    ch.push('status', { status });
  }
}

// Aktif aktivite — localStorage'da kalıcı; yeni guild kanallarına join'de otomatik gönderilir
let currentActivity: UserActivity | null = null;
try {
  const raw = localStorage.getItem('concord_activity');
  if (raw) currentActivity = JSON.parse(raw);
} catch {}

export function getMyActivity(): UserActivity | null {
  return currentActivity;
}

export function setActivity(
  activity: { type: UserActivity['type']; name: string } | null,
  opts: { persist?: boolean } = {},
) {
  const persist = opts.persist !== false;
  currentActivity = activity ? { ...activity, started_at: Date.now() } : null;
  // Otomatik oyun algılama (masaüstü) persist=false ile çağırır: kullanıcının
  // elle ayarladığı aktivite localStorage'da korunur, oyun kapanınca ona dönülür.
  if (persist) {
    try {
      if (currentActivity)
        localStorage.setItem('concord_activity', JSON.stringify(currentActivity));
      else localStorage.removeItem('concord_activity');
    } catch {}
  }
  for (const ch of guildChannels.values()) {
    ch.push('activity', currentActivity ?? {});
  }
}

export function joinGuild(
  guildId: string,
  handlers: {
    onMessage?: (event: any) => void;
    onPresence?: (
      onlineUserIds: Set<string>,
      activities?: Record<string, UserActivity>,
      statuses?: Record<string, string>,
    ) => void;
  } = {},
): Channel | null {
  const s = connectGateway();
  if (!s) return null;
  const existing = guildChannels.get(guildId);
  if (existing) return existing;

  const ch = s.channel(`guild:${guildId}`, { status: presenceStatus });
  if (handlers.onMessage) {
    ch.on('MESSAGE_CREATE', handlers.onMessage);
  }
  // Önceden register edilmiş extra eventleri ekle
  const handlerMap = guildEventHandlers.get(guildId);
  if (handlerMap) {
    for (const [event, fns] of handlerMap.entries()) {
      for (const fn of fns) ch.on(event, fn);
    }
  }

  const presence = new Presence(ch);
  guildPresences.set(guildId, presence);

  function emitPresence() {
    const ids = new Set<string>();
    const activities: Record<string, UserActivity> = {};
    const statuses: Record<string, string> = {};
    presence.list((id, data: any) => {
      ids.add(id);
      const meta = data?.metas?.[0];
      if (meta?.activity?.name) activities[id] = meta.activity;
      if (meta?.status) statuses[id] = meta.status;
      return id;
    });
    handlers.onPresence?.(ids, activities, statuses);
  }

  presence.onSync(emitPresence);

  ch.join().receive('ok', () => {
    if (currentActivity) ch.push('activity', currentActivity);
  });
  guildChannels.set(guildId, ch);
  return ch;
}

export function leaveGuild(guildId: string) {
  const ch = guildChannels.get(guildId);
  if (ch) {
    ch.leave();
    guildChannels.delete(guildId);
    guildPresences.delete(guildId);
  }
}

// Generic guild event subscription
export function onGuildEvent(guildId: string, event: string, handler: (ev: any) => void) {
  let map = guildEventHandlers.get(guildId);
  if (!map) {
    map = new Map();
    guildEventHandlers.set(guildId, map);
  }
  const arr = map.get(event) ?? [];
  arr.push(handler);
  map.set(event, arr);

  const ch = guildChannels.get(guildId);
  if (ch) {
    ch.on(event, handler);
  }

  return () => {
    const m = guildEventHandlers.get(guildId);
    if (!m) return;
    const list = m.get(event) ?? [];
    m.set(
      event,
      list.filter((h) => h !== handler),
    );
  };
}

// Re-bind stored guild event handlers when joining
const origJoinGuild = joinGuild;
void origJoinGuild;

export function joinUser(
  userId: string,
  handlers: {
    onNotification?: (ev: any) => void;
    onDMMessage?: (ev: any) => void;
  } = {},
): Channel | null {
  const s = connectGateway();
  if (!s) return null;
  if (userChannel) return userChannel;

  // Phoenix Channel için user kanalına `dev_${userId}` ile mock token kabul edilmiyor;
  // gerçek JWT token kullanıcının user_id'sini taşıyor zaten.
  const ch = s.channel(`user:${userId}`);
  if (handlers.onNotification) ch.on('NOTIFICATION', handlers.onNotification);
  if (handlers.onDMMessage) ch.on('MESSAGE_CREATE', handlers.onDMMessage);
  ch.join();
  userChannel = ch;
  return ch;
}

export function leaveUser() {
  if (userChannel) {
    userChannel.leave();
    userChannel = null;
  }
}

// Typing — kullanıcı yazarken çağrılır (throttled önerilir)
export function sendTyping(guildId: string, channelId: string) {
  const ch = guildChannels.get(guildId);
  if (ch) ch.push('typing', { channel_id: channelId });
}

// === DM "yazıyor" göstergesi (dm:<channelId> Phoenix kanalı) ===
const dmChannels = new Map<string, Channel>();

export function joinDMChannel(
  channelId: string,
  onTyping?: (userId: string) => void,
): Channel | null {
  const s = connectGateway();
  if (!s) return null;
  const existing = dmChannels.get(channelId);
  if (existing) return existing;
  const ch = s.channel(`dm:${channelId}`);
  if (onTyping) {
    ch.on('TYPING_START', (ev: any) => onTyping(ev.user_id));
  }
  ch.join();
  dmChannels.set(channelId, ch);
  return ch;
}

export function leaveDMChannel(channelId: string) {
  const ch = dmChannels.get(channelId);
  if (ch) {
    ch.leave();
    dmChannels.delete(channelId);
  }
}

export function sendDMTyping(channelId: string) {
  const ch = dmChannels.get(channelId);
  if (ch) ch.push('typing', { channel_id: channelId });
}
