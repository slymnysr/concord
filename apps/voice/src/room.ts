// Bir sesli kanal = bir Room
// Peer = kullanıcı bağlantısı, transport'lar, producer'lar, consumer'lar
import type { types as msTypes } from 'mediasoup';
import { getRouter, createWebRtcTransport } from './mediasoup.js';
import pino from 'pino';

const log = pino({ name: 'voice/room', level: 'info' });

export interface Peer {
  id: string; // user_id (snowflake string)
  name?: string; // görünen ad — presence'ta doğrudan gösterim için
  socketId: string; // websocket bağlantısı kimliği
  sendTransport?: msTypes.WebRtcTransport;
  recvTransport?: msTypes.WebRtcTransport;
  producers: Map<string, msTypes.Producer>; // producerId -> producer
  consumers: Map<string, msTypes.Consumer>; // consumerId -> consumer
}

export class Room {
  channelId: string;
  peers = new Map<string, Peer>();
  // Sahne (stage) durumu
  stageSpeakers = new Set<string>(); // konuşmacı userId'leri
  stageHands = new Set<string>(); // el kaldıranlar

  constructor(channelId: string) {
    this.channelId = channelId;
  }

  async router(): Promise<msTypes.Router> {
    return await getRouter(this.channelId);
  }

  async addPeer(userId: string, socketId: string, name?: string): Promise<Peer> {
    const peer: Peer = {
      id: userId,
      name,
      socketId,
      producers: new Map(),
      consumers: new Map(),
    };
    this.peers.set(userId, peer);
    log.info({ channelId: this.channelId, userId }, 'peer joined');
    return peer;
  }

  removePeer(userId: string) {
    const peer = this.peers.get(userId);
    if (!peer) return;
    for (const p of peer.producers.values()) p.close();
    for (const c of peer.consumers.values()) c.close();
    peer.sendTransport?.close();
    peer.recvTransport?.close();
    this.peers.delete(userId);
    log.info({ channelId: this.channelId, userId }, 'peer left');
  }

  async createTransport(peer: Peer, direction: 'send' | 'recv') {
    const transport = await createWebRtcTransport(this.channelId);
    if (direction === 'send') peer.sendTransport = transport;
    else peer.recvTransport = transport;
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  // Diğer peer'ler için consumer üret
  otherProducers(excludeUserId: string): { peerId: string; producer: msTypes.Producer }[] {
    const out: { peerId: string; producer: msTypes.Producer }[] = [];
    for (const peer of this.peers.values()) {
      if (peer.id === excludeUserId) continue;
      for (const p of peer.producers.values()) out.push({ peerId: peer.id, producer: p });
    }
    return out;
  }
}

export const rooms = new Map<string, Room>();

export function getRoom(channelId: string): Room {
  let room = rooms.get(channelId);
  if (!room) {
    room = new Room(channelId);
    rooms.set(channelId, room);
  }
  return room;
}

export function listPeerIds(channelId: string): string[] {
  return Array.from(rooms.get(channelId)?.peers.keys() ?? []);
}

// Presence için id + görünen ad — istemci ID→ad lookup'ı gerektirmeden gösterir
export function listPeers(channelId: string): { id: string; name: string }[] {
  return Array.from(rooms.get(channelId)?.peers.values() ?? []).map((p) => ({
    id: p.id,
    name: p.name ?? '',
  }));
}

// === Sunucu susturma / sağırlaştırma (mod yetkisi, enforced) ===
// Discord: bir mod birini sunucuda susturursa, o kişinin mikrofonu SUNUCU SEVİYESİNDE
// duraklatılır (producer.pause) — kimse duyamaz, istemci atlayamaz. Sağırlaştırma ise
// o kişinin TÜM ses tüketicilerini duraklatır (consumer.pause).
const voiceStates = new Map<string, { mute: boolean; deafen: boolean }>(); // userId -> state

export function getVoiceState(userId: string): { mute: boolean; deafen: boolean } {
  return voiceStates.get(userId) ?? { mute: false, deafen: false };
}

export function findUserRoom(userId: string): Room | undefined {
  for (const r of rooms.values()) if (r.peers.has(userId)) return r;
  return undefined;
}

// Bağlı bir peer'e güncel mute/deafen durumunu uygula
export function applyVoiceStateToPeer(userId: string): void {
  const st = getVoiceState(userId);
  const peer = findUserRoom(userId)?.peers.get(userId);
  if (!peer) return;
  for (const p of peer.producers.values()) {
    if ((p.appData as any)?.source === 'mic') {
      (st.mute ? p.pause() : p.resume()).catch(() => {});
    }
  }
  for (const c of peer.consumers.values()) {
    if (c.kind === 'audio') {
      (st.deafen ? c.pause() : c.resume()).catch(() => {});
    }
  }
}

// Mod komutu: durumu kaydet + bağlıysa anında uygula
export function setVoiceState(
  userId: string,
  partial: { mute?: boolean; deafen?: boolean },
): { mute: boolean; deafen: boolean } {
  const cur = getVoiceState(userId);
  const next = { mute: partial.mute ?? cur.mute, deafen: partial.deafen ?? cur.deafen };
  voiceStates.set(userId, next);
  applyVoiceStateToPeer(userId);
  return next;
}
