// Phoenix WS — gerçek zamanlı olaylar. Topic başına ÇOK dinleyici (Home + Chat aynı anda).
// join* fonksiyonları bir abonelik-iptal (unsubscribe) döndürür; ekran unmount'ta çağrılır.
import { Socket, Channel } from 'phoenix';
import { gatewayUrl } from './config';
import { getAccessToken } from './api';

type Handler = (event: string, payload: any) => void;

let socket: Socket | null = null;
const guildChannels = new Map<string, Channel>();
let userChannel: Channel | null = null;
const listeners = new Map<string, Set<Handler>>();

export type ConnState = 'connected' | 'connecting' | 'disconnected';
const connListeners = new Set<(s: ConnState) => void>();
export function onConnection(cb: (s: ConnState) => void) { connListeners.add(cb); return () => { connListeners.delete(cb); }; }
function emitConn(s: ConnState) { for (const cb of connListeners) cb(s); }

export function connectGateway(): Socket | null {
  const token = getAccessToken();
  if (!token) return null;
  if (socket) return socket;
  socket = new Socket(gatewayUrl(), { params: { token } });
  socket.onOpen(() => emitConn('connected'));
  socket.onError(() => emitConn('disconnected'));
  socket.onClose(() => emitConn('disconnected'));
  emitConn('connecting');
  socket.connect();
  return socket;
}

export function disconnectGateway() {
  for (const ch of guildChannels.values()) ch.leave();
  guildChannels.clear();
  userChannel?.leave();
  userChannel = null;
  listeners.clear();
  socket?.disconnect();
  socket = null;
}

function addListener(topic: string, h: Handler): () => void {
  let set = listeners.get(topic);
  if (!set) { set = new Set(); listeners.set(topic, set); }
  set.add(h);
  return () => { set?.delete(h); };
}
function fanout(topic: string, ev: string, payload: any) {
  for (const h of listeners.get(topic) ?? []) h(ev, payload);
}

const GUILD_EVENTS = [
  'MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'TYPING_START',
  'REACTION_ADD', 'REACTION_REMOVE', 'CHANNEL_CREATE', 'CHANNEL_UPDATE',
  'CHANNEL_DELETE', 'PRESENCE_UPDATE',
];
const USER_EVENTS = [
  'MESSAGE_CREATE', 'MESSAGE_UPDATE', 'MESSAGE_DELETE', 'NOTIFICATION',
  'CHANNEL_CREATE', 'CHANNEL_UPDATE', 'TYPING_START', 'REACTION_ADD', 'REACTION_REMOVE',
];

export function joinGuild(guildId: string, onEvent: Handler): () => void {
  const s = connectGateway();
  if (!s) return () => {};
  const topic = `guild:${guildId}`;
  const off = addListener(topic, onEvent);
  if (!guildChannels.has(guildId)) {
    const ch = s.channel(topic, {});
    for (const ev of GUILD_EVENTS) ch.on(ev, (p: any) => fanout(topic, ev, p));
    ch.join();
    guildChannels.set(guildId, ch);
  }
  return off;
}

export function leaveGuild(guildId: string) {
  guildChannels.get(guildId)?.leave();
  guildChannels.delete(guildId);
  listeners.delete(`guild:${guildId}`);
}

export function sendTyping(guildId: string, channelId: string) {
  guildChannels.get(guildId)?.push('typing', { channel_id: channelId });
}

export function joinUser(userId: string, onEvent: Handler): () => void {
  const s = connectGateway();
  if (!s) return () => {};
  const topic = `user:${userId}`;
  const off = addListener(topic, onEvent);
  if (!userChannel) {
    const ch = s.channel(topic, {});
    for (const ev of USER_EVENTS) ch.on(ev, (p: any) => fanout(topic, ev, p));
    ch.join();
    userChannel = ch;
  }
  return off;
}

export function leaveUser() {
  userChannel?.leave();
  userChannel = null;
}
