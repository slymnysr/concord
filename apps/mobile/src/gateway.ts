// Phoenix WS — gerçek zamanlı mesajlar (web gateway.ts'in mobil uyarlaması).
// Handler haritası: aynı topic'e (guild:<id> / user:<id>) tekrar katılırken
// EN GÜNCEL callback'i kullanır — böylece kanal/DM değiştirince eski closure'a
// takılıp canlı mesaj kaçırma bug'ı oluşmaz.
import { Socket, Channel } from 'phoenix';
import { gatewayUrl } from './config';
import { getAccessToken } from './api';

type Handler = (event: string, payload: any) => void;

let socket: Socket | null = null;
const guildChannels = new Map<string, Channel>();
const handlers = new Map<string, Handler>(); // topic -> en güncel handler

export function connectGateway(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;
  if (socket) return socket;
  socket = new Socket(gatewayUrl(), { params: { token } });
  socket.connect();
  return socket;
}

export function disconnectGateway() {
  for (const ch of guildChannels.values()) ch.leave();
  guildChannels.clear();
  userChannel?.leave();
  userChannel = null;
  handlers.clear();
  socket?.disconnect();
  socket = null;
}

const GUILD_EVENTS = [
  'MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'TYPING_START',
  'REACTION_ADD', 'REACTION_REMOVE', 'CHANNEL_CREATE', 'CHANNEL_UPDATE',
  'CHANNEL_DELETE', 'PRESENCE_UPDATE',
];

export function joinGuild(guildId: string, onEvent: Handler): Channel | null {
  const s = connectGateway();
  if (!s) return null;
  const topic = `guild:${guildId}`;
  handlers.set(topic, onEvent); // her çağrıda güncelle
  const existing = guildChannels.get(guildId);
  if (existing) return existing;
  const ch = s.channel(topic, {});
  for (const ev of GUILD_EVENTS) ch.on(ev, (payload: any) => handlers.get(topic)?.(ev, payload));
  ch.join();
  guildChannels.set(guildId, ch);
  return ch;
}

export function leaveGuild(guildId: string) {
  guildChannels.get(guildId)?.leave();
  guildChannels.delete(guildId);
  handlers.delete(`guild:${guildId}`);
}

export function sendTyping(guildId: string, channelId: string) {
  guildChannels.get(guildId)?.push('typing', { channel_id: channelId });
}

// Kişisel kanal — DM mesajları + bildirimler buradan düşer (user:<id>)
let userChannel: Channel | null = null;

const USER_EVENTS = [
  'MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'NOTIFICATION',
  'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'TYPING_START', 'REACTION_ADD', 'REACTION_REMOVE',
];

export function joinUser(userId: string, onEvent: Handler): Channel | null {
  const s = connectGateway();
  if (!s) return null;
  const topic = `user:${userId}`;
  handlers.set(topic, onEvent); // her çağrıda güncelle (DM değişince eski closure'a takılma)
  if (userChannel) return userChannel;
  const ch = s.channel(topic, {});
  for (const ev of USER_EVENTS) ch.on(ev, (payload: any) => handlers.get(topic)?.(ev, payload));
  ch.join();
  userChannel = ch;
  return ch;
}

export function leaveUser() {
  userChannel?.leave();
  userChannel = null;
}
