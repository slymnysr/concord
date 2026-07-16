// Cascade orkestrasyonu — küme olaylarını pipe işlemlerine bağlar.
//
// Akış (A ve B node'ları aynı kanalda peer barındırıyor):
//   1. A'daki peer produce eder → A `producer:created` yayınlar
//   2. B olayı alır → A'ya pipe kurar, producer'ı kendi router'ına taşır (aynı id ile)
//   3. B'deki peer'lar o producer'ı NORMAL bir producer gibi consume eder — cascade
//      istemci için görünmezdir (protokol değişmez)
//   4. A'daki producer kapanınca → `producer:closed` → B aynayı kapatır
import pino from 'pino';
import type { types as msTypes } from 'mediasoup';
import { cluster, type ClusterEvent } from './cluster.js';
import { pipeInRemoteProducer, closePipedProducer, closeChannelLinks } from './pipe.js';
import { getRoom, rooms } from './room.js';

const log = pino({ name: 'voice/cascade', level: 'info' });

type NewProducerNotifier = (channelId: string, payload: {
  producerId: string;
  userId: string;
  kind: msTypes.MediaKind;
  appData?: Record<string, unknown>;
}) => void;

let notify: NewProducerNotifier = () => {};

/** signaling.ts, yerel peer'lara haber vermek için kendi broadcast'ini enjekte eder. */
export function setNewProducerNotifier(fn: NewProducerNotifier): void {
  notify = fn;
}

export function initCascade(): void {
  if (!cluster.enabled) return;

  cluster.onEvent((ev: ClusterEvent) => {
    handleEvent(ev).catch((e) => log.error({ err: String(e), ev }, 'cascade olayı işlenemedi'));
  });
  log.info('cascade dinleyicisi hazır');
}

async function handleEvent(ev: ClusterEvent): Promise<void> {
  // Bu node o kanalda peer barındırmıyorsa uzak producer'ı çekmenin anlamı yok
  // (boşuna pipe + boşuna bant genişliği).
  const room = rooms.get(ev.channelId);
  if (!room || room.peers.size === 0) return;

  switch (ev.type) {
    case 'producer:created': {
      const remote = await cluster.nodeById(ev.nodeId);
      if (!remote) {
        log.warn({ nodeId: ev.nodeId }, 'olayı yayınlayan node kayıtta yok');
        return;
      }
      const producer = await pipeInRemoteProducer(ev.channelId, remote, ev.producerId, ev.userId);
      if (!producer) return;
      // Yerel peer'lara "yeni producer var" de — istemci normal akışla consume eder
      notify(ev.channelId, {
        producerId: ev.producerId,
        userId: ev.userId,
        kind: ev.kind,
        appData: { remoteNodeId: ev.nodeId },
      });
      return;
    }

    case 'producer:closed':
      closePipedProducer(ev.channelId, ev.nodeId, ev.producerId);
      notify(ev.channelId, { producerId: ev.producerId, userId: '', kind: 'audio' });
      return;

    case 'peer:left':
      return;
  }
}

/**
 * Yeni katılan yerel peer, ZATEN var olan uzak producer'ları da görmeli.
 * Olay tabanlı akış yalnızca BUNDAN SONRAKİ producer'ları taşır; katılmadan önce
 * başlamış yayınlar sessizce kaçardı (kullanıcı odaya girer, kimseyi duymaz).
 */
export async function syncExistingRemoteProducers(channelId: string): Promise<void> {
  if (!cluster.enabled) return;
  const remotes = await cluster.remoteNodesFor(channelId);
  for (const remote of remotes) {
    try {
      const list = await fetchRemoteProducers(remote.httpUrl, channelId);
      for (const p of list) {
        const producer = await pipeInRemoteProducer(channelId, remote, p.producerId, p.userId);
        if (producer) notify(channelId, { producerId: p.producerId, userId: p.userId, kind: p.kind });
      }
    } catch (e) {
      log.warn({ err: String(e), remoteNodeId: remote.id }, 'uzak producer listesi alınamadı');
    }
  }
}

async function fetchRemoteProducers(httpUrl: string, channelId: string) {
  const { config } = await import('./config.js');
  const res = await fetch(`${httpUrl}/internal/producers?channel=${encodeURIComponent(channelId)}`, {
    headers: { 'x-voice-cluster-secret': config.cluster.secret },
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`producers → ${res.status}`);
  return (await res.json()) as { producerId: string; userId: string; kind: msTypes.MediaKind }[];
}

/** Kanal bu node'da boşaldı → küme kaydından çık, pipe'ları kapat. */
export async function onChannelEmpty(channelId: string): Promise<void> {
  if (!cluster.enabled) return;
  closeChannelLinks(channelId);
  await cluster.leaveChannel(channelId);
}

export { getRoom };
